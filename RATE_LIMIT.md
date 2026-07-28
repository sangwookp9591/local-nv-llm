# NV Terminal AI NVIDIA Rate Limit 대응 시스템 구현

/orchestration /goal

현재 프로젝트:

```text
/Users/iron/orca/projects/local-llm
```

NV Terminal AI에 NVIDIA Build API의 Rate Limit을 안정적으로 처리하는 요청 제어 계층을 구현한다.

단순히 HTTP 429가 발생했을 때 같은 요청을 즉시 다시 보내는 구조로 구현하지 않는다.

NVIDIA Build 무료 엔드포인트는 모델, API Key, 사용량, 전체 서비스 트래픽에 따라 실제 처리 가능 요청량이 달라질 수 있으므로 고정된 RPM 값에만 의존하지 않는다.

다음 구조를 구현한다.

```text
사용자 입력
   ↓
Agent Runtime
   ↓
Request Scheduler
   ↓
Adaptive Rate Limiter
   ↓
NVIDIA Provider
   ↓
NVIDIA Build API
```

---

## 1. 핵심 원칙

다음 원칙을 반드시 적용한다.

1. `40 RPM`을 NVIDIA의 절대적인 공식 제한으로 하드코딩하지 않는다.
2. 무료 Build API의 안전한 fallback 값으로만 사용한다.
3. 실제 서버 응답과 429 발생 이력을 기반으로 동적으로 조절한다.
4. 모든 NVIDIA 요청은 하나의 중앙 Request Scheduler를 통과한다.
5. Agent Loop가 Provider를 직접 호출하지 못하게 한다.
6. 여러 Agent와 명령이 동일 API Key의 한도를 공유하도록 한다.
7. 429를 일반 네트워크 오류와 동일하게 처리하지 않는다.
8. 429가 발생했다고 세션이나 Agent 작업을 종료하지 않는다.
9. 요청 대기열과 재시도 상태를 터미널에 표시한다.
10. Retry Storm과 무한 재시도를 차단한다.

---

## 2. 기본 Rate Limit 설정

기본 설정은 다음과 같이 구성한다.

```ts
interface NvidiaRateLimitConfig {
  mode: "auto" | "fixed" | "disabled";

  fallbackRpm: number;
  maxRpm: number;
  initialConcurrency: number;
  maxConcurrency: number;

  reduceFactor: number;
  additiveIncrease: number;
  successWindow: number;
  defaultCooldownMs: number;
  ceilingOvershoot: number;

  maxRetries: number;
  maxQueueSize: number;
  queueTimeoutMs: number;

  enableJitter: boolean;
}
```

기본값:

```ts
const DEFAULT_NVIDIA_RATE_LIMIT_CONFIG: NvidiaRateLimitConfig = {
  mode: "auto",

  fallbackRpm: 30,
  maxRpm: 36,

  initialConcurrency: 1,
  maxConcurrency: 2,

  reduceFactor: 0.75,
  additiveIncrease: 1,
  successWindow: 25,
  defaultCooldownMs: 2_000,
  ceilingOvershoot: 0.1,

  maxRetries: 5,
  maxQueueSize: 100,
  queueTimeoutMs: 5 * 60_000,

  enableJitter: true,
};
```

`fallbackRpm: 30`은 무료 Build API를 안정적으로 사용하기 위한 보수적인 CLI 기본값이다.

`maxRpm: 36`은 약 40 RPM으로 관측되는 무료 계정 환경에서 순간적인 요청 집중을 피하기 위한 안전한 상한이다.

이는 NVIDIA가 보장하는 고정 제한이 아니라 NV Terminal AI의 기본 안전 설정이다.

사용자가 실제 계약 또는 배포 환경의 한도를 알고 있을 때만 변경할 수 있게 한다.

---

## 3. 환경 변수 지원

다음 환경 변수를 지원한다.

```bash
NVIDIA_RATE_LIMIT_MODE=auto
NVIDIA_RATE_LIMIT_RPM=30
NVIDIA_RATE_LIMIT_MAX_RPM=36
NVIDIA_MAX_CONCURRENCY=1
NVIDIA_RATE_LIMIT_MAX_RETRIES=5
NVIDIA_RATE_LIMIT_QUEUE_SIZE=100
```

우선순위:

```text
CLI 옵션
→ 프로젝트 설정
→ 환경 변수
→ 사용자 전역 설정
→ 기본값
```

예:

```bash
nv --rate-limit 30
nv --max-concurrency 1
nv --rate-limit-mode auto
```

---

## 4. 전역 요청 스케줄러

모든 NVIDIA API 호출을 하나의 스케줄러로 통합한다.

다음 요청이 전부 동일 스케줄러를 거쳐야 한다.

* 일반 Chat 요청
* Agent Loop 요청
* Plan 요청
* Context Compact 요청
* 모델 검증 요청
* Tool 결과 후속 추론
* Sub-agent 요청
* Retry 요청

금지 구조:

```ts
await nvidiaClient.chat(request);
```

권장 구조:

```ts
await requestScheduler.schedule({
  provider: "nvidia",
  modelId,
  apiKeyFingerprint,
  requestType: "chat",
  priority: "interactive",
  execute: signal => nvidiaClient.chat(request, signal),
});
```

API Key 원문을 Scheduler Key나 로그에 사용하지 않는다.

SHA-256 등으로 fingerprint를 만들어 사용하되 일부만 표시한다.

---

## 5. Rate Limit Domain

Rate Limit은 다음 두 단계로 관리한다.

### Global Domain

동일 API Key의 전체 NVIDIA 요청을 제한한다.

```text
nvidia:{apiKeyFingerprint}
```

### Model Domain

특정 모델의 요청 상태를 별도로 관리한다.

```text
nvidia:{apiKeyFingerprint}:{modelId}
```

최종 허용량은 두 Domain 중 더 보수적인 값을 사용한다.

```ts
effectiveLimit = Math.min(
  globalDomain.currentLimit,
  modelDomain.currentLimit,
);
```

동일 NVIDIA API Key로 여러 모델을 사용하더라도 전체 요청량이 무제한으로 증가하지 않게 한다.

---

## 6. Token Bucket 기반 RPM 제어

RPM 제어에는 Token Bucket 또는 이에 준하는 알고리즘을 사용한다.

예:

```ts
interface TokenBucketState {
  capacity: number;
  tokens: number;
  refillRatePerMs: number;
  lastRefillAt: number;
}
```

30 RPM이면 평균 요청 간격은 약 2초다.

요청이 도착했을 때 Token이 없다면 실패시키지 말고 Queue에서 기다린다.

```text
요청 접수
→ Token 확인
→ Concurrency Permit 확인
→ 실행
→ 결과에 따라 상태 갱신
```

Rate Limit을 피하기 위해 `setTimeout(2000)`을 API 호출 코드 곳곳에 직접 작성하지 않는다.

대기와 실행은 Scheduler가 중앙에서 관리한다.

---

## 7. 요청 우선순위

다음 우선순위를 적용한다.

```ts
type RequestPriority =
  | "interactive"
  | "agent"
  | "background"
  | "maintenance";
```

우선순위:

```text
interactive
→ agent
→ background
→ maintenance
```

예:

* 사용자가 직접 입력한 메시지: `interactive`
* Agent Tool 결과 후 후속 판단: `agent`
* Session Compact: `background`
* Model Health Check: `maintenance`

오래 대기한 낮은 우선순위 요청이 영원히 실행되지 않는 starvation을 방지한다.

---

## 8. 429 응답 처리

HTTP 429가 발생하면 다음 순서로 처리한다.

```text
1. 429 응답 감지
2. 응답 헤더 파싱
3. 해당 Rate Limit Domain 일시 정지
4. 현재 동시성 25% 감소
5. 관측된 실패 한도 기록
6. 대기 중 요청은 Queue 유지
7. Retry-After만큼 대기
8. Jitter 추가
9. 동일 요청 재시도
10. Agent Loop 계속
```

429를 API 원문 오류로 바로 사용자에게 던지지 않는다.

---

## 9. Retry-After 처리

다음 두 형식을 모두 지원한다.

### 초 단위

```http
Retry-After: 5
```

### HTTP Date

```http
Retry-After: Tue, 28 Jul 2026 04:30:00 GMT
```

구현:

```ts
function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = Date.parse(value);

  if (Number.isNaN(date)) {
    return null;
  }

  return Math.max(0, date - now);
}
```

대기 시간 우선순위:

```text
Retry-After
→ Rate Limit Reset Header
→ Adaptive Backoff
→ 기본 2초
```

---

## 10. Optional Rate Limit Header

NVIDIA Build가 항상 Rate Limit Header를 반환한다고 가정하지 않는다.

다음 Header가 실제 응답에 존재할 경우에만 사용한다.

```text
Retry-After
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset
```

Header 이름은 대소문자를 구분하지 않는다.

```ts
interface ParsedRateLimitHeaders {
  limit?: number;
  remaining?: number;
  resetAt?: number;
  retryAfterMs?: number;
}
```

Header가 없으면 오류로 판단하지 않는다.

실제 429, 성공률, 응답 시간과 로컬 요청 기록을 기반으로 동작한다.

---

## 11. AIMD Adaptive Control

동시성 제어에 AIMD 방식을 적용한다.

### 성공 시

25회 연속 성공하면 현재 동시성을 1 증가시킨다.

```ts
if (consecutiveSuccesses >= successWindow) {
  currentConcurrency = Math.min(
    currentConcurrency + additiveIncrease,
    adaptiveCeiling,
  );

  consecutiveSuccesses = 0;
}
```

### 429 발생 시

현재 동시성을 25% 줄인다.

```ts
currentConcurrency = Math.max(
  1,
  Math.floor(currentConcurrency * reduceFactor),
);
```

기본 설정:

```text
reduceFactor: 0.75
successWindow: 25
additiveIncrease: 1
```

무료 Build API의 기본 `maxConcurrency`는 2로 제한한다.

Sub-agent 또는 병렬 요청 기능을 켜더라도 Scheduler가 최종 동시성을 통제한다.

---

## 12. Rate Limit Ceiling 안정화

첫 번째 429가 발생하기 직전의 동시성과 RPM을 관측 한도로 기록한다.

```ts
interface ObservedRateLimitCeiling {
  concurrency?: number;
  rpm?: number;
  observedAt: number;
}
```

회복 시 관측된 한도의 최대 10%까지만 탐색한다.

```ts
adaptiveCeiling = Math.min(
  configuredMax,
  Math.ceil(observedCeiling * 1.1),
);
```

429가 더 낮은 한도에서 다시 발생하면 Ceiling을 낮춘다.

```ts
observedCeiling = Math.min(
  observedCeiling,
  failedLimit,
);
```

관측 결과는 무기한 신뢰하지 않는다.

TTL 기본값:

```text
30분
```

TTL이 지나면 보수적인 초기값부터 다시 학습한다.

---

## 13. Cascade Dampening

여러 In-flight 요청이 동시에 429를 반환해도 각각 25%씩 감축하지 않는다.

429 Burst당 최초 한 번만 감축한다.

```ts
interface RateLimitCascadeState {
  active: boolean;
  startedAt?: number;
  responseCount: number;
}
```

처리:

```text
첫 번째 429
→ 동시성 감소
→ cooldown 시작
→ cascade 활성화

같은 cascade의 추가 429
→ 카운트만 증가
→ 추가 감소 없음

다음 정상 응답
→ cascade 해제
```

이 기능이 없으면 동시성 20에서 429 다섯 개가 동시에 발생했을 때 지나치게 낮은 값으로 축소될 수 있다.

---

## 14. Exponential Backoff와 Jitter

`Retry-After`가 없거나 연속 429가 발생하면 다음 backoff를 사용한다.

```text
2초
4초
8초
16초
32초
```

최대 대기:

```text
60초
```

Jitter:

```ts
function applyJitter(
  delayMs: number,
  ratio = 0.2,
): number {
  const min = delayMs * (1 - ratio);
  const max = delayMs * (1 + ratio);

  return Math.round(
    min + Math.random() * (max - min),
  );
}
```

여러 요청이 정확히 같은 시점에 다시 실행되는 Thundering Herd를 방지한다.

---

## 15. 429와 서버 오류 분리

다음 오류를 동일하게 취급하지 않는다.

### 429 Too Many Requests

원인:

```text
요청량 또는 공유 서비스 한도
```

처리:

```text
Queue 유지
Rate Limit Domain 감속
Retry-After 준수
Adaptive Concurrency 감소
```

### 503 Service Unavailable

원인:

```text
모델 과부하 또는 일시적인 Endpoint 가용성 저하
```

처리:

```text
제한된 횟수의 서버 재시도
2초, 4초, 8초 backoff
계속 실패하면 사용자에게 모델 변경 제안
```

### 504 Gateway Timeout

처리:

```text
최대 2회 재시도
긴 Prompt 또는 출력 길이 점검
다른 모델 선택 가능
```

### 401 또는 403

재시도하지 않는다.

```text
API Key 또는 접근 권한 확인
```

### 400 또는 422

재시도하지 않는다.

```text
요청 파라미터 또는 모델 capability 확인
```

---

## 16. Retry 계층 분리

다음 두 계층을 분리한다.

```text
Transport Retry
Adaptive Throttling
```

### Transport Retry 대상

* 네트워크 연결 종료
* DNS 일시 오류
* 502
* 503
* 504

### Adaptive Throttling 대상

* 429

Transport Retry 계층에서 429를 소비하지 않는다.

429는 반드시 Rate Limit Manager까지 전달되어 현재 용량을 조절하는 데 사용되어야 한다.

---

## 17. Agent Loop Budget

Claude Code나 Codex 형태의 Agent Loop는 한 사용자 요청에서 여러 번 NVIDIA API를 호출할 수 있다.

따라서 요청별 LLM 호출 Budget을 둔다.

```ts
interface AgentRequestBudget {
  maxModelCalls: number;
  warningAt: number;
  maxDurationMs: number;
}
```

기본값:

```ts
const DEFAULT_AGENT_BUDGET = {
  maxModelCalls: 20,
  warningAt: 10,
  maxDurationMs: 30 * 60_000,
};
```

10회가 넘어가면 상태를 표시한다.

```text
Agent 요청 사용량: 11/20
Rate Limit 상태: 정상
```

20회에 도달하면 무한 실행하지 않는다.

```text
이번 작업의 모델 호출 한도 20회에 도달했습니다.

현재까지:
- 파일 12개 확인
- 파일 2개 수정
- 테스트 1회 실행
- 남은 작업 3개

/continue 명령으로 같은 세션을 이어갈 수 있습니다.
```

---

## 18. Sub-agent 제한

무료 NVIDIA Build Endpoint에서는 Sub-agent 병렬 실행을 기본으로 끈다.

```ts
subAgents: {
  enabled: false,
  maxParallel: 1,
}
```

사용자가 명시적으로 활성화할 때만 허용한다.

```bash
nv config set agents.parallel true
nv config set agents.maxParallel 2
```

그래도 전체 요청은 Global Rate Limiter를 통과해야 한다.

Sub-agent별로 별도의 RPM Budget을 주지 않는다.

---

## 19. 터미널 UI

평상시 헤더:

```text
NV Terminal AI (AGENT MODE)
Model: nvidia/nemotron-3-super-120b-a12b
Rate: AUTO · 28/30 RPM · Concurrent 1/1
Directory: /Users/iron/orca/projects/local-llm
```

Queue 대기 중:

```text
◆ NVIDIA 요청 대기 중
  Queue: 2
  예상 시작: 약 3초
  Rate: 30 RPM
```

429 발생:

```text
⚠ NVIDIA API 요청 제한 감지

모델: nvidia/nemotron-3-super-120b-a12b
상태: HTTP 429
동시성: 2 → 1
재시도: 4.3초 후
Queue: 3

현재 세션과 작업 상태는 유지됩니다.
```

503 발생:

```text
⚠ NVIDIA Build Endpoint가 혼잡합니다.

모델: nvidia/nemotron-3-super-120b-a12b
상태: HTTP 503
재시도: 2/3
다음 시도: 8초 후
```

요청이 대기 중이라는 이유로 터미널 입력 전체를 막지 않는다.

단, 동일 세션에서 충돌하는 새로운 Agent 작업은 Queue 또는 별도 세션으로 처리한다.

---

## 20. Slash Command

다음 명령을 추가한다.

```text
/limits
/rate
/queue
/usage
/retries
```

### `/limits`

```text
NVIDIA Rate Limit

Mode: Auto
Configured fallback: 30 RPM
Configured maximum: 36 RPM
Current adaptive limit: 27 RPM
Concurrency: 1
Observed ceiling: 31 RPM
429 responses: 2
503 responses: 1
Cooldown: None
Queue: 0
Last updated: 2026-07-28 14:20:31
```

### `/rate`

```text
/rate auto
/rate fixed 30
/rate status
/rate reset
```

`/rate reset`은 학습한 Adaptive State만 초기화한다.

인증 정보와 설정은 삭제하지 않는다.

### `/queue`

대기 중인 요청을 표시한다.

```text
1. interactive · chat · 1.3초 대기
2. agent · tool continuation · 0.8초 대기
```

### `/usage`

현재 세션의 사용량:

```text
Model calls: 8
Successful: 7
Retried: 1
429: 1
503: 0
Queued time: 4.2초
API execution time: 31.8초
```

---

## 21. CLI 명령

다음 명령도 지원한다.

```bash
nv limits
nv limits status
nv limits reset
nv limits set --rpm 30
nv limits set --mode auto
nv queue
nv usage
nv doctor --rate-limit
```

`nv doctor --rate-limit`은 공격적인 부하 테스트를 하지 않는다.

최대 2~3개의 가벼운 요청만 사용하여 다음을 확인한다.

```text
인증
기본 요청 성공
응답 헤더
429 이력
현재 Scheduler 설정
```

실제 한도를 알아내기 위해 고의적으로 429가 발생할 때까지 요청을 보내지 않는다.

---

## 22. 설정 파일

```json
{
  "provider": "nvidia",
  "rateLimit": {
    "mode": "auto",
    "fallbackRpm": 30,
    "maxRpm": 36,
    "initialConcurrency": 1,
    "maxConcurrency": 2,
    "maxRetries": 5,
    "queueSize": 100
  },
  "agent": {
    "maxModelCallsPerTurn": 20,
    "parallelSubAgents": false
  }
}
```

---

## 23. 세션 복구

429 또는 503로 프로세스가 종료되어도 Agent 작업이 복구 가능해야 한다.

세션에 다음을 저장한다.

```ts
interface PendingProviderRequest {
  requestId: string;
  sessionId: string;
  modelId: string;
  requestType: string;
  attempt: number;
  queuedAt: string;
  lastErrorCode?: number;
  retryAt?: string;
}
```

API Key, Authorization Header, 전체 민감 Payload는 저장하지 않는다.

재실행 시:

```text
이전 세션에 재시도 대기 중인 요청이 있습니다.

세션: 2026-07-28-001
모델: nvidia/nemotron-3-super-120b-a12b
작업: Tool 결과 분석
마지막 오류: HTTP 429

[재개] [세션만 열기] [폐기]
```

---

## 24. Logging 및 Metrics

구조화 로그:

```ts
interface RateLimitLog {
  event:
    | "request_queued"
    | "request_started"
    | "rate_limited"
    | "cooldown_started"
    | "retry_scheduled"
    | "concurrency_reduced"
    | "concurrency_increased"
    | "request_completed"
    | "request_failed";

  modelId: string;
  requestId: string;
  statusCode?: number;
  retryAfterMs?: number;
  queueLength: number;
  concurrency: number;
  currentRpm: number;
}
```

절대 로그에 포함하지 않을 값:

* API Key
* Authorization Header
* 전체 사용자 Prompt
* 전체 Tool 결과
* 민감한 파일 내용

Debug Mode에서도 Key는 마스킹한다.

---

## 25. 권장 구조

```text
src/
├── rate-limit/
│   ├── request-scheduler.ts
│   ├── rate-limit-manager.ts
│   ├── token-bucket.ts
│   ├── adaptive-controller.ts
│   ├── retry-after.ts
│   ├── backoff.ts
│   ├── queue.ts
│   ├── rate-limit-domain.ts
│   ├── state-store.ts
│   └── types.ts
├── providers/
│   └── nvidia/
│       ├── client.ts
│       ├── errors.ts
│       ├── headers.ts
│       └── response-normalizer.ts
├── commands/
│   ├── limits.ts
│   ├── queue.ts
│   └── usage.ts
└── terminal/
    └── rate-limit-status.ts
```

기존 구조가 적합하면 무리하게 전체 폴더를 변경하지 말고 책임만 분리한다.

---

## 26. 단위 테스트

다음을 검증한다.

### Token Bucket

* 정상 Token 소비
* 시간에 따른 refill
* Burst 제한
* Queue 대기
* 취소된 요청 제거
* Queue Timeout

### Retry-After

* 정수 초
* 소수 초
* HTTP Date
* 과거 Date
* 잘못된 값
* Header 없음

### AIMD

* 429 시 25% 감소
* 최소 동시성 1
* 25회 성공 시 1 증가
* 최대 동시성 초과 방지
* Ceiling 10% 제한
* TTL 후 Ceiling 초기화

### Cascade Dampening

* 여러 429 중 한 번만 감소
* 추가 429 카운트
* 성공 후 Cascade 해제

### Backoff

* 2, 4, 8, 16, 32초
* 최대 60초
* Jitter 범위
* Retry-After 우선

### 오류 분리

* 429는 Adaptive Controller
* 503은 Transport Retry
* 401은 재시도하지 않음
* 400은 재시도하지 않음

---

## 27. 통합 테스트

Mock NVIDIA Server를 구성한다.

시나리오:

```text
1. 정상 Streaming 응답
2. 첫 요청 429, 두 번째 성공
3. Retry-After: 5
4. Retry-After HTTP Date
5. 연속 429
6. 동시에 세 요청이 429
7. 503 후 성공
8. 429 후 503 후 성공
9. Queue 중 Ctrl+C
10. Queue Timeout
11. Agent Loop 중 429
12. 세션 종료 후 복구
```

실제 NVIDIA API Key를 CI 테스트에 넣지 않는다.

---

## 28. 터미널 E2E 테스트

다음 시나리오를 검증한다.

```text
nv
→ /limits
→ 현재 Rate Limit 설정 확인
→ Agent 요청 실행
→ Mock Server에서 429 반환
→ 터미널에 대기 상태 표시
→ 세션이 종료되지 않는지 확인
→ Retry-After 후 자동 재시도
→ 응답 성공
→ /usage
→ 429 및 Retry 횟수 확인
```

다음도 검증한다.

```text
nv --rate-limit-mode fixed --rate-limit 20
```

* 1분 동안 20개를 초과해 즉시 전송하지 않는가
* 초과 요청은 Queue에서 기다리는가
* 요청 순서가 보존되는가
* Ctrl+C로 대기 요청을 취소할 수 있는가

---

## 29. 완료 조건

다음 조건을 모두 만족해야 한다.

1. 모든 NVIDIA 요청이 중앙 Scheduler를 통과한다.
2. 40 RPM을 절대적인 공식 제한으로 하드코딩하지 않는다.
3. 기본 안전값으로 30 RPM을 사용한다.
4. HTTP 429 발생 시 세션이 종료되지 않는다.
5. `Retry-After` Header를 우선 준수한다.
6. Header가 없으면 Backoff와 Jitter를 적용한다.
7. 429 발생 시 동시성을 25% 감소시킨다.
8. 25회 연속 성공하면 동시성을 점진적으로 복구한다.
9. 여러 동시 429가 한도를 반복 감축하지 않는다.
10. Agent Loop 재시도가 Retry Storm을 만들지 않는다.
11. 429와 503 처리 계층이 분리되어 있다.
12. Queue와 Retry 상태가 터미널에 표시된다.
13. `/limits`, `/queue`, `/usage`가 동작한다.
14. Sub-agent 병렬 실행은 기본으로 비활성화된다.
15. API Key가 로그 또는 Rate Limit 상태에 노출되지 않는다.
16. Mock 통합 테스트와 터미널 E2E가 통과한다.
17. 실제 수행하지 않은 테스트를 통과했다고 보고하지 않는다.

---

## 30. 최종 보고

작업 완료 후 다음을 보고한다.

```text
1. 기존 NVIDIA API 호출 경로
2. Rate Limit 취약점
3. Scheduler 구조
4. 기본 RPM 및 동시성 설정
5. 429 처리 방식
6. Retry-After 처리 방식
7. AIMD 구현
8. Queue 구현
9. Agent Loop 연동
10. 터미널 UI 변경
11. 생성 및 수정 파일
12. 테스트 결과
13. 실제 429 Mock 실행 결과
14. 남은 제한사항
15. 생성된 Git commit
```

Rate Limit 회피 또는 우회를 구현하지 않는다.

무료 NVIDIA Build API에서 안정적인 처리량을 넘어서는 사용이 필요하면 사용자에게 다음 선택지를 표시한다.

```text
1. 요청 빈도 낮추기
2. 다른 모델로 전환
3. 작업을 여러 세션으로 분리
4. NVIDIA NIM Self-hosted Endpoint 사용
5. Partner Endpoint 사용
```


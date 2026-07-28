# NV Terminal AI — Permission Request, `/goal` Loop, Engineering Harness, Multi-Agent Orchestration 구현

## 목표

현재 NV Terminal AI에서 다음 문제가 반복되고 있다.

```text
list_directory 실패: 디렉터리가 존재하지 않습니다.
list_directory 실패: 접근이 허용되지 않은 경로입니다.
run_command 실패: /zivo/zivo_back: No such file or directory
```

에이전트가 경로 탐색 실패 후 비슷한 명령을 반복하거나, 접근 권한이 없는 경로를 계속 시도하는 문제가 있다.

이를 개선하기 위해 다음 기능을 구현한다.

1. 경로 접근 권한 요청 및 승인 기능
2. 프로젝트 루트 자동 탐색
3. `/goal` 기반 자율 엔지니어링 루프
4. Tool 실행 하네스
5. 실패 복구 및 반복 실행 방지
6. 멀티 에이전트 오케스트레이션
7. Rate Limit 및 동시 실행 제어
8. 전체 실행 상태와 근거를 확인할 수 있는 관찰성

단순히 오류 메시지를 추가하는 수준이 아니라, 실제 개발 작업을 끝까지 수행할 수 있는 **Agent Runtime Architecture**로 개선한다.

---

# 1. 핵심 원칙

## 1.1 권한 우회 금지

에이전트는 OS 권한, 샌드박스 제한, 허용 경로 정책을 임의로 우회하면 안 된다.

다음 행위를 금지한다.

* `sudo`를 통한 무단 권한 상승
* 샌드박스 외부 경로 접근 시도
* 사용자 승인 없이 허용 경로 변경
* 심볼릭 링크를 이용한 허용 경로 탈출
* `..` 경로 조작을 이용한 상위 디렉터리 접근
* 동일한 접근 거부 명령 반복
* 위험 명령을 일반 명령으로 위장하여 실행

접근 권한이 부족한 경우에는 반드시 사용자에게 명시적으로 요청해야 한다.

## 1.2 최소 권한

권한은 필요한 디렉터리와 작업 범위에 한해 최소한으로 요청한다.

잘못된 요청:

```text
전체 파일 시스템 접근을 허용해 주세요.
```

올바른 요청:

```text
프로젝트 분석을 위해 아래 경로에 읽기 권한이 필요합니다.

/Users/iron/Project/ZIVO/ZIVO_BACK

요청 권한: read
요청 이유: Gradle 설정과 docs/carry 문서 분석
예상 작업: 파일 목록 조회 및 소스 읽기
```

## 1.3 실패를 정보로 활용

도구 호출 실패 시 동일한 명령을 반복하지 않는다.

각 실패는 다음 상태로 분류한다.

```text
PATH_NOT_FOUND
PATH_NOT_ALLOWED
PERMISSION_DENIED
COMMAND_NOT_FOUND
COMMAND_FAILED
RATE_LIMITED
TIMEOUT
INVALID_ARGUMENT
USER_APPROVAL_REQUIRED
TRANSIENT_ERROR
UNKNOWN_ERROR
```

---

# 2. 권한 요청 기능

## 2.1 Permission Request 객체

다음 구조를 정의한다.

```ts
type PermissionMode = "read" | "write" | "execute";

interface PermissionRequest {
  id: string;
  requestedPath: string;
  normalizedPath: string;
  modes: PermissionMode[];
  reason: string;
  intendedActions: string[];
  riskLevel: "low" | "medium" | "high";
  requestedBy: string;
  goalId?: string;
  expiresAt?: string;
  status:
    | "pending"
    | "approved"
    | "denied"
    | "expired"
    | "revoked";
}
```

## 2.2 사용자 승인 UX

접근이 거부되면 다음과 같이 표시한다.

```text
NV:

프로젝트 경로에 접근할 수 없습니다.

요청 경로:
  /Users/iron/Project/ZIVO/ZIVO_BACK

필요 권한:
  읽기, 디렉터리 탐색

요청 이유:
  프로젝트 구조 및 docs/carry 문서 분석

위험도:
  낮음

[A] 이번 작업 동안 허용
[S] 현재 세션 동안 허용
[P] 항상 허용
[D] 거부
[E] 경로 수정
```

승인 범위는 다음과 같이 구분한다.

```text
once     현재 한 번의 도구 실행
goal     현재 /goal 작업이 종료될 때까지
session  현재 터미널 세션 동안
always   로컬 정책 파일에 저장
```

`always` 승인은 반드시 사용자에게 영구 저장 사실을 별도로 알려야 한다.

## 2.3 허용 경로 관리 명령어

다음 명령어를 구현한다.

```text
/permissions
/permissions list
/permissions request <path> [read|write|execute]
/permissions allow <request-id> [once|goal|session|always]
/permissions deny <request-id>
/permissions revoke <path>
/permissions clear-session
```

예시:

```text
/permissions request /Users/iron/Project/ZIVO/ZIVO_BACK read
```

## 2.4 경로 검증

모든 도구 실행 전 다음 검사를 수행한다.

1. 입력 경로 정규화
2. `~`, 상대 경로, 환경 변수 확장
3. 실제 경로 확인
4. 심볼릭 링크 해석
5. 허용 루트 내부인지 확인
6. 요청 작업에 필요한 권한 확인
7. 위험 경로인지 확인
8. 승인 범위가 만료되지 않았는지 확인

다음 경로는 기본적으로 높은 위험도로 분류한다.

```text
/
/etc
/bin
/sbin
/usr
/var
/System
/Library
~/.ssh
~/.aws
~/.gnupg
~/.config
```

민감 경로는 단순 승인만으로 접근하지 말고 추가 확인을 요구한다.

---

# 3. 프로젝트 루트 자동 탐색

잘못된 절대 경로를 추측하여 반복 실행하지 않는다.

예를 들어 다음 경로가 실패했다.

```text
/zivo/zivo_back
```

이 경우 다음 순서로 탐색한다.

1. 현재 디렉터리 확인
2. 상위 디렉터리에서 프로젝트 마커 검색
3. 허용된 경로 내에서 제한 깊이 탐색
4. 최근 프로젝트 목록 확인
5. 사용자가 입력한 경로 후보와 유사도 비교
6. 여러 후보가 있으면 사용자에게 선택 요청

프로젝트 마커:

```text
.git
package.json
pnpm-workspace.yaml
build.gradle
build.gradle.kts
settings.gradle
settings.gradle.kts
pom.xml
Cargo.toml
go.mod
pyproject.toml
AGENTS.md
CLAUDE.md
```

지원 명령어:

```text
/project
/project detect
/project list
/project use <path>
/project recent
/project root
```

탐색은 기본적으로 다음 제한을 가진다.

```text
maxDepth: 4
maxEntries: 3_000
maxDurationMs: 5_000
followSymlinks: false
```

경로가 발견되지 않으면 무작정 전체 파일 시스템을 검색하지 않는다.

---

# 4. `/goal` 자율 엔지니어링 루프

## 4.1 명령 형식

```text
/goal <목표>
```

예시:

```text
/goal ZIVO_BACK의 docs/carry를 분석하고 상품 일괄등록 API를 구현한 뒤 테스트까지 완료한다.
```

옵션:

```text
/goal --mode safe <목표>
/goal --mode standard <목표>
/goal --mode autonomous <목표>
/goal --max-steps 30 <목표>
/goal --budget 120000 <목표>
/goal --models nemotron,coder,reviewer <목표>
/goal --dry-run <목표>
```

## 4.2 Goal 상태 모델

```ts
type GoalStatus =
  | "created"
  | "planning"
  | "waiting_permission"
  | "executing"
  | "verifying"
  | "blocked"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

interface Goal {
  id: string;
  objective: string;
  constraints: string[];
  acceptanceCriteria: string[];
  status: GoalStatus;
  currentStep: number;
  maxSteps: number;
  createdAt: string;
  updatedAt: string;
}
```

## 4.3 실행 루프

다음 루프를 구현한다.

```text
OBSERVE
  현재 디렉터리, 프로젝트 상태, 사용자 목표, 이전 실패를 수집

UNDERSTAND
  목표, 제약사항, 완료 기준, 위험 작업을 분석

PLAN
  작업을 작고 검증 가능한 단계로 분해

PERMISSION CHECK
  각 단계에 필요한 파일 및 명령 권한 확인

EXECUTE
  하나의 최소 작업 단위를 실행

VERIFY
  실행 결과, 파일 변경, 테스트 결과, 부작용 확인

REFLECT
  목표에 가까워졌는지 평가

REPLAN
  실패 원인에 따라 계획 수정

COMPLETE
  완료 기준을 모두 충족하면 종료
```

의사 코드:

```ts
while (!goal.isTerminal()) {
  if (stepCount >= maxSteps) {
    return partiallyCompleted("Maximum step count reached");
  }

  const observation = await observe(context);
  const decision = await planner.next(goal, observation);

  if (decision.requiresPermission) {
    await requestPermission(decision.permission);
    goal.status = "waiting_permission";
    break;
  }

  const result = await harness.execute(decision.action);
  const verification = await verifier.verify(result, goal);

  memory.record({
    observation,
    decision,
    result,
    verification,
  });

  if (verification.completed) {
    goal.status = "completed";
    break;
  }

  if (verification.blocked) {
    goal.status = "blocked";
    break;
  }

  await replanner.update(goal, verification);
}
```

## 4.4 완료 기준

에이전트가 단순히 파일을 수정했다는 이유로 작업을 완료 처리하면 안 된다.

개발 작업은 최소한 다음을 확인한다.

```text
- 요구사항 반영
- 대상 파일 변경 확인
- 빌드 성공
- 관련 테스트 성공
- 정적 분석 또는 타입 검사 성공
- 예상하지 않은 대규모 변경 없음
- 기존 기능 회귀 여부 확인
- 변경 내용 요약
- 실행하지 못한 검증 항목 명시
```

## 4.5 중단 명령

```text
/goal status
/goal pause
/goal resume
/goal cancel
/goal history
/goal inspect <goal-id>
```

---

# 5. Engineering Harness

LLM이 직접 도구를 무제한 호출하지 않도록 실행 하네스를 둔다.

## 5.1 실행 파이프라인

```text
Agent Decision
    ↓
Action Validator
    ↓
Permission Guard
    ↓
Risk Classifier
    ↓
Rate Limit Guard
    ↓
Tool Executor
    ↓
Result Normalizer
    ↓
Verifier
    ↓
Trace Store
```

## 5.2 Tool Action 구조

```ts
interface ToolAction {
  id: string;
  goalId?: string;
  agentId: string;
  tool:
    | "list_directory"
    | "read_file"
    | "write_file"
    | "patch_file"
    | "run_command"
    | "search_files";
  arguments: Record<string, unknown>;
  reason: string;
  expectedOutcome: string;
  riskLevel: "low" | "medium" | "high";
  timeoutMs: number;
  retryPolicy: RetryPolicy;
}
```

## 5.3 명령 실행 정책

명령은 가능한 경우 shell 문자열이 아니라 argument 배열로 실행한다.

잘못된 방식:

```ts
exec(`ls -la ${userPath}`);
```

권장 방식:

```ts
spawn("ls", ["-la", normalizedPath], {
  shell: false,
});
```

다음 명령은 위험 명령으로 분류하고 별도 승인을 받는다.

```text
rm
rmdir
mv
chmod
chown
kill
pkill
docker system prune
git reset --hard
git clean
git push --force
DROP
TRUNCATE
DELETE without WHERE
```

## 5.4 재시도 정책

모든 실패를 재시도해서는 안 된다.

```ts
interface RetryPolicy {
  maxAttempts: number;
  retryableErrors: string[];
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}
```

기본 정책:

```text
PATH_NOT_FOUND        재시도 금지
PATH_NOT_ALLOWED      재시도 금지, 권한 요청
PERMISSION_DENIED     재시도 금지, 권한 요청
INVALID_ARGUMENT      재시도 금지
RATE_LIMITED          Retry-After 기반 재시도
TIMEOUT               최대 1회 재시도
TRANSIENT_ERROR       지수 백오프로 최대 2회
COMMAND_FAILED        원인 분석 후 다른 명령만 허용
```

동일한 정규화된 명령과 인자를 연속 실행하지 않는다.

```text
fingerprint =
  toolName +
  normalizedArguments +
  workingDirectory
```

동일 fingerprint가 동일 오류로 2회 실패하면 circuit breaker를 연다.

---

# 6. 반복 실행 방지

현재처럼 `list_directory`를 여러 번 호출하고 실패하는 문제를 방지한다.

다음 정보를 실행 메모리에 저장한다.

```ts
interface FailureMemory {
  actionFingerprint: string;
  errorType: string;
  targetPath?: string;
  attempts: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  resolution?: string;
}
```

다음 조건에서는 실행을 차단한다.

```text
- 동일 경로가 존재하지 않는다는 결과가 이미 확인됨
- 동일 경로가 접근 거부 상태이며 새 승인이 없음
- 동일 명령이 같은 인자로 반복됨
- 동일 접근 요청이 사용자가 거부한 상태
- circuit breaker가 열린 도구 또는 경로
```

차단 시 에이전트에게 다음처럼 반환한다.

```text
ACTION_BLOCKED_DUPLICATE_FAILURE

이 작업은 동일한 조건에서 이미 실패했습니다.

이전 오류:
  PATH_NOT_ALLOWED

대상:
  /Users/iron/Project/ZIVO/ZIVO_BACK

필요 조치:
  권한 요청 또는 다른 경로 선택
```

---

# 7. 멀티 에이전트 오케스트레이션

## 7.1 기본 역할

멀티 에이전트는 단순히 여러 모델에게 같은 질문을 보내는 방식으로 구현하지 않는다.

각 에이전트에 명확한 책임을 부여한다.

```text
Orchestrator
  전체 목표, 작업 그래프, 예산, 충돌을 관리

Planner
  목표를 실행 가능한 작업으로 분해

Explorer
  프로젝트 구조, 관련 파일, 의존성을 탐색

Implementer
  실제 코드 변경 수행

Reviewer
  요구사항 누락, 코드 품질, 사이드 이펙트 검토

Test Agent
  빌드, 테스트, 타입 검사, E2E 검증

Security Guard
  권한, 위험 명령, 경로 탈출, 민감정보 검사

Synthesizer
  여러 에이전트 결과를 종합하여 최종 결론 생성
```

## 7.2 명령어

```text
/orchestration on
/orchestration off
/orchestration status
/orchestration agents
/orchestration plan
/orchestration inspect <task-id>
```

`/goal`과 함께 사용할 수 있게 한다.

```text
/orchestration on
/goal ZIVO_BACK의 Excel 업로드 구조를 분석하고 안정적인 대량 처리 구조로 개선한다.
```

## 7.3 작업 그래프

```ts
interface AgentTask {
  id: string;
  goalId: string;
  title: string;
  description: string;
  role: string;
  dependencies: string[];
  inputFiles: string[];
  outputFiles: string[];
  status:
    | "pending"
    | "ready"
    | "running"
    | "blocked"
    | "completed"
    | "failed";
  assignedAgent?: string;
}
```

예시:

```text
T1 프로젝트 구조 탐색
  ↓
T2 관련 API와 DB 구조 분석
  ↓
T3 구현 계획 작성
  ↓
T4 코드 구현
  ↓
T5 테스트 실행
  ↓
T6 독립 리뷰
  ↓
T7 수정 및 최종 검증
```

독립적으로 수행할 수 있는 작업만 병렬화한다.

```text
T2 API 분석 ─┐
             ├─ T4 구현
T3 DB 분석 ──┘
```

## 7.4 파일 소유권

여러 에이전트가 같은 파일을 동시에 수정하면 안 된다.

```ts
interface FileLease {
  path: string;
  ownerAgentId: string;
  taskId: string;
  acquiredAt: string;
  expiresAt: string;
}
```

규칙:

```text
- 파일 단위 write lease 적용
- read는 병렬 허용
- write는 단일 에이전트만 허용
- lease 충돌 시 작업 대기
- patch 적용 전 파일 hash 확인
- 변경된 파일이면 재베이스 후 다시 patch 생성
```

## 7.5 에이전트 간 전달

에이전트가 전체 대화 내용을 그대로 전달하지 않는다.

구조화된 handoff를 사용한다.

```ts
interface AgentHandoff {
  taskId: string;
  summary: string;
  findings: string[];
  filesInspected: string[];
  filesChanged: string[];
  commandsExecuted: string[];
  unresolvedQuestions: string[];
  risks: string[];
  recommendedNextActions: string[];
}
```

## 7.6 합의 방식

중요한 설계 판단은 다음 방식으로 검증한다.

```text
1. Planner가 초안 제시
2. Reviewer가 반례와 위험 분석
3. Implementer가 구현 가능성 검토
4. Synthesizer가 최종안 결정
```

단순 다수결이 아니라 근거, 테스트 가능성, 프로젝트 일관성을 기준으로 결정한다.

---

# 8. 모델 라우팅

모델별 역할을 설정할 수 있게 한다.

예시:

```yaml
models:
  orchestrator:
    model: nvidia/nemotron-3-super-120b-a12b

  planner:
    model: nvidia/nemotron-3-super-120b-a12b

  explorer:
    model: fast-tool-model

  implementer:
    model: code-specialized-model

  reviewer:
    model: reasoning-model

  tester:
    model: fast-tool-model
```

라우팅 기준:

```text
- 프로젝트 탐색: 빠르고 저렴한 모델
- 아키텍처 판단: 추론 성능이 높은 모델
- 코드 구현: 코드 특화 모델
- 리뷰: 구현 담당과 다른 모델
- 단순 로그 요약: 소형 모델
```

동일 모델만 사용할 수 있는 환경이라면 서로 다른 system role과 독립 컨텍스트로 역할을 분리한다.

---

# 9. Rate Limit 및 동시성 제어

NVIDIA API 또는 모델 제공자의 Rate Limit을 런타임에서 관리한다.

## 9.1 제한 단위

```text
requests per minute
tokens per minute
concurrent requests
requests per day
model별 제한
```

## 9.2 Rate Limit 상태

```ts
interface RateLimitState {
  model: string;
  remainingRequests?: number;
  remainingTokens?: number;
  resetAt?: string;
  retryAfterMs?: number;
  activeRequests: number;
}
```

## 9.3 실행 정책

```text
- 모델별 concurrency semaphore
- 전역 concurrency 제한
- Retry-After 헤더 우선 적용
- 429 발생 시 지수 백오프와 jitter
- 동일 요청 즉시 반복 금지
- 사용자 입력 요청은 백그라운드 작업보다 우선
- 테스트와 리뷰 작업은 제한 상황에서 순차 실행
```

기본 설정 예시:

```yaml
orchestration:
  globalConcurrency: 3
  perModelConcurrency: 1
  maxQueuedTasks: 20

rateLimit:
  maxRetries: 3
  baseBackoffMs: 1000
  maxBackoffMs: 30000
  jitter: true
```

Rate Limit으로 일부 에이전트를 실행할 수 없으면 전체 작업을 실패 처리하지 않는다.

```text
- 필수 에이전트: 대기 후 재시도
- 선택 리뷰 에이전트: 생략 가능
- 생략한 검증 항목은 최종 결과에 명시
```

---

# 10. 컨텍스트 및 메모리 관리

## 10.1 세션 메모리

다음 정보를 저장한다.

```text
- 현재 프로젝트 루트
- 승인된 경로
- 활성 goal
- 작업 계획
- 실패한 도구 호출
- 변경한 파일
- 실행한 테스트
- 에이전트별 결과
```

## 10.2 영구 설정

프로젝트 내부에 다음 파일을 선택적으로 지원한다.

```text
.nv/config.yaml
.nv/permissions.yaml
.nv/goals/
.nv/traces/
```

민감한 API 키, 토큰, 개인 정보는 저장하지 않는다.

## 10.3 SSoT

프로젝트 상태는 단일 상태 저장소에서 관리한다.

```text
Goal Store
Task Graph Store
Permission Store
Tool Trace Store
File Lease Store
Rate Limit Store
```

UI 출력과 에이전트 컨텍스트는 이 상태를 기준으로 생성한다.

서로 다른 에이전트가 각자 별도의 상태를 추측해서는 안 된다.

---

# 11. 관찰성

## 11.1 실행 로그

사용자에게 모든 내부 추론을 출력하지 말고, 실행에 필요한 근거와 결과만 표시한다.

```text
[GOAL][g-102] 프로젝트 루트 탐색 시작
[TOOL][list_directory] /Users/iron/Project/ZIVO
[RESULT][SUCCESS] 8개 항목 확인
[AGENT][explorer] ZIVO_BACK 후보 발견
[PERMISSION][REQUESTED] ZIVO_BACK 읽기 권한
[TOOL][BLOCKED] 사용자 승인 대기
```

## 11.2 상태 화면

```text
/goal status
```

출력 예시:

```text
Goal: ZIVO_BACK Carry API 분석 및 구현
상태: executing
진행률: 5/9

완료:
  ✓ 프로젝트 탐색
  ✓ API 구조 분석
  ✓ DB 구조 분석
  ✓ 구현 계획
  ✓ Service 구현

진행 중:
  → Controller 구현

대기:
  - 통합 테스트
  - 독립 리뷰
  - 최종 검증

권한:
  /Users/iron/Project/ZIVO/ZIVO_BACK
  read/write, goal scope

에이전트:
  explorer     completed
  planner      completed
  implementer  running
  reviewer     waiting
```

---

# 12. 사용자 출력 규칙

도구 실행 전후에 불필요한 로그를 반복하지 않는다.

잘못된 출력:

```text
◆ list_directory 실행 중...
✓ list_directory 성공

◆ list_directory 실행 중...
✓ list_directory 성공

◆ list_directory 실행 중...
✗ list_directory 실패
```

개선된 출력:

```text
NV:

프로젝트 루트를 탐색했습니다.

확인된 후보:
1. /Users/iron/Project/ZIVO/ZIVO_BACK
2. /Users/iron/Project/ZIVO/ZIVO_ADMIN

현재 목표와 가장 관련 있는 경로는 ZIVO_BACK입니다.

해당 경로는 아직 허용되지 않았습니다.
읽기 권한을 요청합니다.
```

도구 실행 세부 로그는 verbose 모드에서만 표시한다.

```text
/verbose on
/verbose off
```

기본 모드에서는 단계별 핵심 진행 상황만 보여준다.

---

# 13. 안전 모드

## Safe Mode

```text
- 읽기 작업 위주
- 파일 변경 전 사용자 승인
- 명령 실행 전 사용자 승인
- Git 변경 금지
```

## Standard Mode

```text
- 허용된 프로젝트 내부 읽기/쓰기
- 테스트 및 빌드 자동 실행
- 위험 명령만 추가 승인
- Git commit은 사용자 승인 필요
```

## Autonomous Mode

```text
- 명시된 goal 범위 내 파일 수정과 테스트 자동 수행
- 위험 명령, 외부 전송, 영구 권한, Git push는 승인 필요
- 완료 기준 충족까지 반복
```

어떤 모드에서도 다음은 자동 실행하지 않는다.

```text
git push
git push --force
운영 DB 변경
운영 배포
비밀정보 출력
영구 파일 삭제
외부 서비스 데이터 변경
```

---

# 14. 예상 실행 예시

사용자:

```text
/orchestration on
/goal ZIVO_BACK의 docs/carry를 분석하고 상품 일괄등록 API 구조를 점검해줘.
```

NV:

```text
Goal을 생성했습니다.

목표:
  docs/carry 기반 상품 일괄등록 API 구조 점검

실행 계획:
  1. 프로젝트 루트 확인
  2. 관련 문서 탐색
  3. Controller, Service, Mapper, DB 구조 분석
  4. 대량 Excel 처리 안정성 검토
  5. 문제점과 개선안 작성
  6. 독립 리뷰

프로젝트 후보:
  /Users/iron/Project/ZIVO/ZIVO_BACK

필요 권한:
  read

현재 goal 동안 이 경로의 읽기 권한을 허용하시겠습니까?
```

승인 후:

```text
NV:

분석을 완료했습니다.

확인 결과:
  - 업로드 요청에서 파일 전체를 메모리에 적재하고 있음
  - 행 단위 오류 격리 구조가 없음
  - 중복 바코드 정책이 명확하지 않음
  - 재처리 가능한 job 식별자가 없음
  - 대량 데이터 입력 시 단일 트랜잭션으로 처리됨

권장 구조:
  Upload Job
    → Streaming Parser
    → Validation
    → Chunk Processing
    → Row Result
    → Error Report

검증:
  ✓ 관련 문서 확인
  ✓ 구현 코드 확인
  ✓ DB 구조 확인
  ✓ Reviewer 교차 검토
```

---

# 15. 구현 순서

다음 순서로 작업한다.

## Phase 1. Tool 오류 모델 표준화

* 공통 ToolResult 구현
* 오류 타입 분류
* 경로 정규화
* 동일 실패 반복 차단

## Phase 2. Permission Manager

* PermissionRequest
* 승인 범위
* 권한 저장소
* CLI 승인 UX
* path guard

## Phase 3. Project Discovery

* 프로젝트 마커 탐색
* 최근 프로젝트
* 후보 선택
* 탐색 제한

## Phase 4. Goal Runtime

* Goal 상태 머신
* Plan/Execute/Verify 루프
* max step
* pause/resume/cancel

## Phase 5. Engineering Harness

* Action Validator
* Risk Classifier
* Command Sandbox
* Retry Manager
* Circuit Breaker

## Phase 6. Multi-Agent Orchestrator

* 역할별 에이전트
* Task DAG
* File Lease
* Handoff
* 결과 합성

## Phase 7. Rate Limit Controller

* 모델별 동시성
* 429 처리
* Retry-After
* Queue priority

## Phase 8. Observability

* goal status
* trace
* structured logging
* verbose mode

---

# 16. 테스트 요구사항

## 단위 테스트

```text
- 경로 정규화
- 허용 루트 검사
- 심볼릭 링크 탈출 방지
- 승인 scope 만료
- 위험 명령 분류
- 오류 타입 변환
- 재시도 가능 오류 판별
- fingerprint 생성
- circuit breaker
- task dependency
- file lease
- rate limiter
```

## 통합 테스트

```text
1. 존재하지 않는 경로 접근
   → PATH_NOT_FOUND
   → 같은 명령 재실행 금지

2. 허용되지 않은 경로 접근
   → 권한 요청 생성
   → 승인 전 도구 실행 금지

3. goal 범위 승인
   → goal 종료 후 권한 만료

4. 두 에이전트가 동일 파일 수정
   → 한 에이전트만 lease 획득

5. 429 응답
   → Retry-After만큼 대기
   → concurrency 감소

6. 일부 에이전트 실패
   → 전체 goal 상태 유지
   → 대체 에이전트 또는 순차 실행

7. 구현 완료
   → 빌드와 테스트 결과가 있어야 completed 처리
```

## E2E 시나리오

```text
/orchestration on
/goal 현재 프로젝트의 테스트 실패 원인을 찾아 수정한다.
```

검증 항목:

```text
- 프로젝트 자동 탐색
- 권한 요청
- 실패 테스트 실행
- 관련 파일 분석
- 코드 수정
- 테스트 재실행
- Reviewer 검토
- 최종 결과 요약
```

---

# 17. 완료 조건

다음 조건을 모두 충족해야 한다.

```text
- 접근 불가 경로를 반복 호출하지 않는다.
- 경로 권한이 필요하면 사용자에게 요청한다.
- 승인 범위가 once, goal, session, always로 구분된다.
- `/goal`이 계획, 실행, 검증, 재계획 루프를 수행한다.
- 동일 실패를 감지하고 circuit breaker를 연다.
- 멀티 에이전트가 역할별로 분리된다.
- 동일 파일 동시 수정이 차단된다.
- Rate Limit과 동시 실행 제한이 적용된다.
- 빌드 및 테스트 없이 완료 처리하지 않는다.
- 사용자에게 작업 상태와 실패 원인이 명확하게 표시된다.
- 위험 명령이나 권한 상승을 임의로 실행하지 않는다.
```

---

# 18. 작업 수행 지침

현재 소스 구조를 먼저 분석하고 기존 인터페이스와 명명 규칙을 최대한 재사용한다.

대규모 재작성보다 다음 원칙으로 구현한다.

```text
1. 기존 Tool Executor에 공통 하네스를 추가
2. 기존 CLI 명령 파서에 /goal, /permissions, /orchestration 추가
3. 상태 머신과 저장소를 독립 모듈로 분리
4. 각 Phase별 테스트 작성
5. 작은 단위로 커밋
6. 마지막에 전체 E2E 실행
```

각 단계가 끝날 때 다음을 기록한다.

```text
- 변경 파일
- 구현 내용
- 테스트 결과
- 남은 위험
- 다음 단계
```

추측으로 존재하지 않는 경로나 클래스를 생성하지 말고 실제 저장소 구조를 확인한 뒤 적용한다.

구현 중 권한이나 정보가 부족하면 같은 작업을 반복하지 말고 `USER_APPROVAL_REQUIRED` 또는 `BLOCKED` 상태로 전환한다.


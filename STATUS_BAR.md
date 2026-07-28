# NV Terminal AI — 실시간 Status Bar 및 Agent Activity UI 추가 요구사항

기존 `/goal`, Permission Manager, Engineering Harness, Multi-Agent Orchestration에 **실시간 터미널 Status Bar**를 추가한다.

Status Bar는 장식용 UI가 아니라 다음 정보를 사용자가 즉시 확인하고, 실행 이상을 감지하며, 필요할 경우 개입할 수 있는 **Runtime Control Surface**로 구현한다.

---

# 1. Status Bar 목표

사용자는 터미널을 보는 것만으로 다음 질문에 답할 수 있어야 한다.

```text
- 현재 어떤 모델이 응답하고 있는가?
- 현재 어떤 Goal을 수행하고 있는가?
- 어떤 에이전트들이 활성화되어 있는가?
- 각 에이전트는 무슨 작업을 수행하고 있는가?
- 현재 몇 개의 작업이 병렬 실행되고 있는가?
- API Rate Limit이 얼마나 남았는가?
- 토큰을 얼마나 사용했는가?
- 현재 권한 요청이나 사용자 입력을 기다리고 있는가?
- 지금 작업이 정상적으로 진행되고 있는가?
- 실패 또는 재시도가 발생했는가?
```

---

# 2. 기본 Status Bar

터미널 최하단에 고정된 단일 행 Status Bar를 렌더링한다.

기본 예시:

```text
 NV │ GOAL RUNNING 6/12 │ MODEL nemotron-3-super-120b │ AGENTS 3/5 │ RPM 18/40 │ TPM 72K/120K │ CTX 41% │ ⚠ 1 │ 00:02:31
```

좁은 터미널에서는 자동으로 축약한다.

```text
 NV │ RUN 6/12 │ NEMOTRON │ A 3/5 │ R 18/40 │ T 72K/120K │ C 41% │ ⚠1
```

아주 좁은 환경에서는 최소 정보만 표시한다.

```text
 RUN 6/12 │ A3 │ RL 45% │ ⚠1
```

Status Bar는 ANSI cursor control을 사용하여 화면 하단에 고정하되, ANSI를 지원하지 않는 터미널에서는 일반 로그 기반 fallback을 제공한다.

---

# 3. Status Bar 필드

## 3.1 Runtime 상태

다음 상태를 표시한다.

```text
IDLE
PLANNING
RUNNING
VERIFYING
WAITING
BLOCKED
RATE_LIMITED
PAUSED
COMPLETED
FAILED
```

표시 예시:

```text
GOAL RUNNING
GOAL VERIFYING
WAITING PERMISSION
RATE LIMITED
BLOCKED
```

색상 권장:

```text
IDLE          회색
PLANNING      파랑
RUNNING       초록
VERIFYING     청록
WAITING       노랑
BLOCKED       주황
RATE_LIMITED  보라
FAILED        빨강
COMPLETED     밝은 초록
```

색상만으로 상태를 표현하지 말고 반드시 텍스트도 함께 표시한다.

---

## 3.2 Goal 진행 상태

현재 Goal의 진행률을 표시한다.

```text
GOAL 6/12
```

가능한 경우 백분율도 지원한다.

```text
GOAL 6/12 50%
```

단, 단순 tool call 개수를 진행률로 사용하면 안 된다.

진행률은 Task DAG를 기준으로 계산한다.

```ts
interface GoalProgress {
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  blockedTasks: number;
  failedTasks: number;
  progressPercent: number;
}
```

가중치가 다른 작업을 지원한다.

```ts
interface WeightedTaskProgress {
  taskId: string;
  weight: number;
  completedRatio: number;
}
```

진행률 계산:

```text
sum(task.weight × task.completedRatio)
──────────────────────────────────────
sum(task.weight)
```

계획이 변경되면 전체 task 수가 변경될 수 있으므로 다음처럼 표시한다.

```text
GOAL 6/12 → 6/15
```

사용자에게 진행률이 감소한 이유를 이벤트 로그에 남긴다.

```text
[GOAL] 검증 과정에서 회귀 테스트 3개가 추가되었습니다.
```

---

## 3.3 현재 모델

현재 사용자 응답 또는 Orchestrator가 사용하는 모델을 표시한다.

```text
MODEL nvidia/nemotron-3-super-120b-a12b
```

축약 표시:

```text
MODEL nemotron-3-super-120b
```

여러 모델을 사용하는 경우 대표 모델과 활성 모델 수를 표시한다.

```text
MODELS nemotron +2
```

상세 보기에서는 다음 정보를 제공한다.

```text
Orchestrator  nvidia/nemotron-3-super-120b-a12b
Planner       nvidia/nemotron-3-super-120b-a12b
Explorer      nvidia/llama-3.3-nemotron-super
Implementer   nvidia/qwen3-coder
Reviewer      nvidia/llama-3.1-nemotron-ultra
Tester        local/tool-agent
```

모델이 fallback되면 즉시 표시한다.

```text
MODEL qwen3-coder → nemotron-super
```

fallback 이유도 기록한다.

```text
[MODEL][FALLBACK]
qwen3-coder가 Rate Limit에 도달하여 nemotron-super로 전환했습니다.
```

---

# 4. Agent 상태 표시

## 4.1 요약 표시

Status Bar에는 활성 에이전트 수를 표시한다.

```text
AGENTS 3/5
```

의미:

```text
3 = 현재 실행 중인 에이전트
5 = 현재 Goal에 배치된 전체 에이전트
```

상태별 표시도 지원한다.

```text
A 3▶ 1⏸ 1✓
```

```text
▶ 실행 중
⏸ 대기 또는 Rate Limit
✓ 완료
✗ 실패
! 사용자 입력 필요
```

---

## 4.2 Agent Activity Panel

Status Bar 위에 선택적으로 Agent Activity Panel을 렌더링한다.

```text
┌─ Active Agents ───────────────────────────────────────────────────────────────┐
│ ▶ explorer-01     nemotron-super   프로젝트 구조 탐색                 72%    │
│ ▶ implementer-01  qwen3-coder      ExcelUploadService 구현             41%    │
│ ⏸ reviewer-01     nemotron-ultra   implementer 결과 대기                      │
│ ✓ planner-01      nemotron-super   실행 계획 및 Task DAG 생성          완료   │
│ ! security-01     policy-engine    경로 쓰기 권한 승인 대기                    │
└───────────────────────────────────────────────────────────────────────────────┘
```

각 에이전트 행에는 다음을 표시한다.

```text
- 상태 아이콘
- Agent ID
- 역할
- 사용 모델
- 현재 작업
- 진행률
- 실행 시간
- Tool 호출 상태
- 대기 이유
```

상세 예시:

```text
▶ implementer-01
  Role: Implementer
  Model: nvidia/qwen3-coder
  Task: ProductBulkUploadService 구현
  Tool: patch_file
  File: src/main/.../ProductBulkUploadService.java
  Progress: 41%
  Duration: 00:01:17
```

---

## 4.3 에이전트 상태 모델

```ts
type AgentRuntimeStatus =
  | "initializing"
  | "planning"
  | "running"
  | "calling_tool"
  | "waiting_dependency"
  | "waiting_permission"
  | "rate_limited"
  | "retrying"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

interface AgentRuntimeView {
  agentId: string;
  role: string;
  model: string;
  status: AgentRuntimeStatus;
  taskId?: string;
  taskTitle?: string;
  activeTool?: string;
  activeFile?: string;
  progressPercent?: number;
  startedAt?: string;
  elapsedMs?: number;
  waitingReason?: string;
  retryCount: number;
}
```

---

# 5. Rate Limit 표시

## 5.1 필수 표시 항목

Status Bar에 다음 제한 정보를 표시한다.

```text
RPM 18/40
TPM 72K/120K
CONCURRENCY 3/5
QUEUE 4
RESET 00:18
```

의미:

```text
RPM          최근 1분간 요청 수 / 허용 요청 수
TPM          최근 1분간 토큰 수 / 허용 토큰 수
CONCURRENCY  현재 실행 요청 수 / 동시 실행 제한
QUEUE        모델 호출 대기열의 요청 수
RESET        제한 초기화까지 남은 시간
```

제공자가 Rate Limit 전체 값을 제공하지 않으면 추정값을 실제 값처럼 표시하지 않는다.

```text
RPM 18/?
TPM 72K/?
RESET unknown
```

추정값인 경우 반드시 `~`를 붙인다.

```text
TPM ~72K/120K
```

---

## 5.2 Rate Limit 단계

```ts
type RateLimitLevel =
  | "normal"
  | "warning"
  | "critical"
  | "exhausted";
```

기본 기준:

```text
normal     사용량 0~69%
warning    사용량 70~84%
critical   사용량 85~99%
exhausted  100% 또는 HTTP 429
```

표시 예시:

```text
RL 42% NORMAL
RL 78% WARN
RL 93% CRITICAL
RL 100% LIMITED
```

한도가 임박하면 Status Bar만 변경하지 말고 Orchestrator의 실행 전략도 변경한다.

```text
70% 이상:
- 선택적 분석 에이전트의 신규 실행 제한
- 캐시된 결과 우선 사용
- 중복 모델 호출 제거

85% 이상:
- 독립적인 작업만 최소 병렬 실행
- 저비용 모델로 라우팅
- 긴 컨텍스트 전달 제한
- Reviewer 실행을 필수 항목 중심으로 축소

100% 또는 429:
- 해당 모델 신규 요청 중지
- Retry-After 적용
- 다른 모델 또는 로컬 도구로 fallback
- 실행 중인 Tool 작업은 유지
- 사용자 입력 처리 우선
```

---

## 5.3 모델별 Rate Limit

멀티 모델 환경에서는 모델별 한도를 각각 관리한다.

```text
┌─ Model Limits ────────────────────────────────────────────────────────────────┐
│ nemotron-super   RPM 18/40   TPM 72K/120K   Active 1/2   Normal              │
│ qwen3-coder      RPM 29/30   TPM 94K/100K   Active 1/1   Critical            │
│ nemotron-ultra   RPM 10/20   TPM 45K/80K    Active 1/1   Warning             │
└───────────────────────────────────────────────────────────────────────────────┘
```

내부 상태 모델:

```ts
interface ModelRuntimeState {
  provider: string;
  model: string;
  requestsUsed?: number;
  requestsLimit?: number;
  tokensUsed?: number;
  tokensLimit?: number;
  concurrentRequests: number;
  concurrencyLimit?: number;
  queuedRequests: number;
  retryAfterMs?: number;
  resetAt?: string;
  level: RateLimitLevel;
  lastUpdatedAt: string;
}
```

Rate Limit 정보는 다음 우선순위로 수집한다.

```text
1. API Response Header
2. Provider 응답 body
3. 로컬 Token Bucket 카운터
4. Sliding Window 요청 기록
5. 알 수 없는 값은 unknown으로 표시
```

---

# 6. Token 및 Context 표시

현재 실행의 토큰 사용량과 Context Window를 표시한다.

```text
TOKENS 72K
CTX 41%
```

상세 보기:

```text
Input Tokens     58,210
Output Tokens    13,940
Cached Tokens    34,100
Context Used     81,240 / 196,608
Context Usage    41.3%
```

멀티 에이전트 환경에서는 전체와 에이전트별 사용량을 구분한다.

```text
TOTAL TOKENS 183K

planner-01       21K
explorer-01      38K
implementer-01   74K
reviewer-01      31K
tester-01        19K
```

Context가 임계치에 도달하면 다음 상태를 표시한다.

```text
CTX 72% WARN
CTX 88% COMPACTING
CTX 95% CRITICAL
```

Context 압축 중에는 다음처럼 표시한다.

```text
MEMORY COMPACTING
```

압축 후에는 보존된 항목을 로그에 남긴다.

```text
[CONTEXT]
대화 및 실행 로그를 압축했습니다.

보존:
- Goal
- Acceptance Criteria
- 현재 Task DAG
- 변경 파일
- 테스트 결과
- 미해결 문제
- 권한 상태
```

---

# 7. 현재 Tool과 작업 파일 표시

현재 실행 중인 Tool을 표시한다.

```text
TOOL patch_file
```

작업 파일도 축약해서 표시한다.

```text
FILE ProductBulkUploadService.java
```

전체 Status Bar 예시:

```text
 NV │ RUN 6/12 │ MODEL qwen3-coder │ A 3/5 │ TOOL patch_file │ ProductBulkUploadService.java │ RL 78% │ 02:31
```

파일 경로가 길면 프로젝트 루트 기준 상대 경로를 사용한다.

잘못된 표시:

```text
/Users/iron/Project/ZIVO/ZIVO_BACK/src/main/java/com/zivo/carry/product/service/ProductBulkUploadService.java
```

권장 표시:

```text
carry/product/service/ProductBulkUploadService.java
```

---

# 8. Permission 상태 표시

권한 승인이 필요한 경우 Status Bar에서 즉시 확인할 수 있어야 한다.

```text
WAITING PERMISSION
```

또는:

```text
🔒 WRITE APPROVAL
```

상세 패널:

```text
┌─ Permission Required ─────────────────────────────────────────────────────────┐
│ Agent: implementer-01                                                        │
│ Path: src/main/java/.../ProductBulkUploadService.java                        │
│ Mode: write                                                                  │
│ Scope: current goal                                                          │
│ Reason: 상품 대량등록 서비스 구현                                            │
│                                                                              │
│ [A] Allow once  [G] Goal  [S] Session  [D] Deny                              │
└───────────────────────────────────────────────────────────────────────────────┘
```

권한 요청 중에는 에이전트가 동일 Tool을 반복 호출해서는 안 된다.

---

# 9. 오류·경고 표시

Status Bar에 활성 경고 개수를 표시한다.

```text
⚠ 2
```

오류가 있으면:

```text
✗ 1
```

예시:

```text
 NV │ RUN 6/12 │ A 2/5 │ RL 91% │ RETRY 1 │ ⚠2 │ ✗1
```

경고 유형:

```text
- Rate Limit 임박
- Context Window 임박
- Tool 재시도
- File Lease 대기
- 권한 승인 대기
- 테스트 실패
- 모델 fallback
- Task 재계획
- Circuit Breaker 동작
```

상세 경고 패널:

```text
┌─ Runtime Warnings ────────────────────────────────────────────────────────────┐
│ ⚠ qwen3-coder TPM 사용량 94%                                                 │
│ ⚠ reviewer-01이 38초 동안 File Lease를 기다리고 있음                         │
│ ✗ integrationTest 실패: ProductBulkUploadIntegrationTest                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

# 10. 실행 시간과 예상 작업량

현재 Goal의 경과 시간을 표시한다.

```text
ELAPSED 00:02:31
```

에이전트별 경과 시간도 기록한다.

완료 예상 시간을 근거 없이 생성하지 않는다.

충분한 작업 통계가 있는 경우에만 추정치임을 명확히 표시한다.

```text
ETA ~04:20
```

통계가 부족하면 표시하지 않는다.

---

# 11. Status Bar 화면 모드

## 11.1 Compact Mode

```text
/status compact
```

```text
 NV │ RUN 6/12 │ NEMOTRON │ A3/5 │ RL 78% │ ⚠1
```

## 11.2 Normal Mode

```text
/status normal
```

```text
 NV │ GOAL RUNNING 6/12 │ MODEL nemotron-super │ AGENTS 3/5 │ RPM 18/40 │ TPM 72K/120K │ CTX 41% │ ⚠1
```

## 11.3 Expanded Mode

```text
/status expanded
```

```text
┌─ NV Runtime ──────────────────────────────────────────────────────────────────┐
│ Goal       상품 대량등록 API 구현                                             │
│ State      RUNNING                         Progress 6/12 50%                   │
│ Model      nvidia/nemotron-3-super-120b     Context 41%                        │
│ Rate       RPM 18/40 · TPM 72K/120K         Reset 00:18                       │
│ Agents     3 running · 1 waiting · 1 completed                                │
├─ Active Agents ───────────────────────────────────────────────────────────────┤
│ ▶ explorer-01     프로젝트 의존성 분석                                 72%    │
│ ▶ implementer-01  ProductBulkUploadService 구현                        41%    │
│ ▶ tester-01       테스트 Fixture 준비                                  22%    │
│ ⏸ reviewer-01     implementer 완료 대기                                        │
│ ✓ planner-01      Task DAG 생성 완료                                           │
├─ Runtime ─────────────────────────────────────────────────────────────────────┤
│ Tool       patch_file                                                         │
│ File       carry/product/service/ProductBulkUploadService.java                │
│ Queue      4                    Concurrency 3/5                                │
│ Warnings   1                    Elapsed 00:02:31                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 11.4 Hidden Mode

```text
/status off
```

자동화, CI 환경 또는 로그 파일 출력 시 Status Bar를 비활성화할 수 있다.

---

# 12. Status Bar 명령어

다음 명령을 구현한다.

```text
/status
/status show
/status hide
/status compact
/status normal
/status expanded
/status agents
/status models
/status limits
/status warnings
/status goal
/status refresh
```

예시:

```text
/status agents
```

```text
ACTIVE AGENTS

1. implementer-01
   Model: nvidia/qwen3-coder
   Status: calling_tool
   Task: ProductBulkUploadService 구현
   Tool: patch_file
   Progress: 41%

2. explorer-01
   Model: nvidia/nemotron-3-super-120b
   Status: running
   Task: 관련 Mapper 및 DTO 탐색
   Progress: 72%

3. reviewer-01
   Model: nvidia/nemotron-ultra
   Status: waiting_dependency
   Waiting for: implementer-01
```

예시:

```text
/status limits
```

```text
API RATE LIMITS

nvidia/nemotron-3-super-120b
  RPM: 18 / 40
  TPM: 72,481 / 120,000
  Active: 1 / 2
  Queue: 2
  Reset: 18초
  State: NORMAL

nvidia/qwen3-coder
  RPM: 29 / 30
  TPM: 94,218 / 100,000
  Active: 1 / 1
  Queue: 2
  Reset: 31초
  State: CRITICAL
```

---

# 13. 실시간 이벤트 기반 업데이트

Status Bar는 일정 주기로 전체 상태를 무조건 다시 읽는 polling-only 방식으로 구현하지 않는다.

다음 이벤트를 구독하여 상태를 갱신한다.

```text
GOAL_CREATED
GOAL_STATUS_CHANGED
TASK_CREATED
TASK_STARTED
TASK_PROGRESS
TASK_COMPLETED
TASK_FAILED
AGENT_STARTED
AGENT_STATUS_CHANGED
AGENT_COMPLETED
TOOL_STARTED
TOOL_COMPLETED
TOOL_FAILED
MODEL_REQUEST_STARTED
MODEL_REQUEST_COMPLETED
MODEL_RATE_LIMIT_UPDATED
MODEL_FALLBACK
PERMISSION_REQUESTED
PERMISSION_RESOLVED
FILE_LEASE_ACQUIRED
FILE_LEASE_RELEASED
WARNING_CREATED
WARNING_RESOLVED
```

이벤트 구조:

```ts
interface RuntimeEvent<T = unknown> {
  id: string;
  type: string;
  goalId?: string;
  taskId?: string;
  agentId?: string;
  timestamp: string;
  payload: T;
}
```

상태 흐름:

```text
Runtime Event Bus
      ↓
Runtime State Store
      ↓
Status Bar Selector
      ↓
Terminal Renderer
```

Status Bar가 각 Agent의 내부 상태를 직접 조회하거나 추측해서는 안 된다.

모든 상태는 Runtime State Store를 Single Source of Truth로 사용한다.

---

# 14. 렌더링 안정성

터미널 Status Bar 때문에 일반 출력이 깨지면 안 된다.

다음 렌더링 순서를 적용한다.

```text
1. Status Bar 임시 제거
2. 일반 로그 출력
3. 터미널 크기 확인
4. 최신 Runtime State 조회
5. Status Bar 재렌더링
```

동시 출력은 전용 Render Lock으로 직렬화한다.

```ts
interface TerminalRenderer {
  writeLog(message: string): Promise<void>;
  updateStatus(state: RuntimeViewState): Promise<void>;
  clearStatus(): Promise<void>;
  suspendStatus(): Promise<void>;
  resumeStatus(): Promise<void>;
}
```

다음 환경을 지원한다.

```text
- macOS Terminal
- iTerm2
- Windows Terminal
- Linux TTY
- VS Code Integrated Terminal
- JetBrains Terminal
- 비대화형 CI 환경
- ANSI 미지원 환경
```

터미널 크기 변경 시 `SIGWINCH`를 감지하여 자동 재배치한다.

---

# 15. 로그 출력과 Status Bar 분리

Status Bar의 변경 내용을 일반 로그에 매번 출력해서는 안 된다.

잘못된 방식:

```text
Agent 3개 실행 중
Agent 2개 실행 중
Agent 3개 실행 중
Rate Limit 70%
Rate Limit 71%
Rate Limit 72%
```

Status Bar는 실시간 상태만 갱신한다.

일반 로그에는 중요한 상태 변화만 기록한다.

```text
[AGENT] implementer-01 작업 시작
[MODEL] qwen3-coder Rate Limit 85% 도달
[MODEL] reviewer를 nemotron-ultra로 전환
[TEST] ProductBulkUploadIntegrationTest 실패
```

---

# 16. 예시 실행 화면

사용자:

```text
/orchestration on
/status expanded
/goal docs/carry 기준 상품 일괄등록 API를 구현하고 테스트한다.
```

초기 상태:

```text
┌─ NV Runtime ──────────────────────────────────────────────────────────────────┐
│ Goal       상품 일괄등록 API 구현                                             │
│ State      PLANNING                        Progress 0/0                        │
│ Model      nemotron-3-super-120b           Context 8%                         │
│ Rate       RPM 2/40 · TPM 8K/120K          Reset 00:42                        │
│ Agents     1 running · 0 waiting · 0 completed                                │
├─ Active Agents ───────────────────────────────────────────────────────────────┤
│ ▶ orchestrator-01  Goal 분석 및 Agent Task 구성                        18%    │
└───────────────────────────────────────────────────────────────────────────────┘
```

탐색 및 구현 상태:

```text
┌─ NV Runtime ──────────────────────────────────────────────────────────────────┐
│ Goal       상품 일괄등록 API 구현                                             │
│ State      RUNNING                         Progress 5/11 45%                   │
│ Model      qwen3-coder                     Context 39%                         │
│ Rate       RPM 24/40 · TPM 81K/120K        Reset 00:16                        │
│ Agents     3 running · 1 waiting · 1 completed                                │
├─ Active Agents ───────────────────────────────────────────────────────────────┤
│ ▶ explorer-01     Mapper 및 기존 Excel 구조 분석                       89%    │
│ ▶ implementer-01  ProductBulkUploadService 구현                        43%    │
│ ▶ tester-01       대량 업로드 Fixture 생성                              28%    │
│ ⏸ reviewer-01     구현 완료 대기                                               │
│ ✓ planner-01      계획 완료                                                    │
├─ Runtime ─────────────────────────────────────────────────────────────────────┤
│ Tool       patch_file                                                         │
│ File       carry/product/service/ProductBulkUploadService.java                │
│ Queue      2                    Concurrency 3/4                                │
│ Warnings   0                    Elapsed 00:03:18                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

Rate Limit 임박 상태:

```text
┌─ NV Runtime ──────────────────────────────────────────────────────────────────┐
│ Goal       상품 일괄등록 API 구현                                             │
│ State      RATE LIMIT WARNING              Progress 7/11 64%                  │
│ Model      qwen3-coder                     Context 57%                         │
│ Rate       RPM 29/30 · TPM 96K/100K        Reset 00:31 · CRITICAL             │
│ Agents     1 running · 2 waiting · 2 completed                                │
├─ Active Agents ───────────────────────────────────────────────────────────────┤
│ ▶ implementer-01  Service 구현 마무리                                  82%    │
│ ⏸ tester-01       Rate Limit 해제 대기                                        │
│ ⏸ reviewer-01     Rate Limit 해제 대기                                        │
│ ✓ explorer-01     구조 분석 완료                                               │
│ ✓ planner-01      계획 완료                                                    │
├─ Runtime Warnings ────────────────────────────────────────────────────────────┤
│ ⚠ qwen3-coder TPM 사용량 96%                                                  │
│ ⚠ 신규 병렬 Agent 실행을 일시 중지함                                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

권한 대기 상태:

```text
 NV │ WAITING PERMISSION │ MODEL qwen3-coder │ AGENTS 0/5 │ 🔒 WRITE │ RL 61%
```

검증 상태:

```text
 NV │ VERIFYING 9/11 │ MODEL nemotron-ultra │ AGENTS 2/5 │ TEST 14/18 │ RL 73% │ ⚠1
```

완료 상태:

```text
 NV │ COMPLETED 11/11 │ MODELS 3 │ AGENTS 5✓ │ TESTS 18✓ │ WARN 0 │ 00:07:42
```

---

# 17. 설정 파일

```yaml
statusBar:
  enabled: true
  mode: normal
  position: bottom
  refreshIntervalMs: 250
  show:
    goal: true
    model: true
    agents: true
    rateLimit: true
    tokenUsage: true
    contextUsage: true
    activeTool: true
    activeFile: true
    warnings: true
    elapsedTime: true

  thresholds:
    rateLimitWarningPercent: 70
    rateLimitCriticalPercent: 85
    contextWarningPercent: 70
    contextCompactPercent: 85
    contextCriticalPercent: 95

  terminal:
    useAnsi: auto
    responsive: true
    minWidthForNormal: 90
    minWidthForExpanded: 130
    fallbackToLog: true
```

---

# 18. 완료 조건

Status Bar 기능은 다음 조건을 모두 충족해야 한다.

```text
- 현재 Goal 상태와 진행률을 표시한다.
- 현재 사용 중인 모델을 표시한다.
- 모델 fallback 발생 시 전환 내용을 표시한다.
- 활성 에이전트 수와 전체 에이전트 수를 표시한다.
- 각 에이전트의 역할, 모델, 작업, 상태를 상세 조회할 수 있다.
- RPM, TPM, concurrency, queue, reset 정보를 표시한다.
- Rate Limit 정보를 알 수 없으면 unknown으로 표시한다.
- 토큰 및 Context Window 사용량을 표시한다.
- 현재 Tool과 작업 파일을 표시한다.
- 권한 승인 대기 상태를 표시한다.
- 오류, 경고, 재시도 및 Circuit Breaker 상태를 표시한다.
- 터미널 크기에 따라 자동으로 compact 모드로 전환된다.
- ANSI 미지원 환경에서 fallback이 동작한다.
- 일반 로그와 Status Bar가 서로 덮어쓰지 않는다.
- Runtime State Store를 SSoT로 사용한다.
- Status Bar 표시가 Agent 실행을 차단하지 않는다.
- 상태 변경이 이벤트 기반으로 실시간 반영된다.
- `/status` 명령으로 모드와 상세 정보를 제어할 수 있다.
```

---

# 19. 기존 구현 프롬프트 반영 지시

기존 구현 계획에 다음 Phase를 추가한다.

```text
Phase 8. Runtime State Store 및 Event Bus
Phase 9. Status Bar 기본 Renderer
Phase 10. Agent Activity Panel
Phase 11. Model 및 Rate Limit Monitor
Phase 12. Token·Context Monitor
Phase 13. Responsive Terminal Rendering
Phase 14. Status Bar 통합 테스트 및 E2E
```

Status Bar를 각 모듈의 상태를 임의로 조회하는 부가 기능으로 구현하지 않는다.

다음 구조를 기준으로 구현한다.

```text
Goal Runtime ──────────────┐
Agent Orchestrator ────────┤
Tool Harness ──────────────┤
Permission Manager ────────┼── Runtime Event Bus
Rate Limit Controller ─────┤           ↓
Model Router ──────────────┤    Runtime State Store
Context Manager ───────────┘           ↓
                                  Status Bar UI
```

구현 완료 후 다음 시나리오를 실제 E2E로 검증한다.

```text
1. 단일 모델 단일 Agent 실행
2. 단일 모델 멀티 Agent 실행
3. 여러 모델을 사용하는 멀티 Agent 실행
4. Agent가 의존성 완료를 기다리는 상황
5. 동일 파일 File Lease 대기 상황
6. 권한 요청 대기 상황
7. Rate Limit 70%, 85%, 100% 상황
8. HTTP 429와 Retry-After 처리
9. 모델 fallback 상황
10. Context 압축 상황
11. Tool 실패 및 재시도 상황
12. Goal 완료 및 일부 완료 상황
13. 좁은 터미널과 넓은 터미널
14. ANSI 미지원 환경
15. 비대화형 CI 환경
```
REFACTOR_V2.md  

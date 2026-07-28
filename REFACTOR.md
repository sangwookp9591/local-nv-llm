# NV Terminal AI를 Claude Code·Codex 수준의 코딩 에이전트로 개선

/orchestration /goal

현재 프로젝트:

```text
/Users/iron/orca/projects/local-llm
```

현재 구현된 NV Terminal AI를 분석하고, 단순한 NVIDIA LLM 채팅 터미널에서 Claude Code 및 Codex CLI와 유사한 실전형 터미널 코딩 에이전트로 개선한다.

현재 증상:

```text
사용자: 어떤 모델이있지?

NV:
Okay, the user is asking in Korean...
...
저는 NV라고 부르는 NVIDIA에서 개발한 전문 터미널 AI 어시스턴트입니다.
특정 공개 LLM과 같은 이름이 있는 범용 모델이 아닙니다.
```

위 응답은 잘못되었다.

현재 실제 선택 모델은 다음과 같이 화면에 표시되어 있다.

```text
nvidia/nemotron-3-super-120b-a12b
```

그런데도 모델이 자신의 실제 모델 정보를 무시하고, 내부 추론을 노출하며, NVIDIA가 별도로 개발한 비공개 터미널 AI라고 환각하고 있다.

이 문제를 단순 System Prompt 문구 수정으로만 모면하지 말고, CLI 라우팅·모델 메타데이터·응답 파싱·Tool Calling·Agent Loop를 포함한 전체 구조를 개선한다.

---

## 1. 핵심 목표

NV Terminal AI는 다음 세 가지 계층으로 분리한다.

```text
사용자 입력
   ↓
Local Command Router
   ↓
Agent Runtime
   ↓
NVIDIA Model Provider
```

각 계층의 역할:

### Local Command Router

LLM을 호출하지 않고 CLI 자체에서 처리할 명령을 담당한다.

### Agent Runtime

파일 탐색, 코드 수정, 명령 실행, 계획 수립, 승인 및 검증을 담당한다.

### NVIDIA Model Provider

NVIDIA API 요청, 스트리밍 응답, Tool Calling, 모델별 capability와 응답 정규화를 담당한다.

---

## 2. 현재 구현 우선 분석

작업 전 다음을 확인한다.

* CLI Entry Point
* 터미널 UI
* 사용자 입력 처리
* Slash Command 처리
* NVIDIA API Client
* Chat Completion Request
* Streaming Parser
* Reasoning 응답 처리
* Message History
* System Prompt
* 모델 목록 조회
* 모델 선택 및 저장
* Tool Calling 지원 여부
* 파일 접근 구현
* Shell 실행 구현
* Session 저장
* 테스트 구조

다음 질문에 코드 근거로 답한다.

1. `/models`가 실제 로컬 명령인가?
2. “어떤 모델이 있어?” 같은 자연어 질의가 LLM으로 그대로 전달되는가?
3. 모델 목록을 어느 API에서 가져오는가?
4. 선택한 모델 ID를 System Prompt에 전달하는가?
5. reasoning content와 final content를 구분하는가?
6. API 응답의 어떤 필드를 터미널에 출력하는가?
7. Tool Calling Agent Loop가 구현되어 있는가?
8. 파일 수정 전 사용자 승인이 있는가?
9. Shell 명령 실행 결과가 다시 모델에 전달되는가?
10. 세션별 모델과 작업 디렉터리가 유지되는가?

분석 결과를 먼저 기록하고 구현을 진행한다.

---

## 3. 로컬 명령과 LLM 질의 분리

다음 명령은 절대 LLM에 보내지 않는다.

```text
/help
/model
/models
/config
/status
/auth
/clear
/new
/history
/resume
/context
/compact
/permissions
/tools
/doctor
/exit
```

명령 처리 흐름:

```ts
async function handleInput(input: string): Promise<void> {
  const normalized = input.trim();

  if (isSlashCommand(normalized)) {
    await commandRouter.execute(normalized);
    return;
  }

  const intent = detectLocalIntent(normalized);

  if (intent) {
    await localIntentRouter.execute(intent);
    return;
  }

  await agentRuntime.run(normalized);
}
```

---

## 4. 자연어 Local Intent 처리

Slash Command뿐 아니라 자주 사용하는 자연어 질문도 로컬에서 처리한다.

다음 표현은 `LIST_MODELS`로 분류한다.

```text
어떤 모델이 있어?
모델 뭐 있어?
사용 가능한 모델 알려줘
모델 목록
NVIDIA 모델 목록
what models are available?
list models
show models
```

다음 표현은 `CURRENT_MODEL`로 분류한다.

```text
지금 어떤 모델이야?
현재 모델이 뭐야?
너 무슨 모델이야?
what model are you?
```

다음 표현은 `CURRENT_STATUS`로 분류한다.

```text
현재 상태 알려줘
연결 상태
세션 상태
status
```

초기 버전은 정규식과 명확한 규칙으로 구현한다.

이 기능을 위해 별도 LLM 분류 요청을 호출하지 않는다.

```ts
type LocalIntent =
  | "LIST_MODELS"
  | "CURRENT_MODEL"
  | "CURRENT_STATUS"
  | "SHOW_HELP"
  | "CHANGE_MODEL";
```

의도가 애매하면 일반 대화로 전달한다.

---

## 5. 모델 목록 응답 방식

사용자가 다음처럼 질문했을 때:

```text
어떤 모델이 있지?
```

LLM이 모델 목록을 상상해서 답하지 않게 한다.

CLI가 실제 모델 카탈로그에서 데이터를 가져와 직접 렌더링한다.

출력 예:

```text
사용 가능한 NVIDIA 모델

현재 모델
  ● nvidia/nemotron-3-super-120b-a12b

모델 목록
  1. nvidia/nemotron-3-super-120b-a12b
     Reasoning · Tool Calling · Streaming

  2. <실제 API에서 조회된 모델>
     Chat · Streaming

  3. <실제 API에서 조회된 모델>
     Coding · Tool Calling

총 18개 모델
/models 명령으로 검색하거나 /model <model-id>로 변경할 수 있습니다.
```

규칙:

* 모델명을 하드코딩하지 않는다.
* 실제 API 조회 결과를 우선한다.
* API 조회 실패 시 캐시를 사용한다.
* 캐시 사용 여부와 갱신 시간을 표시한다.
* capability를 확인할 수 없으면 `Unknown`으로 표시한다.
* 모델 개수와 모델 ID를 임의로 생성하지 않는다.
* 현재 선택 모델을 별도로 표시한다.

---

## 6. 모델 자기 인식 정보 주입

모델이 자신의 정체성을 추측하게 두지 않는다.

매 API 요청마다 현재 런타임 정보를 System Context에 주입한다.

```ts
interface RuntimeContext {
  applicationName: "NV Terminal AI";
  provider: "NVIDIA";
  modelId: string;
  mode: "chat" | "agent" | "plan";
  workingDirectory: string;
  sessionId: string;
  tools: string[];
  toolCallingSupported: boolean;
}
```

System Prompt에 다음과 같이 전달한다.

```text
Runtime information:

- Application: NV Terminal AI
- Provider: NVIDIA API
- Current model ID: {{MODEL_ID}}
- Mode: {{MODE}}
- Working directory: {{WORKING_DIRECTORY}}
- Available tools: {{TOOLS}}
- Tool calling supported: {{TOOL_CALLING_SUPPORTED}}

This runtime information is authoritative.
Do not guess or contradict it.
```

사용자가 모델을 물으면 반드시 현재 런타임의 `modelId`를 사용한다.

모델 아키텍처, 학습 데이터, 파라미터 수 등 제공되지 않은 정보는 추측하지 않는다.

---

## 7. System Prompt 전면 교체

기존 System Prompt를 찾아 다음 원칙을 반영하여 교체한다.

```text
You are NV, a terminal coding agent running inside the NV Terminal AI application.

Authoritative runtime information:
- Provider: NVIDIA
- Current model: {{MODEL_ID}}
- Mode: {{MODE}}
- Working directory: {{WORKING_DIRECTORY}}
- Available tools: {{TOOLS}}

Follow these rules:

1. Runtime metadata is authoritative.
   Never invent a different identity, provider, model name, architecture, or creator.

2. Never expose hidden reasoning, private scratch work, chain-of-thought, internal analysis, or planning tokens.
   Return only the concise final answer, tool request, plan, diff, or execution result intended for the user.

3. Respond in the language used by the user unless explicitly requested otherwise.

4. You are a coding agent, not merely a chatbot.
   For repository questions, inspect the repository with available tools before answering.
   Do not claim to have inspected files that you did not read.

5. Use tools when the answer depends on the filesystem, Git state, source code, test output, or command output.
   Never fabricate file contents, command results, APIs, models, or test outcomes.

6. Before modifying files:
   - inspect relevant files;
   - explain the intended change;
   - generate a patch;
   - obtain permission according to the runtime permission policy.

7. After modifying code:
   - inspect the diff;
   - run the smallest relevant validation;
   - report passed, failed, skipped, and unverified items separately.

8. Never say that you are a private or unnamed NVIDIA model.
   The current model ID is {{MODEL_ID}}.

9. Do not claim that NVIDIA created a specialized product or model unless the runtime metadata or retrieved documentation explicitly proves it.

10. When asked what models are available, do not invent an answer.
    The CLI should resolve that request through its local model catalog.
    If the request reaches you without model catalog data, clearly state that the CLI must query the provider catalog.

11. Do not use promotional descriptions such as:
    - latest NVIDIA technology;
    - specially trained terminal AI;
    - proprietary architecture;
    unless verified data is available.

12. Keep normal answers direct.
    Do not narrate thoughts such as:
    - “The user is asking...”
    - “I should...”
    - “Let me think...”
    - “Looking at the history...”

13. Never include role-analysis text before the final answer.

14. Do not append generic offers, emojis, or marketing language unless appropriate to the user’s request.

15. In agent mode, prefer action over generic instructions:
    inspect, diagnose, patch, validate, and summarize.
```

System Prompt는 코드 내부 문자열로 거대하게 방치하지 말고 별도 모듈로 분리한다.

```text
src/prompts/system-prompt.ts
src/prompts/agent-prompt.ts
src/prompts/plan-prompt.ts
```

---

## 8. 내부 추론 노출 방지

현재 출력되는 다음 문장은 사용자에게 노출되면 안 된다.

```text
Okay, the user is asking...
I should...
Let me check the history...
The user might...
```

단순 문자열 삭제만 하지 말고 API 응답 구조를 분석한다.

확인 대상:

* `message.content`
* `message.reasoning_content`
* `delta.content`
* `delta.reasoning_content`
* `<think>...</think>`
* `<analysis>...</analysis>`
* reasoning token 전용 이벤트
* Provider별 custom field

터미널에는 최종 답변 채널만 렌더링한다.

```ts
interface NormalizedStreamEvent {
  type:
    | "content_delta"
    | "reasoning_delta"
    | "tool_call_delta"
    | "usage"
    | "done"
    | "error";
  content?: string;
}
```

기본 정책:

```ts
if (event.type === "reasoning_delta") {
  reasoningBuffer.append(event.content);
  return;
}

if (event.type === "content_delta") {
  terminal.render(event.content);
}
```

Reasoning은 사용자 화면에 출력하지 않는다.

디버그 로그에도 원문 reasoning을 기본 저장하지 않는다.

응답 본문에 `<think>`가 포함되는 모델을 위해 스트리밍 안전 필터를 구현한다.

주의:

* 완성된 문자열에 정규식 한 번 적용하는 방식만 사용하지 않는다.
* `<think>` 태그가 여러 chunk로 나뉘어 올 수 있다.
* 스트림 상태 머신으로 처리한다.
* 코드 예제 안의 `<think>` 텍스트를 오탐하지 않도록 한다.
* Provider가 구조화된 reasoning 필드를 제공하면 해당 필드를 우선 사용한다.

---

## 9. 모델 Provider 정규화

NVIDIA Provider를 다음 인터페이스로 분리한다.

```ts
interface ModelProvider {
  listModels(options?: {
    refresh?: boolean;
  }): Promise<ModelInfo[]>;

  getModel(modelId: string): Promise<ModelInfo | null>;

  chat(
    request: AgentRequest,
    signal?: AbortSignal,
  ): AsyncIterable<NormalizedStreamEvent>;

  validateApiKey(apiKey: string): Promise<AuthValidationResult>;
}
```

모델 데이터:

```ts
interface ModelInfo {
  id: string;
  displayName: string;
  provider: "nvidia";
  description?: string;
  capabilities: {
    chat: boolean | "unknown";
    reasoning: boolean | "unknown";
    toolCalling: boolean | "unknown";
    vision: boolean | "unknown";
    streaming: boolean | "unknown";
  };
  contextWindow?: number;
  maxOutputTokens?: number;
  source: "api" | "cache" | "bundled" | "manual";
  fetchedAt: string;
}
```

---

## 10. Chat Mode와 Agent Mode 구분

현재의 Chat Mode는 일반적인 질문 응답에만 사용한다.

```text
/chat
```

Agent Mode는 실제 저장소 작업에 사용한다.

```text
/agent
```

Plan Mode는 읽기 전용으로 사용한다.

```text
/plan
```

화면 헤더:

```text
NV Terminal AI (AGENT MODE)
Model: nvidia/nemotron-3-super-120b-a12b
Directory: /Users/iron/orca/projects/local-llm
Permissions: read=allow, write=ask, shell=ask
```

---

## 11. Tool Calling 구현

다음 도구를 제공한다.

### Filesystem

```text
list_directory
read_file
read_files
find_files
search_text
file_stat
```

### Git

```text
git_status
git_diff
git_log
git_show
```

### File modification

```text
apply_patch
create_file
move_file
delete_file
```

### Shell

```text
run_command
run_tests
```

Tool arguments는 런타임 스키마로 검증한다.

```ts
const RunCommandSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  reason: z.string().min(1),
});
```

---

## 12. Agent Loop

단일 Chat Completion 호출로 종료하지 않는다.

다음 Agent Loop를 구현한다.

```ts
while (step < maxSteps) {
  const response = await provider.chat({
    messages,
    tools: toolRegistry.getDefinitions(),
  });

  if (response.hasToolCalls()) {
    const results = await toolExecutor.execute(
      response.toolCalls,
      permissionManager,
    );

    messages.push(response.assistantMessage);
    messages.push(...results.toToolMessages());

    step += 1;
    continue;
  }

  renderFinalAnswer(response.finalContent);
  break;
}
```

필수 보호 장치:

* 최대 Step
* 최대 Tool 호출 수
* 동일 Tool 반복 감지
* 동일 실패 반복 감지
* 사용자 중단
* Timeout
* Token budget
* Context compact
* Tool 결과 크기 제한
* 큰 파일 부분 읽기
* 무한 루프 차단

---

## 13. Tool Calling 미지원 모델 대응

현재 모델이 Tool Calling을 지원하지 않거나 지원 여부가 불명확하면 자동 실행하지 않는다.

사용자에게 다음처럼 표시한다.

```text
현재 모델의 Tool Calling 지원을 확인할 수 없습니다.

1. Chat Mode로 계속
2. 읽기 전용 Plan Mode 사용
3. Tool Calling 지원 모델 선택
```

자유 형식 텍스트에서 Shell 명령이나 JSON을 추출하여 무조건 실행하지 않는다.

Tool Calling이 없더라도 읽기 전용 작업은 호스트 런타임의 명시적 orchestration으로 제한적으로 지원할 수 있지만, 실행 범위와 한계를 명확히 표시한다.

---

## 14. 권한 시스템

기본값:

```text
파일 읽기: 허용
파일 수정: 매번 확인
파일 생성: 매번 확인
파일 삭제: 매번 확인
Shell 읽기 명령: 매번 확인
Shell 변경 명령: 매번 확인
프로젝트 외부 접근: 차단
네트워크 명령: 매번 확인
Git commit: 매번 확인
Git push: 차단
```

승인 화면:

```text
NV가 다음 작업을 요청했습니다.

도구: apply_patch
대상:
  M src/providers/nvidia/stream-parser.ts
  M src/commands/model.ts

목적:
  내부 reasoning 출력을 분리하고 모델 목록 명령을 로컬 처리합니다.

[승인] [Diff 확인] [거부]
```

---

## 15. 코딩 에이전트 행동 규칙

저장소 관련 질문:

```text
이 프로젝트 구조 설명해줘
```

잘못된 동작:

```text
일반적으로 Node 프로젝트는 src 폴더와 package.json이 있습니다.
```

올바른 동작:

```text
1. list_directory
2. package.json 읽기
3. 주요 entry point 검색
4. 실제 구조 기반 설명
```

버그 수정 요청:

```text
모델 목록 질문이 환각하는 문제 고쳐줘
```

올바른 흐름:

```text
1. 입력 라우터 분석
2. 모델 카탈로그 분석
3. System Prompt 분석
4. Stream Parser 분석
5. 변경 계획
6. Patch 승인
7. 구현
8. 단위 테스트
9. 실제 CLI 시나리오 테스트
10. Diff 및 결과 보고
```

---

## 16. 정상 응답 예시

### 현재 모델 질문

입력:

```text
너 무슨 모델이야?
```

출력:

```text
현재 모델은 `nvidia/nemotron-3-super-120b-a12b`입니다.

- Provider: NVIDIA
- Mode: Chat
- Working directory: /Users/iron/orca/projects/local-llm
```

### 모델 목록 질문

입력:

```text
어떤 모델이 있지?
```

출력:

```text
사용 가능한 NVIDIA 모델을 조회했습니다.

현재 선택:
● nvidia/nemotron-3-super-120b-a12b

1. <실제 조회 모델 ID>
2. <실제 조회 모델 ID>
3. <실제 조회 모델 ID>

총 <실제 개수>개
`/models`에서 검색하고 `/model <model-id>`로 변경할 수 있습니다.
```

### 프로젝트 분석

입력:

```text
현재 프로젝트의 모델 호출 구조를 분석해줘.
```

출력 과정:

```text
◆ 프로젝트 구조 확인
◆ NVIDIA Provider 확인
◆ 스트리밍 파서 확인
◆ 모델 선택 로직 확인
```

최종 출력:

```text
현재 호출 경로는 다음과 같습니다.

cli.ts
→ chat-command.ts
→ nvidia-provider.ts
→ stream-parser.ts

확인된 문제:
1. ...
2. ...
3. ...
```

실제로 읽지 않은 파일명이나 구조를 만들지 않는다.

---

## 17. 응답 스타일 개선

기본 출력은 간결하게 유지한다.

금지:

```text
Okay, the user is asking...
Let me think...
I should answer in Korean...
As an AI developed by NVIDIA...
터미널 관련 task가 있다면 편하게 말씀해주세요! 😊
```

권장:

```text
현재 모델은 `nvidia/nemotron-3-super-120b-a12b`입니다.
```

코드 작업 중에는 상태를 짧게 표시한다.

```text
◆ 관련 파일 탐색
◆ 입력 라우팅 분석
◆ 수정안 준비
◆ 테스트 실행
```

상세한 내부 사고 과정은 출력하지 않는다.

---

## 18. 테스트 작성

### Local Intent

```text
"어떤 모델이 있어?" → LIST_MODELS
"모델 뭐 있어?" → LIST_MODELS
"너 무슨 모델이야?" → CURRENT_MODEL
"이 모델의 장점을 설명해줘" → 일반 Agent 요청
```

### 모델 목록

* 실제 카탈로그 사용
* 현재 모델 표시
* API 실패 시 캐시 fallback
* 빈 목록 처리
* 중복 모델 제거
* 검색
* 정렬
* 모델 변경

### Reasoning 필터

* `reasoning_content` 미출력
* `delta.reasoning_content` 미출력
* `<think>...</think>` 미출력
* 태그가 여러 chunk로 분리된 경우
* reasoning 뒤 final content 출력
* 일반 코드 블록 오탐 방지

### Runtime Metadata

* 현재 모델 ID 주입
* 모델 변경 후 즉시 갱신
* 현재 디렉터리 주입
* Mode 변경 반영
* 지원 Tool 목록 반영

### Agent Loop

* 단일 Tool 호출
* 연속 Tool 호출
* Tool 오류
* Tool 재시도
* 최대 Step
* 사용자 거부
* 사용자 중단
* 최종 응답

### E2E

다음 시나리오를 실제 터미널에서 검증한다.

```text
nv
→ 어떤 모델이 있지?
→ 실제 모델 목록 출력
→ 너 무슨 모델이야?
→ 현재 선택 모델 출력
→ /agent
→ 현재 프로젝트 구조 분석해줘
→ 실제 파일 도구 호출
→ 파일 수정 요청
→ 승인 화면 표시
→ 거부 시 수정되지 않음
→ 승인 시 Patch 적용
→ 테스트 실행
→ /exit
```

---

## 19. 권장 프로젝트 구조

```text
src/
├── cli/
│   ├── entry.ts
│   ├── input-router.ts
│   ├── local-intent-router.ts
│   └── command-router.ts
├── commands/
│   ├── help.ts
│   ├── models.ts
│   ├── model.ts
│   ├── status.ts
│   ├── agent.ts
│   └── plan.ts
├── providers/
│   └── nvidia/
│       ├── client.ts
│       ├── model-catalog.ts
│       ├── model-normalizer.ts
│       ├── stream-parser.ts
│       └── response-normalizer.ts
├── agent/
│   ├── runtime.ts
│   ├── agent-loop.ts
│   ├── tool-registry.ts
│   ├── tool-executor.ts
│   ├── permission-manager.ts
│   └── context-manager.ts
├── tools/
│   ├── filesystem/
│   ├── git/
│   ├── shell/
│   └── patch/
├── prompts/
│   ├── system-prompt.ts
│   ├── chat-prompt.ts
│   ├── agent-prompt.ts
│   └── plan-prompt.ts
├── models/
│   ├── model-info.ts
│   └── runtime-context.ts
└── tests/
```

기존 구조가 더 적합하다면 무리하게 전체 폴더를 변경하지 말고 개념만 반영한다.

---

## 20. 구현 단계

### Phase 1 — 현재 문제 수정

* 내부 reasoning 노출 차단
* 현재 모델 메타데이터 주입
* System Prompt 교체
* `/models`, `/model`, `/status` 로컬 처리
* 자연어 모델 질의 로컬 처리

### Phase 2 — 모델 카탈로그

* 실제 모델 목록 조회
* 캐시
* 모델 검색
* capability 표시
* 모델 변경

### Phase 3 — 코딩 도구

* 파일 읽기
* 코드 검색
* Git 조회
* Patch
* Shell
* 테스트 실행

### Phase 4 — Agent Loop

* Tool Calling
* 권한 승인
* 반복 실행
* 오류 복구
* 중단
* Context 관리

### Phase 5 — 품질

* 단위 테스트
* 통합 테스트
* 터미널 E2E
* README
* 보안 검증

각 Phase별로 독립적인 Git commit을 생성한다.

---

## 21. 완료 조건

다음 조건을 만족해야 한다.

1. “어떤 모델이 있어?”에 실제 모델 목록이 출력된다.
2. 모델 목록 질문을 LLM에 전달하지 않는다.
3. “너 무슨 모델이야?”에 현재 모델 ID를 정확히 출력한다.
4. 내부 영어 추론이 사용자 화면에 노출되지 않는다.
5. 존재하지 않는 NVIDIA 제품이나 모델 정체성을 만들지 않는다.
6. 모델 변경 시 System Context가 즉시 갱신된다.
7. 저장소 질문 시 실제 파일을 읽고 답한다.
8. Agent Mode에서 Tool Calling이 반복 실행된다.
9. 사용자 승인 없이 파일을 변경하지 않는다.
10. 파일 변경 후 Diff와 테스트 결과를 표시한다.
11. Tool Calling 미지원 모델에서는 위험한 자동 실행을 하지 않는다.
12. Ctrl+C로 현재 요청을 중단할 수 있다.
13. API Key와 Authorization Header가 로그에 노출되지 않는다.
14. 전체 테스트가 통과한다.
15. README에 Chat, Agent, Plan Mode 사용법이 기록된다.

---

## 22. 최종 보고

작업 완료 후 다음을 보고한다.

```text
1. 기존 구조 분석
2. 내부 reasoning이 노출된 원인
3. 모델 환각이 발생한 원인
4. Local Command Router 개선 내용
5. System Prompt 변경 내용
6. 모델 카탈로그 구현 내용
7. Agent Loop 구현 내용
8. Tool 및 권한 정책
9. 변경 파일
10. 테스트 결과
11. 실제 CLI 실행 결과
12. 생성한 Git commit
13. 남은 제한사항
```

실제로 실행하지 않은 테스트를 통과했다고 표현하지 않는다.

TODO, Mock-only 구현 또는 하드코딩된 모델 목록을 남긴 상태로 완료 처리하지 않는다.


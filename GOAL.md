# NVIDIA Build 기반 `nv` 터미널 AI 에이전트 구현

/orchestration /goal

NVIDIA Build에서 발급받은 LLM API Key를 이용하여 Claude Code, Codex CLI, Agy와 비슷하게 터미널에서 실행할 수 있는 독립적인 AI CLI 도구를 구현한다.

사용자는 터미널에서 다음 명령만 입력하면 프로그램을 실행할 수 있어야 한다.

```bash
nv
```

최초 실행 시 NVIDIA API Key를 안전하게 입력받고, 사용 가능한 NVIDIA Build 모델을 선택한 다음 대화형 AI 또는 코딩 에이전트로 사용할 수 있어야 한다.

단순한 API 호출 예제가 아니라 실제로 설치하고 지속적으로 사용할 수 있는 완성도 높은 CLI 제품으로 구현한다.

---

## 1. 기본 기술 방향

신규 프로젝트라면 다음 스택을 기본으로 사용한다.

* Node.js 22 이상
* TypeScript strict mode
* pnpm
* Ink 또는 이에 준하는 React 기반 Terminal UI
* Commander.js 또는 이에 준하는 CLI 명령어 파서
* OpenAI-compatible SDK 또는 표준 Fetch API
* SSE 기반 스트리밍 응답
* ESM 모듈
* Vitest
* ESLint
* Prettier
* tsup 또는 이에 준하는 CLI 번들러

기존 Orca 프로젝트나 CLI 프레임워크가 존재한다면 먼저 구조를 분석하고, NVIDIA를 새로운 Provider로 추가한다.

기존 Orca가 없다면 특정 Orca 라이브러리에 의존하지 말고 독립적인 `nv` CLI로 구현한다.

패키지명과 내부 프로젝트명은 충돌 가능성을 고려하여 정하되, 최종 실행 명령은 반드시 다음과 같아야 한다.

```bash
nv
```

---

## 2. NVIDIA API 연동

기본 Provider 설정은 다음과 같다.

```text
Provider: NVIDIA Build / NVIDIA NIM
Base URL: https://integrate.api.nvidia.com/v1
Chat Endpoint: /chat/completions
API Key Environment Variable: NVIDIA_API_KEY
```

OpenAI-compatible 요청 구조를 사용한다.

기본 요청 예시:

```json
{
  "model": "<선택한 모델 ID>",
  "messages": [
    {
      "role": "system",
      "content": "You are NV, a terminal AI coding assistant."
    },
    {
      "role": "user",
      "content": "사용자 입력"
    }
  ],
  "stream": true
}
```

다음 기능을 지원한다.

* 스트리밍 출력
* system, user, assistant 메시지 관리
* temperature 설정
* max_tokens 설정
* top_p 설정
* 모델별 추가 옵션
* 요청 취소
* 타임아웃
* 재시도
* Rate Limit 대응
* API 오류 메시지 정규화
* 사용량 정보 표시
* Reasoning 모델 응답 처리
* Tool Calling 지원 여부 판별

모델마다 지원 파라미터가 다를 수 있으므로, 모든 모델에 동일한 옵션을 강제로 전달하지 않는다.

Provider 계층에서 모델별 capability를 관리한다.

```ts
interface ModelCapability {
  id: string;
  name: string;
  provider: "nvidia";
  chat: boolean;
  coding: boolean;
  reasoning: boolean;
  toolCalling: boolean;
  vision: boolean;
  streaming: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
}
```

---

## 3. 최초 실행 UX

사용자가 처음으로 다음 명령을 실행한다.

```bash
nv
```

API Key가 저장되어 있지 않다면 아래 화면을 표시한다.

```text
NV — NVIDIA Terminal AI

NVIDIA API Key가 설정되어 있지 않습니다.

API Key는 NVIDIA Build에서 발급받을 수 있습니다.
API Key를 입력하세요: ••••••••••••••••••••
```

요구사항:

* 입력값은 화면에 노출하지 않는다.
* 키가 `nvapi-`로 시작하는지 기본 형식을 검사한다.
* 형식 검사만으로 성공 처리하지 않는다.
* NVIDIA API에 실제 요청을 보내 키 유효성을 검증한다.
* 유효하지 않으면 저장하지 않는다.
* 인증 실패와 네트워크 실패를 구분한다.
* API Key 전체 값을 로그에 출력하지 않는다.
* 오류 메시지에도 API Key를 포함하지 않는다.

성공 시:

```text
✓ NVIDIA API Key 확인 완료
✓ 안전한 자격 증명 저장소에 저장되었습니다.
```

---

## 4. API Key 저장 정책

우선순위는 다음과 같다.

1. `NVIDIA_API_KEY` 환경 변수
2. 운영체제 보안 저장소
3. 사용자가 명시적으로 동의한 로컬 암호화 저장소

운영체제별 Keychain 또는 Credential Store를 우선 사용한다.

* macOS Keychain
* Linux Secret Service
* Windows Credential Manager

평문 JSON이나 `.env` 파일에 API Key를 자동 저장하지 않는다.

로컬 파일 fallback이 반드시 필요한 경우:

* 사용자에게 먼저 안내한다.
* 암호화하거나 운영체제 권한으로 보호한다.
* Unix 계열에서는 파일 권한을 `600`으로 제한한다.
* Git 저장소 내부에 저장하지 않는다.
* 로그와 오류 리포트에서 키를 마스킹한다.

다음 명령을 제공한다.

```bash
nv auth login
nv auth logout
nv auth status
```

동작:

```bash
nv auth login
```

* API Key 입력
* API Key 검증
* 안전하게 저장
* 기존 키가 있다면 교체 여부 확인

```bash
nv auth logout
```

* 저장된 Key 삭제
* 세션 캐시 삭제

```bash
nv auth status
```

* 로그인 상태
* 키 출처
* 키 마스킹 결과
* API 연결 상태 표시

출력 예:

```text
Provider: NVIDIA Build
Authentication: Connected
Credential source: macOS Keychain
API Key: nvapi-****8F2A
```

---

## 5. 모델 목록 조회

`nv` 실행 후 사용 가능한 모델을 조회한다.

우선 다음 방식의 사용 가능 여부를 실제 API 요청으로 확인한다.

```http
GET /v1/models
Authorization: Bearer <NVIDIA_API_KEY>
```

응답이 정상이라면 모델 목록을 동적으로 생성한다.

해당 API가 지원되지 않거나 일부 모델만 반환하는 경우 다음 fallback을 적용한다.

1. 마지막으로 정상 조회한 로컬 모델 캐시
2. 프로젝트에 포함된 NVIDIA 모델 카탈로그 manifest
3. 사용자의 모델 ID 직접 입력
4. 공식적인 machine-readable 카탈로그가 확인되면 해당 방식 사용

런타임에서 `build.nvidia.com` HTML 페이지를 무작정 스크래핑하지 않는다.

모델 목록 캐시는 다음 정보를 가진다.

```ts
interface ModelCatalog {
  fetchedAt: string;
  source: "api" | "cache" | "bundled" | "manual";
  models: ModelCapability[];
}
```

모델 조회에 실패하더라도 CLI 전체 실행을 막지 않는다.

```text
모델 목록을 불러오지 못했습니다.

1. 캐시된 모델 사용
2. 모델 ID 직접 입력
3. 다시 시도
4. 연결 상태 확인
```

---

## 6. 모델 선택 화면

API Key 인증 후 모델 선택 화면을 표시한다.

```text
Select NVIDIA Model

Search: nemotron

❯ nvidia/nemotron-3-super-120b-a12b
  nvidia/nemotron-3-nano-30b-a3b
  moonshotai/kimi-k2.5
  z-ai/glm-4.7

↑↓ 이동  Enter 선택  / 검색  Esc 종료
```

다음 기능을 지원한다.

* 키보드 방향키 탐색
* 실시간 검색
* 제조사 필터
* Coding 필터
* Reasoning 필터
* Tool Calling 필터
* Vision 필터
* 최근 사용 모델
* 즐겨찾기 모델
* 기본 모델 설정
* 모델 ID 직접 입력
* 모델 capability 표시

모델 상세 예:

```text
nvidia/nemotron-3-super-120b-a12b

Type: Reasoning / Coding / Tool Use
Streaming: Supported
Tool Calling: Supported
Context: API metadata 기준
Source: NVIDIA API
```

지원 여부가 확인되지 않은 항목을 임의로 추측하지 않는다.

```text
Tool Calling: Unknown
Context Window: Unknown
```

처럼 명시한다.

---

## 7. 기본 대화형 인터페이스

모델 선택 후 다음과 같은 대화형 화면으로 진입한다.

```text
NV
Model: nvidia/nemotron-3-super-120b-a12b
Directory: /Users/user/project

────────────────────────────────────────

› 현재 프로젝트 구조를 분석해줘.

프로젝트를 살펴보겠습니다...
```

필수 기능:

* 실시간 스트리밍 출력
* Markdown 렌더링
* 코드 블록 구분
* 현재 모델 표시
* 현재 디렉터리 표시
* 응답 생성 중 상태 표시
* 응답 중단
* 이전 입력 탐색
* 멀티라인 입력
* 세션 저장
* 세션 재개
* 컨텍스트 초기화
* 모델 변경
* 오류 후 재시도
* 긴 응답의 자연스러운 터미널 스크롤
* 한국어 입력 및 출력 완전 지원

키보드 UX:

* `Enter`: 메시지 전송
* `Shift+Enter` 또는 설정 가능한 키: 줄바꿈
* `Ctrl+C`: 현재 생성 중단
* 생성 중이 아닐 때 `Ctrl+C`: 종료 확인 또는 종료
* `Ctrl+L`: 화면 정리
* `↑`, `↓`: 입력 히스토리
* `Esc`: 현재 메뉴 닫기

터미널과 운영체제에 따라 `Shift+Enter` 감지가 불가능하면 대체 키 조합을 제공하고 도움말에 표시한다.

---

## 8. Slash Command

다음 명령을 지원한다.

```text
/help
/model
/models
/config
/status
/clear
/new
/history
/resume
/save
/export
/retry
/stop
/context
/compact
/agent
/chat
/plan
/diff
/undo
/shell
/exit
```

주요 동작:

### `/model`

현재 모델 정보 표시 및 모델 변경.

### `/models`

모델 목록을 다시 연다.

### `/clear`

현재 화면과 대화 컨텍스트를 초기화한다.

### `/compact`

기존 대화를 요약하여 컨텍스트 사용량을 줄인다.

원본 전체 대화는 세션 파일에 유지하고, API 요청에 전달되는 메시지만 요약한다.

### `/status`

다음을 표시한다.

```text
Provider: NVIDIA Build
Model: nvidia/...
API: Connected
Mode: Agent
Directory: /Users/user/project
Session: 2026-07-28-001
Context messages: 24
Credential: Keychain
```

### `/export`

현재 세션을 Markdown 또는 JSON으로 내보낸다.

---

## 9. CLI 명령어

대화형 모드 외에도 다음 명령을 지원한다.

```bash
nv
nv chat
nv agent
nv models
nv models refresh
nv auth login
nv auth logout
nv auth status
nv config
nv config set model <model-id>
nv config get model
nv doctor
nv sessions
nv resume
nv resume <session-id>
nv --model <model-id>
nv -p "현재 디렉터리의 구조를 설명해줘"
nv agent -p "테스트 실패 원인을 찾아 수정해줘"
```

비대화형 실행:

```bash
nv -p "Spring Boot에서 대량 엑셀 업로드 구조를 설명해줘"
```

출력은 파이프라인에서 사용할 수 있어야 한다.

```bash
nv -p "현재 Git diff를 요약해줘" > review.md
```

JSON 출력도 지원한다.

```bash
nv -p "프로젝트를 분석해줘" --json
```

---

## 10. Chat 모드와 Agent 모드 분리

### Chat 모드

* 일반 대화
* 코드 설명
* 문서 작성
* 파일 변경 없음
* Shell 실행 없음

### Agent 모드

* 현재 디렉터리 탐색
* 파일 검색
* 파일 읽기
* 코드 분석
* 변경 계획 생성
* Patch 생성
* 사용자 승인 후 파일 수정
* 테스트 실행
* Git diff 검토
* 변경 취소

실행:

```bash
nv agent
```

또는 대화 중:

```text
/agent
```

Agent 모드는 Tool Calling을 지원하는 모델을 우선 사용한다.

현재 모델이 Tool Calling을 지원하지 않으면 다음 중 하나를 선택하게 한다.

```text
현재 모델의 Tool Calling 지원이 확인되지 않았습니다.

1. Tool Calling 지원 모델로 변경
2. 읽기 전용 분석 모드로 계속
3. Chat 모드로 전환
```

Tool Calling이 지원되지 않는 모델의 자유 형식 응답을 그대로 Shell 명령으로 실행하지 않는다.

---

## 11. Agent 도구 정의

초기 Agent 도구는 다음 범위로 제한한다.

### 읽기 도구

```text
list_directory
read_file
search_files
find_text
git_status
git_diff
git_log
```

### 쓰기 도구

```text
apply_patch
create_file
move_file
delete_file
```

### 실행 도구

```text
run_command
run_tests
```

각 Tool은 JSON Schema를 명확하게 정의한다.

예:

```ts
interface RunCommandInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  reason: string;
}
```

모델이 반환한 Tool arguments는 런타임 스키마로 다시 검증한다.

* 잘못된 JSON 거부
* 누락된 필드 거부
* 허용되지 않은 경로 거부
* 프로젝트 밖의 경로 접근 차단
* Path Traversal 차단
* Symbolic Link 우회 검사
* 명령어 timeout 적용

---

## 12. 파일 수정 안전성

AI가 바로 파일을 덮어쓰지 않도록 한다.

기본 작업 흐름:

```text
1. 프로젝트 분석
2. 변경 계획 표시
3. 변경할 파일 표시
4. Patch 미리보기
5. 사용자 승인
6. Patch 적용
7. 테스트
8. Git diff 표시
```

승인 화면:

```text
NV wants to modify 3 files:

M src/providers/nvidia.ts
M src/commands/chat.ts
A src/security/credential-store.ts

Apply these changes?

❯ Yes
  Review diff
  Reject
```

다음 명령은 별도 승인을 요구한다.

* 파일 삭제
* 여러 파일 대량 변경
* Git reset
* Git clean
* 패키지 설치
* 네트워크 다운로드
* 데이터베이스 명령
* Docker 실행
* 시스템 설정 변경
* 프로젝트 디렉터리 외부 접근

위험 명령은 기본적으로 차단한다.

```text
rm -rf
sudo
chmod -R
chown -R
git push --force
git reset --hard
curl ... | sh
wget ... | sh
```

사용자가 명시적으로 승인해도 실행 전 위험성을 다시 표시한다.

---

## 13. Plan 모드

Claude Code 또는 Codex와 유사한 Plan 모드를 제공한다.

```bash
nv agent --plan
```

또는:

```text
/plan
```

Plan 모드에서는:

* 파일을 읽을 수 있다.
* 코드를 검색할 수 있다.
* Git 상태를 확인할 수 있다.
* 파일을 변경할 수 없다.
* Shell은 읽기 전용 명령만 허용한다.
* 최종적으로 실행 가능한 작업 계획을 작성한다.

Plan 결과에는 다음이 포함되어야 한다.

```text
Goal
Current Architecture
Files Involved
Implementation Steps
Risks
Validation Plan
Expected Git Changes
```

사용자가 승인하면 Agent 모드로 전환하여 작업을 실행한다.

---

## 14. Patch 및 Undo

파일 변경 전 스냅샷 또는 역방향 Patch를 생성한다.

```text
/undo
```

실행 시 가장 최근 Agent 변경을 되돌린다.

Git 저장소라고 해서 임의로 `git reset --hard`를 사용하지 않는다.

Undo는 CLI가 변경한 파일만 대상으로 한다.

사용자가 이미 수정한 내용과 Agent 변경 내용을 구분할 수 있어야 한다.

변경 전 다음 정보를 기록한다.

```ts
interface FileChangeSnapshot {
  path: string;
  existedBefore: boolean;
  originalHash?: string;
  originalContent?: string;
  modifiedAt: string;
  sessionId: string;
}
```

---

## 15. 세션 관리

세션은 프로젝트별로 분리한다.

저장 정보:

* Session ID
* Provider
* Model ID
* 시작 시간
* 마지막 사용 시간
* 프로젝트 경로
* 대화 메시지
* Compact 요약
* Tool 실행 기록
* 파일 변경 기록
* Token usage
* 오류 기록

API Key는 세션에 저장하지 않는다.

명령어:

```bash
nv sessions
nv resume
nv resume <session-id>
nv sessions delete <session-id>
```

`nv resume`만 실행하면 현재 프로젝트의 최근 세션을 표시한다.

---

## 16. 설정

설정 우선순위:

```text
CLI 옵션
→ 프로젝트 설정
→ 사용자 전역 설정
→ 기본값
```

프로젝트 설정 예:

```text
<project>/.nv/config.json
```

전역 설정은 운영체제별 표준 config 경로를 사용한다.

Git에 API Key가 포함되지 않도록 한다.

설정 예:

```json
{
  "provider": "nvidia",
  "defaultModel": "nvidia/nemotron-3-super-120b-a12b",
  "mode": "chat",
  "stream": true,
  "temperature": 0.2,
  "maxTokens": 4096,
  "permissions": {
    "readFiles": true,
    "writeFiles": "ask",
    "runCommands": "ask",
    "network": "ask"
  }
}
```

---

## 17. Doctor 명령

다음 명령을 구현한다.

```bash
nv doctor
```

검사 항목:

* Node.js 버전
* CLI 버전
* 설정 파일 상태
* API Key 존재 여부
* Credential Store 접근 가능 여부
* NVIDIA API 연결
* 인증 성공 여부
* 모델 목록 조회 가능 여부
* 기본 모델 접근 가능 여부
* 현재 디렉터리 권한
* Git 설치 여부
* Git 저장소 여부
* Shell 실행 환경

출력 예:

```text
NV Doctor

✓ Node.js 22.8.0
✓ NVIDIA API Key configured
✓ NVIDIA API authentication
✓ Chat completion endpoint
! Model listing endpoint unavailable
  Cached catalog will be used.
✓ Git 2.48.0
✓ Current directory is writable

Result: Ready with 1 warning
```

---

## 18. 오류 처리

다음 오류를 사용자 친화적으로 구분한다.

* API Key 없음
* API Key 형식 오류
* 인증 실패
* 모델 접근 권한 없음
* 존재하지 않는 모델
* Rate Limit
* 서버 오류
* 네트워크 연결 실패
* DNS 오류
* 요청 Timeout
* 스트림 중단
* 잘못된 Tool Calling
* 컨텍스트 제한 초과
* 출력 토큰 제한
* Credential Store 오류
* 파일 권한 오류
* Shell 명령 Timeout

API 원문 전체를 그대로 출력하지 않는다.

디버그 모드에서만 상세 정보를 표시하며 API Key, Authorization Header, 사용자 비밀값은 반드시 마스킹한다.

```bash
NV_LOG_LEVEL=debug nv
```

---

## 19. 종료 및 중단 처리

`Ctrl+C` 동작:

### 응답 생성 중

* 현재 API 요청을 `AbortController`로 취소
* 부분 응답은 세션에 임시 저장
* CLI는 종료하지 않음

### 입력 대기 중

* 한 번 누르면 현재 입력 취소
* 짧은 시간 내 두 번 누르면 CLI 종료

종료 시:

* 현재 세션 저장
* 스트림 정리
* 실행 중인 자식 프로세스 종료
* Terminal raw mode 복구
* Cursor 상태 복구

강제 종료 후에도 터미널 입력 상태가 망가지지 않도록 한다.

---

## 20. 출력 및 디자인

과도한 ASCII Art를 사용하지 않는다.

Claude Code나 Codex처럼 단정하고 개발자 친화적인 인터페이스로 구성한다.

기본 헤더:

```text
NV
NVIDIA Terminal AI

Model      nvidia/nemotron-3-super-120b-a12b
Mode       Agent
Directory  ~/Project/example
```

색상을 지원하지 않는 터미널에서도 정보를 이해할 수 있어야 한다.

다음을 지원한다.

* ANSI Color 지원 여부 자동 감지
* `NO_COLOR` 환경 변수
* 터미널 폭 대응
* 긴 경로 축약
* Unicode 미지원 환경 fallback
* 한국어 너비 계산
* Screen Reader를 방해하는 불필요한 애니메이션 최소화

---

## 21. 프로젝트 구조

권장 구조:

```text
src/
├── cli.ts
├── app/
│   ├── App.tsx
│   ├── ChatScreen.tsx
│   ├── ModelSelectScreen.tsx
│   └── AuthScreen.tsx
├── commands/
│   ├── chat.ts
│   ├── agent.ts
│   ├── auth.ts
│   ├── models.ts
│   ├── config.ts
│   ├── doctor.ts
│   └── sessions.ts
├── providers/
│   ├── provider.ts
│   └── nvidia/
│       ├── client.ts
│       ├── models.ts
│       ├── stream.ts
│       ├── capabilities.ts
│       └── errors.ts
├── agent/
│   ├── agent-loop.ts
│   ├── tool-registry.ts
│   ├── permissions.ts
│   ├── patch-manager.ts
│   └── tools/
├── auth/
│   ├── credential-store.ts
│   ├── key-validator.ts
│   └── redaction.ts
├── sessions/
│   ├── session-store.ts
│   └── context-manager.ts
├── config/
│   ├── config-store.ts
│   └── schema.ts
├── terminal/
│   ├── markdown.ts
│   ├── input.ts
│   └── keybindings.ts
└── utils/
```

Provider 인터페이스를 분리하여 향후 OpenAI, Anthropic, OpenRouter 또는 로컬 NIM Provider를 추가할 수 있게 한다.

```ts
interface LlmProvider {
  validateCredential(): Promise<void>;
  listModels(): Promise<ModelCapability[]>;
  chat(request: ChatRequest): AsyncIterable<ChatEvent>;
  supportsTools(modelId: string): Promise<boolean>;
}
```

---

## 22. 테스트

단위 테스트:

* API Key 마스킹
* 설정 우선순위
* 모델 목록 정규화
* SSE 스트림 파싱
* API 오류 정규화
* Tool arguments 검증
* Path Traversal 차단
* 위험 명령 탐지
* Patch 생성 및 복구
* Session 저장 및 복원
* Context compact
* Ctrl+C 요청 취소

통합 테스트:

* Mock NVIDIA API 인증
* 모델 목록 조회
* 모델 목록 fallback
* Streaming Chat Completion
* Rate Limit 재시도
* Agent Tool Calling
* 사용자 승인 후 Patch 적용
* 테스트 실패 후 결과 표시
* `/undo`
* 세션 재개

CLI E2E 테스트:

```text
1. 깨끗한 환경에서 nv 실행
2. API Key 입력 화면 확인
3. 잘못된 키 거부 확인
4. 정상 키 저장 확인
5. 모델 목록 표시 확인
6. 모델 선택 확인
7. Streaming 응답 확인
8. 종료 후 재실행
9. API Key 재입력을 요구하지 않는지 확인
10. 저장된 세션 복원 확인
```

실제 API Key를 테스트 코드나 Fixture에 포함하지 않는다.

CI에서는 Mock Server를 사용한다.

---

## 23. 설치 및 배포

개발 환경:

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm link --global
nv
```

패키지 설치 후 실행:

```bash
npm install -g <package-name>
nv
```

`package.json`의 `bin` 설정을 통해 `nv` 명령을 등록한다.

```json
{
  "bin": {
    "nv": "./dist/cli.js"
  }
}
```

생성된 CLI 파일에는 올바른 shebang을 포함한다.

```bash
#!/usr/bin/env node
```

macOS와 Linux를 우선 완성하고, Windows에서도 가능한 범위까지 동일하게 동작하게 한다.

---

## 24. README

README에 다음 내용을 포함한다.

* 프로젝트 소개
* 주요 기능
* NVIDIA API Key 발급 위치
* 설치 방법
* 최초 로그인
* 모델 선택
* Chat 모드
* Agent 모드
* Plan 모드
* 명령어 목록
* Slash Command
* 설정
* 세션 복원
* API Key 저장 정책
* 권한 및 보안 정책
* 문제 해결
* `nv doctor`
* 개발 방법
* 테스트 방법
* 알려진 제한사항

API Key 예시는 실제처럼 보이는 값을 사용하지 않는다.

```text
nvapi-your-key-here
```

---

## 25. 구현 순서

다음 순서로 구현한다.

### Phase 1 — Core CLI

* TypeScript 프로젝트 구성
* `nv` 실행 명령 등록
* 설정 시스템
* Provider 인터페이스
* NVIDIA Chat Completion 연동
* Streaming 출력

### Phase 2 — Authentication

* 최초 API Key 입력
* 키 검증
* Credential Store
* Login, Logout, Status
* 비밀값 마스킹

### Phase 3 — Model Catalog

* 모델 API 조회
* 모델 정규화
* 캐시
* fallback catalog
* 검색 및 선택 UI
* 기본 모델 저장

### Phase 4 — Interactive Chat

* 대화형 TUI
* Markdown
* 입력 히스토리
* Slash Command
* 요청 취소
* Session 저장 및 재개

### Phase 5 — Coding Agent

* 프로젝트 파일 탐색
* Tool Calling
* Plan 모드
* 사용자 승인
* Patch 적용
* Shell 실행
* Test 실행
* Diff 및 Undo

### Phase 6 — Quality

* 단위 테스트
* 통합 테스트
* CLI E2E
* README
* macOS/Linux 검증
* 패키징
* 설치 검증

각 Phase별로 독립적인 Git commit을 생성한다.

---

## 26. 완료 조건

다음 시나리오가 실제로 동작해야 완료로 판단한다.

```bash
nv
```

1. 최초 실행 시 API Key를 요청한다.
2. API Key 입력 내용은 노출되지 않는다.
3. 실제 NVIDIA API 요청으로 키를 검증한다.
4. 키를 안전한 Credential Store에 저장한다.
5. 사용 가능한 모델 목록을 표시한다.
6. 사용자가 모델을 검색하고 선택할 수 있다.
7. 선택한 모델로 스트리밍 대화가 가능하다.
8. CLI 종료 후 다시 실행해도 키를 재입력하지 않는다.
9. 모델 변경과 세션 재개가 가능하다.
10. `nv agent`에서 현재 프로젝트를 분석할 수 있다.
11. 파일 변경 전 계획과 Diff를 보여준다.
12. 사용자 승인 없이 파일을 변경하지 않는다.
13. 승인 후 Patch를 적용하고 테스트할 수 있다.
14. `/undo`로 CLI가 수행한 최근 변경을 되돌릴 수 있다.
15. 어떠한 로그나 세션 파일에도 API Key가 노출되지 않는다.
16. `nv doctor`로 연결 및 실행 환경을 진단할 수 있다.
17. README만 보고 신규 사용자가 설치부터 대화까지 완료할 수 있다.

---

## 27. 작업 규칙

* 단순 예제 코드에서 종료하지 않는다.
* TODO나 가짜 구현을 남기지 않는다.
* 모델 목록을 임의로 하드코딩하지 않는다.
* 공식 API 지원 여부를 실제 요청과 문서로 확인한다.
* API가 지원하지 않는 기능은 지원한다고 표현하지 않는다.
* NVIDIA API Key를 코드, 테스트, 로그, 세션에 포함하지 않는다.
* 사용자의 기존 파일을 승인 없이 수정하지 않는다.
* 위험한 Shell 명령을 자동 실행하지 않는다.
* 기존 프로젝트가 있다면 기존 아키텍처와 코딩 규칙을 우선 분석한다.
* 동일 파일을 여러 Agent가 동시에 수정하지 않는다.
* 구현 후 실제 터미널에서 처음부터 끝까지 E2E 테스트한다.
* 테스트가 통과하기 전 완료 처리하지 않는다.
* 구현 과정에서 확인된 NVIDIA API 제한사항은 README의 알려진 제한사항에 기록한다.

최종 결과물에는 다음을 함께 제공한다.

1. 구현 완료 요약
2. 전체 디렉터리 구조
3. 설치 및 실행 명령
4. 지원 명령어
5. 테스트 결과
6. 보안 검증 결과
7. 미지원 또는 확인 불가능한 NVIDIA 기능
8. 생성된 Git commit 목록


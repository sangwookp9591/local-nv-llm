# NV — NVIDIA Terminal AI Agent

`nv`는 **NVIDIA Build / NIM API** 기반의 고성능 대화형 Terminal AI 에이전트 CLI 도구입니다.

---

## 🚀 주요 기능

- ⚡ **터미널 독립 실행 바이너리**: `nv` 한 단어로 터미널 어디서나 실행
- 🔐 **보안 인증 저장소**: AES-256-GCM 로컬 암호화 및 `chmod 600` 파일 권한으로 API Key 보호
- 🛡️ **자동 마스킹 (Redaction)**: 모든 출력, 오류 메시지 및 로그에서 API Key 유출을 자동 방지
- 🤖 **동적 모델 카탈로그**: NVIDIA Build API를 통해 최신 LLM (Nemotron, Llama 3.3, DeepSeek R1 등) 조회 및 오프라인 캐시 지원
- 💬 **스트리밍 대화 & TUI**: SSE 기반 마크다운 렌더링, 수신 응답 스트리밍, Reasoning 모델(DeepSeek R1) 사고 과정 지원
- 🛠️ **코딩 에이전트 도구 (Agent Tools)**: 파일 탐색, 읽기/쓰기, 명령어 실행, Git 연결
- ⏪ **Undo & 패치 추적**: AI가 변경한 파일을 개별 스냅샷으로 기록하여 `/undo` 명령으로 완벽 복원
- 🩺 **nv doctor 진단 툴**: 실행 환경, Node.js 버전, API Key 상태, 네트워크 연결성 한눈에 검증

---

## 📦 설치 및 등록

```bash
# 의존성 설치 및 빌드
pnpm install
pnpm build

# 시스템 전역 링크 (nv 명령어 등록)
npm link
```

---

## 🔑 시작하기 (API Key 설정)

NVIDIA Build API Key는 [build.nvidia.com](https://build.nvidia.com)에서 무료로 발급받을 수 있습니다.

```bash
# 최초 로그인
nv auth login

# 로그인 상태 확인
nv auth status

# 로그아웃 (저장된 자격 증명 삭제)
nv auth logout
```

---

## 💻 사용법

### 1. 비대화형 파이프라인 모드 (`-p`)
```bash
# 한 줄 질문 및 응답
nv -p "현재 Git diff를 요약해줘"

# 파일 및 리다이렉션 응답 저장
nv -p "Spring Boot 대량 엑셀 업로드 구조를 설명해줘" > review.md

# JSON 형식 출력
nv -p "프로젝트 구조 분석" --json
```

### 2. 특정 모델 지정 실행
```bash
nv --model nvidia/nemotron-3-super-120b-a12b
```

### 3. 진단 도구
```bash
nv doctor
```

---

## 💬 Slash Commands (대화형 셸)

대화 창에서 다음 슬래시 명령어를 사용할 수 있습니다:

- `/help` : 사용 가능한 모든 슬래시 명령어 표시
- `/model` : 현재 사용 중인 모델 정보 및 변경
- `/models` : 모델 선택 픽커 표시
- `/compact` : 대화 맥락 요약 (컨텍스트 절약)
- `/undo` : AI가 변경한 최근 파일 패치 되돌리기
- `/status` : 현재 연결 및 세션 상태 확인
- `/clear` : 화면 및 대화 렌더링 초기화
- `/exit` : NV CLI 종료

---

## 🧪 테스트 실행

```bash
# Vitest 단위 및 통합 테스트 실행 (31개 테스트 전원 통과)
pnpm test
```

---

## 📄 License
ISC License.

<div align="center">

# ⚡ NV — NVIDIA Terminal AI Agent

**NVIDIA Build / NIM API 기반의 고성능 대화형 Terminal AI 에이전트 CLI**

[![Node.js Version](https://img.shields.io/badge/node.js->=22.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Test Suite](https://img.shields.io/badge/vitest-83%20passed-8A2BE2.svg?style=flat-square)](https://vitest.dev/)
[![Status Bar](https://img.shields.io/badge/status%20bar-ANSI%20Real--time-FF69B4.svg?style=flat-square)](./STATUS_BAR.md)
[![License](https://img.shields.io/badge/license-ISC-orange.svg?style=flat-square)](./package.json)

<p align="center">
  Claude Code, Codex CLI, Agy와 같이 터미널 환경에서 완벽하게 작동하는 독립형 AI CLI 도구입니다.<br />
  NVIDIA Build API의 최첨단 LLM (Nemotron, Llama 3.3, DeepSeek R1)을 활용하며, <strong>실시간 Status Bar UI & SSoT 이벤트 루프</strong>를 내장하여 에이전트 작업 상태, Rate Limit, 토큰 사용량을 한눈에 제어합니다.
</p>

</div>

---

## 📑 목차 (Table of Contents)

1. [✨ 주요 특징 (Features)](#-주요-특징-features)
2. [🖥️ 실시간 Status Bar UI & Control Surface](#️-실시간-status-bar-ui--control-surface)
3. [🏗️ 아키텍처 구조 (Architecture)](#️-아키텍처-구조-architecture)
4. [⚡ Rate Limit & 요청 스케줄러 (Rate Limiting)](#-rate-limit--요청-스케줄러-rate-limiting)
5. [🚀 빠른 시작 가이드 (Quick Start)](#-빠른-시작-가이드-quick-start)
6. [📖 상세 사용법 (Usage Guide)](#-상세-사용법-usage-guide)
7. [⚡ Slash Commands 완벽 레퍼런스](#-slash-commands-완벽-레퍼런스)
8. [🧪 개발 및 테스트 (Development & Testing)](#-개발-및-테스트-development--testing)

---

## ✨ 주요 특징 (Features)

- ⚡ **단일 명령어 바이너리**: 어디서나 `nv` 한 단어로 실행되는 경량 CLI
- 🖥️ **실시간 ANSI Status Bar**: 터미널 최하단에 현재 Goal, Model, Active Agents, RPM/TPM, Warning 및 경과 시간 렌더링
- 🎯 **자율 엔지니어링 루프 (`/goal`)**: 8단계(OBSERVE ➔ PLAN ➔ EXECUTE ➔ VERIFY 등) 자율 문제 해결
- 🔐 **하드웨어/운영체제 레벨 자격 증명 보안**: AES-256-GCM 로컬 암호화 및 `chmod 600` 저장소
- 🎛️ **AIMD 적응형 Rate Limiter**: HTTP 429 감지 시 동시성 25% 즉시 축소, 25회 연속 성공 시 동시성 자동 복구
- 🛠️ **Circuit Breaker & 중복 실패 차단**: 동일 도구 연속 실패 시 자동으로 도구 락을 걸어 무한 반복 차단

---

## 🖥️ 실시간 Status Bar UI & Control Surface

터미널 하단에 고정 표시되는 Status Bar는 4가지 모드를 지원합니다.

```text
 NV │ GOAL RUNNING 6/12 │ MODEL nemotron-3-super-120b │ AGENTS 3/5 │ RPM 18/40 │ TPM 72K/120K │ ⚠ 1 │ 00:02:31
```

- **Compact Mode**: `nv status compact` (좁은 터미널 자동 대응)
- **Normal Mode**: `nv status normal` (기본 표준 바)
- **Expanded Panel Mode**: `nv status expanded` (모든 활성 에이전트 상세 패널)
- **Off Mode**: `nv status off` (CI 및 파이프라인 환경)

---

## ⚡ Slash Commands 완벽 레퍼런스

| Slash Command | 설명 |
| :--- | :--- |
| `/status [mode]` | Status Bar 모드 변경 (`compact`, `normal`, `expanded`, `off`) |
| `/goal <objective>` | 자율 엔지니어링 루프 시작 및 목표 상태 조회 |
| `/permissions` | 승인된 경로 및 파일 접근 권한 관리 |
| `/project` | 마커 기반 프로젝트 루트 탐색 및 후보 조회 |
| `/orchestration` | Multi-Agent Orchestration 켜기/끄기 (`on`, `off`) |
| `/limits` | 현재 NVIDIA Rate Limit 및 요청 제어 상태 확인 |
| `/queue` | 대기 중인 API 요청 큐 상태 확인 |
| `/usage` | 현재 세션의 API 성공/429/503 및 사용 시간 메트릭 확인 |
| `/model <id>` | 현재 대화 모델 변경 및 정보 확인 |
| `/compact` | 이전 대화 맥락을 요약하여 API 컨텍스트 토큰 절약 |
| `/undo` | AI 에이전트가 최근 변경한 파일 수정 사항 되돌리기 |

---

## 🧪 개발 및 테스트 (Development & Testing)

Vitest 기반의 단위 및 통합 테스트 83개가 준비되어 있습니다.

```bash
# 전체 테스트 실행 (83개 테스트)
pnpm test

# 커버리지 리포트 생성
pnpm test:coverage

# 생산용 바이너리 빌드
pnpm build
```

---

<div align="center">

**Built with ❤️ for AI Engineers & Developers using NVIDIA Build**

</div>

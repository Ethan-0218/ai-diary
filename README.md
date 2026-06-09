# AI 일기 (PoC)

AI 어시스턴트가 유저와 대화를 나눈 뒤 그 내용으로 **일기를 대신 써주는** 서비스의 PoC.
대화 → 일기 생성 플로우를 모델/형식을 바꿔가며 실험하고, 모든 LLM 호출의 토큰·비용·원본
입출력을 DB에 기록해 개선점을 찾는 것이 목표.

## 기능
- 웹 채팅 UI. 시작하면 AI가 현재 날짜/시간을 알고 먼저 말을 건다.
- 일기 형식 3종(일반 / 신문 / 소설) — 형식별로 페르소나·필요 정보·일기 톤이 다름.
- 모델 전환(Claude / OpenAI / Gemini, vercel `ai` SDK).
- 사진 첨부: AI가 적절한 순간에 제안 → 업로드 → 비전 모델이 캡션 생성 → 일기에 반영.
- 일기 생성: "일기 완성하기" 버튼 + AI의 자동 제안(`offerDiaryDraft`).
- 날짜/시간 기준 대화 히스토리 보존.
- **LLM 비용·raw 데이터 추적**: 채팅/사진/일기 각 단계 비용을 화면에 표시, 원본 입출력은 DB 보존.

## 구조 (pnpm 모노레포)
```
apps/web      Next.js 16 + React 19 (채팅 UI)
apps/api      NestJS 10 + Prisma(SQLite) + ai SDK v6
apps/mobile   React Native 0.84 + TS (iOS, Metro 포트 9002 고정)
packages/shared  일기 형식/모델/가격 정의, 공용 타입
```
> `apps/mobile`은 RN/Metro 궁합 때문에 루트 워크스페이스에서 제외한 **독립 pnpm 프로젝트**다.
> `@ai-diary/shared`는 `link:`(심링크)로 가져와 web/api와 동일 코드를 공유한다.

## 셋업
```bash
pnpm install

# API 키 설정
cp apps/api/.env.example apps/api/.env   # ANTHROPIC/OPENAI/GOOGLE 키 입력
cp apps/web/.env.example apps/web/.env.local

# shared 빌드 + DB 마이그레이션
pnpm --filter @ai-diary/shared build
pnpm db:migrate

# 실행 (shared watch + api:9001 + web:9000 + mobile Metro:9002 동시)
pnpm dev
```

### 개발 스크립트 (루트)
| 명령 | 설명 |
|---|---|
| `pnpm dev` | shared(tsc watch) + api(9001) + web(9000) + **mobile Metro(9002)** — 풀스택 개발 |
| `pnpm dev:web` | 위에서 Metro 빼고 shared + api + web만 — 웹/백엔드만 볼 때 |
| `pnpm mobile` | mobile Metro(9002)만. shared watch는 `pnpm dev`/`shared:dev`가 따로 떠 있어야 라이브 반영 |
| `pnpm ios` | iOS 시뮬레이터 빌드·실행 (`apps/mobile`) |
| `pnpm shared:dev` | shared만 tsc --watch |
| `pnpm build` | shared → api → web 빌드 |

> **포트**: web 9000 · api 9001 · **mobile Metro 9002**(기본 8081 회피).
> **shared 라이브 반영**: shared는 dist(컴파일물)를 소비하므로 `tsc --watch`(= `shared:dev`)가 떠 있어야 수정이 web/api/mobile에 자동 반영된다. shared watch는 한 곳에서만 띄울 것(중복 시 dist 경합).

## 데이터 모델 (Prisma)
- `Conversation` / `Message` / `Attachment` / `Diary`
- `LlmUsage` — 호출별 토큰·비용 집계 (step: first_greeting | chat_turn | photo_caption | diary_generation)
- `LlmCallTrace` — 호출별 원본 request/response payload (개선점 분석용)

`pnpm db:studio`로 DB를 들여다보며 각 호출의 비용·원본을 확인할 수 있다.

## 주요 엔드포인트 (api)
- `POST /conversations` — 대화 생성 + AI 첫 인사
- `POST /conversations/:id/chat` — 스트리밍 채팅 (`useChat` 타깃)
- `POST /conversations/:id/attachments` — 사진 업로드 + 비전 캡션
- `POST /conversations/:id/diary` — 일기 생성
- `GET /conversations/:id/costs` — 비용 요약

## 빌드/타입체크 메모
- `apps/api`는 **SWC 빌더**로 컴파일한다(`nest-cli.json`의 `builder: "swc"`). vercel `ai` v6의
  `streamText`/`tool`/`convertToModelMessages` 제네릭이 전체 `tsc` 타입체크를 과도하게 무겁게
  만들어(수 GB OOM) PoC 개발 루프를 막기 때문이다. `apps/web`(Next)·`packages/shared`는 정상적으로
  타입체크된다.
- LLM 호출 경로(첫 인사/스트리밍 채팅/일기 생성/비용·트레이싱)는 **키 없이도 검증**할 수 있게
  mock 모델 런타임 테스트를 둔다: `node scripts/smoke.mjs` (먼저 `pnpm --filter @ai-diary/api build`).
- 실제 LLM 응답을 보려면 `apps/api/.env`에 provider 키를 채워야 한다.

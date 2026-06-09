# 플랜 — 첫 빌드를 TestFlight 검수 통과까지 (마일스톤 0)

> **방식**: 큰 개발 단계만 먼저 정한다. 각 단계의 상세 플랜은 **그 단계에 도착했을 때** 따로 짠다(작게).
> **목표(이 마일스톤)**: **빈손 → 개발환경 → 제대로 된 앱(S3) → IAP → TestFlight 업로드 → 검수 통과 → 샌드박스 결제 테스트**까지 "실제 앱 + 배포 + 결제 파이프라인"을 끝까지 뚫는다.
> **S3는 버리는 껍데기 앱이 아니다.** PoC에서 검증한 내용을 바탕으로 **제대로 된 앱의 모양**(기획·AI agent·백엔드·프론트·연동까지)을 갖춘다. 그래서 S3를 5개 하위 단계로 쪼갠다.
> **전제**: Apple Developer Program 가입 완료(✅). → S1은 앱 레코드·유료계약만.
> **플랫폼**: iOS(TestFlight) 우선. Android(Play 내부테스트)는 이 마일스톤 밖.
> **스택**: React Native CLI + TypeScript, pnpm 모노레포 + Node/Nest 백엔드 + AI agent.

---

## "검수"가 뭔지 (먼저 정리)
TestFlight엔 두 종류:
- **내부 테스트(Internal)**: 본인/팀(최대 100명). **검수 없음·즉시** 설치 가능.
- **외부 테스트(External)**: 외부인에게 배포. **Beta App Review(베타 검수)** 필요 — App Store 정식 심사보다 가벼움.

→ 이 마일스톤의 "검수 통과" = **외부 테스트용 Beta App Review 승인**. (내부 테스트는 그 전에 즉시 확인)

---

## 큰 개발 단계 (이것만 먼저 확정, 상세는 JIT)

| 단계 | 큰 그림 | "끝" 기준 |
|---|---|---|
| **S1. 앱 등록·유료계약** | ASC 앱 레코드(이름·Bundle ID) 생성 + **Agreements/Tax/Banking(유료 앱 계약) 활성화**(IAP 필수) | 앱 레코드 보임 + 유료계약 Active |
| **S2. 로컬 개발환경** | Xcode·Node·watchman·Ruby/CocoaPods·RN CLI + pnpm 모노레포 골격(`apps/mobile`) + RN+TS 앱 생성 | 시뮬레이터/실기기에서 앱 실행 |
| **S3. 제대로 된 앱** | PoC 검증분을 바탕으로 **실제 앱의 모양**을 갖춘다. 아래 5개 하위 단계로 진행(상세는 각 단계 도착 시 JIT) | 아이콘·스플래시·앱 이름 포함, 대화→일기 핵심 플로우가 앱에서 동작 |
| ├ **S3.1 서비스 세부 기획** | 화면/플로우/데이터모델·기억 범위·포맷·온보딩 등 무엇을 만들지 확정 | 화면 목록 + 핵심 플로우 명세 확정 |
| ├ **S3.2 AI agent 개발** | 대화 전략(상태머신+체크리스트)·기억·일기 생성/수정 agent 구현·평가 | 입력→agent→일기 초안이 서버에서 나옴 |
| ├ **S3.3 백엔드 개발** | Node/Nest API·인증(소셜/카카오)·DB(Postgres+pgvector)·파일/이미지·agent 연동 | API로 대화·일기·기억 CRUD 동작 |
| ├ **S3.4 프론트엔드 개발** | RN 화면·내비게이션·대화 UI·일기 뷰·이미지·온보딩 | 앱에서 대화→일기까지 화면으로 흐름 |
| └ **S3.5 연동 테스트·개선** | 프론트↔백↔agent end-to-end + 버그·품질 개선 | 실기기에서 핵심 플로우 통과 |
| **S4. IAP 셋업 (+ 일기장 소유 모델)** | 일기장 소유 모델 신설 + ASC 상품(**Consumable** — 매달 재구매 위해, 소유는 백엔드 계정 추적) + 결제 SDK(**react-native-iap 확정**) + **구매·복원 UI + 구매 후 사용**. 5개 하위 단계(S4.1~4.5) | 구매 → 백엔드 검증 → 일기장 발행 → 그 일기장으로 대화·일기 |
| **S5. 서명·릴리스 빌드** | Bundle ID·인증서·프로비저닝(Xcode 자동 서명) + 버전/빌드번호 + Release archive | 아카이브 성공 |
| **S6. 업로드·내부테스트** | ASC 업로드(Xcode/Transporter) + 수출규정(암호화) 답변 + 내부 테스터 설치 | 내 기기에 TestFlight 설치 |
| **S7. 샌드박스 결제 테스트** | 샌드박스 테스터 계정 + TestFlight 빌드에서 구매·복원 흐름 통과(무과금) | 결제가 샌드박스로 완료됨 |
| **S8. 외부 검수 통과** | 테스트 정보·외부 그룹 + Beta App Review 제출 → 승인 | 외부 배포 가능(✅ 마일스톤 완료) |

> 참고: TestFlight 빌드의 IAP는 **자동으로 샌드박스(무과금)**. 외부 검수(S8) 전, 내부 설치(S6) 직후 바로 S7 결제 테스트 가능.

### 📍 진행 현황 (2026-06-08)
- ✅ **S1**(앱등록·유료계약) · ✅ **S2**(로컬 개발환경) · ✅ **S3.1**(서비스 기획) · ✅ **S3.2**(AI agent 구현+검증)
- ✅ **S3.3 백엔드 코어 완료**: Node/Nest API · 인증(소셜 검증·JWT·가드·dev-login) · DB(Postgres+pgvector, TypeORM) · 파일/이미지(업로드·vision·HEIC) · agent 연동 · **테스트 커버리지 100%**.
  - 남은 것: 기억 CRUD=**M3 연기**(pgvector 준비됨) · 실 OAuth client id=앱등록(외부) · prod 마이그레이션 전환.
- ✅ **S3.4 프론트(모바일 코어 루프)** · ✅ **S3.5 하드닝** · ✅ **M3 기억** — main 머지(b75aefb, 2026-06-09).
- ⬜ **다음 = S4 IAP + 일기장 소유 모델**(브랜치 `s4-iap-commerce`, react-native-iap 확정) → S5~S8(릴리스·TestFlight).

---

## 진행 규칙
- 한 번에 한 단계만. 그 단계 시작할 때 **그 단계용 상세 체크리스트**를 여기 아래에 덧붙여 가며 진행.
- 막히면 그 단계만 깊게 파고, 다음 단계는 건드리지 않는다.

## 단계별 상세 (도착하면 채움)

### S1 상세 — 앱 등록·유료계약 (진행 중)
> **확정 사항**: Bundle ID = `com.ai-diary.app` (✅ A1에서 등록 완료, 변경 불가) · 앱 이름 = "AI 일기"(가칭, S8 전 확정 가능) · 1차 언어 = 한국어
> **성격**: 전부 웹 콘솔 수동 작업(코드 없음). 아래 A→B 순서로.

**A. Bundle ID 등록 + 앱 레코드 생성**
- [x] A1. ✅ Bundle ID `com.ai-diary.app` 등록 완료 (developer.apple.com → Identifiers → App ID)
- [x] A2. ✅ ASC New App 생성 완료 (iOS · `AI 일기` · ko · com.ai-diary.app · SKU aidiary-001)
- [x] A3. ✅ **끝 기준 ①**: 앱 레코드 생성됨.

**B. 유료 앱 계약 활성화 (IAP 필수 전제)** — 현재 Paid Apps = **Pending User Info**
- [x] B1. ✅ Paid Apps Agreement 약관 동의 완료
- [x] B2. ✅ Bank Account 등록 (IBK기업은행 4017, 상태 Processing — 24h 내 반영)
- [x] B3. ✅ 세금 양식 제출 완료: W-8BEN **Active**, U.S. Certificate of Foreign Status **Active**, Republic of Korea Tax Form **Pending**(검토 중) — 개인사업자=Individual/Sole proprietor, BRN(사업자등록증) 업로드
- [x] B4. ✅ Complete Compliance Requirements(한국법 계정 검증) — 이메일로 처리 완료, 상단 배너 사라짐
- [ ] B5. **끝 기준 ② (대기 중)**: Paid Apps 현재 **Processing** → Apple 검토 후 **Active** 되면 S1 완료. 대기: 은행 ~24h, 한국 세금양식 Pending 검토. **내일 ASC→Business에서 Active 확인할 것.**

**S1 완료 = A3 + B5 둘 다 충족.** 막히는 화면 캡처/메시지를 주면 그 지점만 깊게 안내.
- ~~S1 상세: _(아직)_~~

### S2 상세 — 로컬 개발환경 (진행 중)
> **확정**: RN 0.84.1 + TS (naming-studio mobile과 동일 버전) · Metro 포트 **9002 고정** · mobile은 **독립 pnpm 프로젝트**(루트 워크스페이스에서 제외, `.npmrc node-linker=hoisted`) · 위치 `apps/mobile`
> **포트 규칙**: web 9000 / api 9001 / **mobile(Metro) 9002**. 8081(기본·점유중), 8088(naming-studio) 회피.

- [x] S2-1. ✅ 툴체인 점검 — Node 22.18 · pnpm 10.15 · watchman · Ruby 3.2.2 · CocoaPods 1.16.2 · Xcode 26.2 (전부 설치됨, 추가 설치 불필요)
- [x] S2-2. ✅ 루트 `pnpm-workspace.yaml`에 `!apps/mobile` 추가 + mobile에 자체 `pnpm-workspace.yaml`(`packages: []`)로 독립 root 처리 (안 그러면 install이 루트 워크스페이스로 올라가 mobile을 건너뜀)
- [x] S2-3. ✅ RN 0.84.1 + TS 앱 생성 (프로젝트명 `AiDiary`, react 19.2.3). init이 만든 중첩 `.git` 제거.
- [x] S2-4. ✅ `.npmrc` = `node-linker=hoisted` → `pnpm install` (837 pkgs, react-native 0.84.1 확인)
- [x] S2-5. ✅ Metro 9002 고정: package.json start `--port 9002` + `ios/AiDiary/AppDelegate.swift` bundleURL `localhost:9002`. (ios 스크립트도 `--no-packager`)
- [x] S2-6. ✅ `bundle install`(cocoapods 1.15.2) → `bundle exec pod install` (74 pods, `AiDiary.xcworkspace` 생성). ※ rvm gemset에 전역 pod 없어서 bundler 경유.
- [x] S2-7. ✅ iPhone 15 Pro 시뮬레이터에서 앱 실행, Metro **9002**에서 `index.js` 번들 로드 확인, RN 0.84.1 기본 화면 표시.
  - 참고: 개발 빌드 Bundle ID는 기본값 `org.reactjs.native.example.AiDiary` — App Store용 `com.ai-diary.app`는 S5(서명)에서 설정.
- [x] S2-8. ✅ **모노레포 연동 검증 (shared ↔ app/backend)**:
  - shared/api/web 빌드 OK (`pnpm build` 통과). api·web은 `@ai-diary/shared`(`workspace:*`)를 정상 import 중.
  - mobile은 독립 프로젝트라 워크스페이스 링크가 끊겨서 **`@ai-diary/shared`를 `link:../../packages/shared`(심링크)로 연결**. metro.config에 `watchFolders=[repoRoot]` 추가.
  - 검증: App.tsx에서 `DIARY_FORMAT_LIST`/`MODEL_OPTIONS` import → Metro 번들에 포함(`일반 일기` 등), resolution 에러 0, 시뮬레이터 런타임 렌더 확인. (App.tsx는 연동 확인용 임시 화면 — S3.4에서 교체)
  - **개발 루프**: shared 수정 시 `pnpm --filter @ai-diary/shared dev`(tsc --watch)로 dist 갱신 → Metro가 watchFolders로 자동 반영. (`link:`라 재설치 불필요. cf. `file:`는 하드링크 복사라 매번 재설치 필요했음)
- [x] S2-9. ✅ 루트 dev 스크립트 정비: `dev`(shared watch+api+web), `dev:all`(+mobile metro), `mobile`, `ios`, `shared:dev`. shared watch는 `dev`/`shared:dev`가 단독 소유(중복 watch 방지). README에 표로 문서화.
- [x] **S2 완료** — 빈손→앱 실행 + 모노레포 shared 연동 + 개발 스크립트까지 검증 완료.
- S2 상세: _(위로 이동)_
### S3.1 상세 — 서비스 세부 기획 ✅ (별도 doc)
> 전체 산출물: **`docs/s3.1-service-ux.md`** (living doc).
- ✅ **타겟·핵심경험**: 1순위 = A+B "못 쓰는 기록·정리러", 핵심가치 순위 = 쉬움>정서보상>결과물>기억.
- ✅ **중심 모델 = 일기장(notebook)**: 구독이 아닌 *일기장 구매*. 포맷=일기장 속성, 기간형(연대기·저렴)+칸형(테마·프리미엄), 여러 권(홈/알림은 종류가 결정), 무료 스타터(기간형 3칸), 음성(STT)=일기장 속성, 소유(buy-to-own)+12권 번들, 그림일기는 출시 후순위.
- ✅ **화면맵**: 적응형 홈(오늘 상태 3) + 책장 + 대화/일기뷰/수정/스토어/온보딩/설정.
- ✅ **핵심 플로우**: 온보딩(5.1)·일상 루프(5.2) 확정 / 스토어·책장·사진·기억·설정(5.3~5.7) 잠정.
- ✅ **생성 품질 기획 완료**(2026-06-08, `docs/s3.2-generation-quality.md`): 페르소나(일기장 속성)·인터뷰(하이브리드 상태머신)·가드·문체/길이 4영역 확정.
- **S3.2 구현 진행** (2026-06-08, web 하니스에서 라이브 검증): 기존 PoC 대화엔진(`apps/api`+`apps/web`)을 기획 스펙으로 업그레이드.
  - [x] **① formats.ts 재설계** — 공통 바닥 분리(말투 비고정) + 3 페르소나(친구 반말/리포터 존댓말/소설가) + diaryPrompt에 C2·C3·D1·D2 가드.
  - [x] **② 하이브리드 상태머신** — `offerDiaryDraft`(자율) → `updateCollectionState` 툴(매 턴 구조화 꼬리표). `Conversation.collectionState`(JSON)에 하루 누적, buildChatSystem이 상태 주입. enough=부드러운 제안(나그 스로틀).
  - [x] **③ enough→CTA** — 프론트 시그널을 `enough`로 구동(리로드 시드 포함).
  - [x] **라이브 검증(Claude Haiku, Gemini 크레딧 소진으로 대체)**: 존댓말/반말 인사 분리 · 사건만→enough=false · 감정=유저확인만 충족 · 누적 · enough→자연 제안 · 일기 글말체+어휘에코+창작금지 · 기자 육하원칙. ✅ S3.2 끝기준("입력→agent→일기") 충족.
  - **남은 것**: 메모리(연속성·예정기억 greeting)=M3 · 일기장 커머스/책장=S3.3/3.4 · 모바일 UI=S3.4. 개선 nit: 일기에 대화 메타발언("이쯤이면 충분") 섞임 → 생성 프롬프트에 제외 한 줄(완료).
- S3.2 상세: _(위 구현 진행 — agent 코어 web 검증 완료)_
### S3.3 상세 — 백엔드 (2026-06-08, 진행 중)
> 기존 PoC API(대화·일기·사진 CRUD)를 실스택으로 끌어올림. **백엔드 테스트 커버리지 100% 유지**(유저 지침).
- [x] **DB: SQLite → Postgres+pgvector** (docker-compose 포트 5434). **ORM = TypeORM**(엔티티 기반 스키마, dev synchronize) — Prisma에서 전환(친숙도·명시성). prod 전 마이그레이션 전환 예정.
- [x] **인증**: User 모델 + AuthService(Google/Apple/Kakao id_token 검증 + dev-login) + @nestjs/jwt + JwtAuthGuard. `/auth/login·dev-login·me`.
- [x] **유저 스코프**: Conversation/Diary → userId, ConversationController 가드, requireConversation(id,userId) 소유권(타인 NotFound). web 하니스는 자동 dev-login으로 토큰 첨부.
- [x] **테스트 100%**: jest+@swc/jest, 전 서비스 백필(110 tests, 글로벌 100%). 게이트 `pnpm --filter @ai-diary/api test:cov`.
- **남은 것**: 기억(M3, pgvector 벡터검색) · OAuth 실제 client id 연결(앱 등록 후, 현재 dev-login으로 대체) · 실 모바일 로그인 UI=S3.4.
- S3.3 상세: _(위 — 백엔드 핵심 완료, 기억은 M3)_
### S3.4 상세 — 프론트엔드(모바일 UI) (2026-06-08, 진행 중)
> **목표**: web 하니스에서 검증된 **대화→일기 코어 루프**(Home→Chat→Diary)를 RN 앱(`apps/mobile`)으로 충실히 이식. S3.1 적응형 홈·책장·스토어·온보딩은 코어가 기기에서 돌면 단계적으로 올림(커머스/IAP=S4).
> **결정(2026-06-08)**: ① 1차 범위 = **코어 루프 충실 포팅**(web 3화면 1:1). ② 로그인 = **실 소셜로그인 먼저, Apple 우선**(App Store 검수 필수·iOS 네이티브·audience=Bundle ID). ③ 외부 OAuth 자격증명은 유저 콘솔 작업 안내 후 `.env` 주입.

**네비게이션 — React Navigation Native Stack**
- 인증 게이트: `AuthContext`(토큰 AsyncStorage 보관) → 미인증=`Login`, 인증=코어 스택.
- 코어 스택: `Home`(포맷·모델 선택 + 히스토리) → `Chat {conversationId}`(스트리밍 대화) → `Diary {conversationId}`(일기 뷰/수정/피드백). web `page.tsx`/`Chat.tsx`/`diary/[id]` 1:1 대응.

**백엔드 계약(이미 존재, web과 공유)**
- `POST /auth/login {provider, token}` — Apple=identityToken(id_token), aud=Bundle ID `com.ai-diary.app` → 백엔드 `APPLE_CLIENT_ID`로 검증. (개발 중 코어 루프 언블락용 dev-login은 `__DEV__` 한정 escape hatch)
- `POST /conversations`(+위치) · `GET /conversations[/:id][/costs]` · `POST /conversations/:id/chat`(**AI SDK UI message stream**, 시그널=tool part `requestPhoto`/`updateCollectionState.enough`) · `POST .../diary[/revise]` · `POST .../feedback` · `POST .../attachments`(multipart).

**기술 결정**
- **스트리밍 대화**: web과 동일하게 `@ai-sdk/react` `useChat` + `ai` `DefaultChatTransport` 재사용(시그널 추출 코드 이식). RN fetch는 스트리밍 body 미지원 → 폴리필(`react-native-polyfill-globals`·`react-native-fetch-api`·`web-streams-polyfill`·`text-encoding`·`react-native-url-polyfill`) index.js 1회 셋업.
- 사진: `react-native-image-picker` → multipart 업로드(RN FormData `{uri,type,name}`).
- 일기 렌더: `react-native-markdown-display` + 사진토큰(`![](사진N)`) 치환 로직 이식.
- 인증: Apple = `@invertase/react-native-apple-authentication`. 토큰 = `@react-native-async-storage/async-storage`.
- config: `src/lib/config.ts` API_BASE(시뮬=`localhost:9001`, 실기기=LAN IP). theme: web CSS 변수 토큰화.

**빌드 순서**
- [x] **A. 파운데이션(자격증명 무관)** ✅ — deps+pod(navigation·screens·async-storage·image-picker·apple-auth), `lib/config`·`theme`·`lib/api`(토큰 스토리지)·streaming-polyfill, AuthContext(애플+`__DEV__` dev-login). zod(v4, ai SDK 의존) 위해 babel `@babel/plugin-transform-export-namespace-from` 추가.
- [x] **B. 코어 3화면** ✅(빌드·부팅·렌더 검증) — Login/Home/Chat(useChat 스트리밍)/Diary(마크다운·수정·피드백). 시뮬레이터 빌드 성공 + Login 화면 렌더(레드박스 0). 순수 로직(chat-signals·photo-tokens·absoluteUrl) 단위테스트 11개 green, tsc 통과.
  - [x] **실기기 E2E 검증 완료** ✅(2026-06-08, Honey's iPhone) — Apple 로그인 → 대화(스트리밍) → 일기까지 정상 동작 확인. S3.4 끝 기준("앱에서 대화→일기 흐름") 충족.
- [x] **C. Apple 로그인 — 네이티브/서명 설정 완료** ✅ — Bundle ID `org.reactjs…` → **`com.ai-diary.app`** 전환(Xcode 자동서명, Team=YEONGHAN KWON, 프로비저닝 정상) + **Sign in with Apple** capability/entitlement 추가 + Location(When In Use) usage 설명 채움 + `apps/api/.env` **`APPLE_CLIENT_ID=com.ai-diary.app`**. 새 Bundle ID로 **빌드·설치·부팅·Login 렌더 확인**.
  - [x] **라이브 라운드트립 검증 완료** ✅(2026-06-08) — 시뮬레이터 Apple ID 로그인 → "Sign in with Apple" 탭 → `/auth/login`(aud=com.ai-diary.app) 검증 → JWT 발급 → 토큰 저장 → Home 진입 + authed `listConversations` 성공.
- S3.4 상세: _(위 — A·B·C + 실기기 대화→일기 E2E 검증 완료 ✅. 개발환경 이슈도 해결: TransformStream 폴리필, 한글 IME(시뮬 한계→실기기 정상·입력칸 uncontrolled), Metro/API 호스트 자동감지(ip.txt+scriptURL, IP 하드코딩 제거). 남은 다듬기는 S3.5)_
### S3.5 상세 — 연동 테스트·개선 (2026-06-08, 진행 중)
> **목표**: 코어 루프(Home→Chat→Diary)를 실기기에서 견고하게. 브랜치 `s3.5-core-hardening`.
> **1차 = 코어 루프 하드닝(에러처리·사진·위치/날씨)**.

- [x] **① 에러처리 레이어** — `lib/errors.ts`: `ApiError`(status+body 보존) + `toUserMessage`(네트워크/401/413/404/5xx/quota → 한국어 한 줄). `api.json()`이 ApiError throw로 전환(raw `API 500:` 제거). authFetch가 **401(인증된 요청)→자동 로그아웃**(`setUnauthorizedHandler`로 AuthContext가 signOut 등록). 재사용 `ErrorState`(메시지+재시도) 컴포넌트.
- [x] **② 화면별 로드 실패·재시도** — Chat/Diary 로드 실패가 무한 스피너·조용한 삼킴 → `ErrorState`+재시도로 전환. Home 히스토리도 `.catch(()=>{})` 제거하고 인라인 에러+재시도+로딩 상태. 전 화면 Alert 메시지를 `toUserMessage`로 통일(Login 포함, Apple 취소는 계속 무시).
- [x] **③ 사진 하드닝(카메라+라이브러리)** — `lib/photo-picker.ts`: ActionSheet(카메라/보관함 선택) + `classifyPickerResponse`(취소=조용히 / 권한거부=설정 안내 / 오류=throw). Info.plist `NSCameraUsageDescription`·`NSPhotoLibraryUsageDescription` 추가.
- [x] **④ 위치/날씨(JIT)** — `@react-native-community/geolocation` 설치+pod. `lib/location.ts`: When-In-Use 권한 JIT 요청+8s 타임아웃, 거부/실패=null(코어 루프 불차단). HomeScreen `start`에서 좌표 취득→`createConversation(coords)`. 백엔드 `WeatherService`가 좌표로 날씨 생성→ChatScreen 헤더에 표시(기존 경로).
- [x] **유닛테스트+tsc 통과**: errors/photo-picker 순수 로직 15개 추가(총 26 green). image-picker(untranspiled TS)는 jest.mock. simctl 빌드로 geolocation 네이티브 링크 컴파일 검증.
- [ ] **실기기 E2E(남음)**: Honey's iPhone에 리빌드(`yarn ios --device`) 후 — 비행기모드 에러+재시도 / 카메라·보관함 사진 / 위치 권한 첫 허용→날씨 표시 / 권한 거부 시 무날씨 진행 확인.
- S3.5 상세: _(위 — 코어 하드닝 코드+자동검증 완료, 실기기 E2E만 남음)_

### S4 상세 — IAP + 일기장 소유 모델 (2026-06-09, 진행 중)
> **확정 스키마**: `docs/s4-commerce-schema.md`(react-native-iap, 칸=별도 Slot 엔티티, 카탈로그=DB, 가격은 ASC). 브랜치 `s4-iap-commerce`. 5개 하위 단계.

- [x] **S4.1 데이터 모델(백엔드)** ✅ — 엔티티 4종(`Product`·`Notebook`·`Slot`·`Purchase`) + `Conversation.slotId`. shared `products.ts` 카탈로그(4 SKU) → 부팅 시 DB 시드. 발행: `mintStarter`(기간형 3칸 멱등)·`mintFromProduct`(기간형=달력단위 남은칸·칸형=N칸). 대화 생성이 `notebookId`로 오늘 칸 해석→바인딩(멱등=하루 한 편), 일기 생성 시 칸 filled. 레거시 대화 백필. API `/products`·`/notebooks[/:id]`·`/notebooks/starter`·`/notebooks/dev-grant`(dev). web 하니스 책장/발행 UI로 전환. **api 테스트 170개·커버리지 100%** + tsc + 빌드 + **라이브 스모크**(발행→대화 칸 바인딩→멱등 검증).
- [ ] **S4.2** 1차 SKU 확정 + ASC 상품 등록 + `.storekit` + **가격 전략**(월 중 비례 과금 IAP 제약 — 보류분 재논의).
- [x] **S4.3 모바일 IAP + 스토어·책장** ✅ — react-native-iap 15(nitro)+nitro-modules(오토링크, `pod install --repo-update`로 openiap 통합, RN 0.84.1 네이티브 빌드 통과). `ios/AiDiary.storekit`(4 SKU Consumable·KRW). `lib/iap.ts`(init·fetchProducts·requestPurchase·listener·finishTransaction). StoreScreen(`/products`+StoreKit 가격→구매→발행). Home→책장(노트북→오늘 칸·빈책장=스타터/스토어). 구매 후 발행=**dev-grant 임시**(S4.4 영수증검증으로 교체). 복원=계정 로그인(Consumable이라 StoreKit restore 아님). tsc+jest 27+빌드 검증. **실기기/시뮬 구매 E2E는 수동**(.storekit 스킴 선택 + 백엔드 dev).
- **S4.3 라이브 E2E 통과** ✅(2026-06-09, Honey's iPhone) — `.storekit` 스킴 설정 + Xcode Run으로 실기기에서 **스토어(₩7,900)→StoreKit 결제 시트→백엔드 발행(dev-grant)→책장 사용**까지 라운드트립 확인. 카탈로그를 ASC 실제 등록 4개(plain/novel/newspaper 월간 W4 + plain_30)와 일치(신문 on, novel_30 off).
- [x] **S4.4 영수증 검증** ✅ — `@apple/app-store-server-library`로 StoreKit2 서명 트랜잭션(purchaseToken=JWS) 검증. `ReceiptVerifierService`(환경 분기: Sandbox/Production=Apple 루트 G3·G2 체인 / Xcode 로컬=서명 스킵·**비프로덕션 한정**). `PurchaseService.verifyAndMint`(검증→Purchase 저장·transactionId 멱등→발행, 다른 계정=Forbidden). `POST /purchases/verify`. 모바일은 dev-grant→verifyPurchase. api 테스트 198·100%·라이브 스모크(Xcode JWS→발행→멱등). 환불(App Store Server Notifications V2 웹훅)=후속.
- [x] **S4.5 샌드박스 E2E** ✅(2026-06-09, Honey's iPhone) — 실기기에서 **실제 App Store 샌드박스 구매**(이달의 신문, environment=Sandbox) → 백엔드가 **Apple 루트 체인으로 진짜 영수증 검증 통과**(Xcode 스킵 아님!) → Purchase(Sandbox) 기록 + "이달의 신문" 발행(source=purchase, 6월 22칸) + 책장 사용. DB 검증 완료. ※ ASC 상품 Missing Metadata여도 샌드박스 조회·구매 동작.
- **✅ S4(IAP + 일기장 소유 모델) 완료** — 데이터모델·상품·결제·검증·사용 전부. 다음 = S5(서명·릴리스)~S8(TestFlight·검수).
- S4 상세: _(위 — S4.1 백엔드 데이터 모델 완료)_

### S5 상세 — 서명·릴리스 빌드 (2026-06-09)
- [x] **Release 아카이브 성공** ✅ — `xcodebuild ... -configuration Release -allowProvisioningUpdates archive`. Bundle ID `com.ai-diary.app` · Team `G8L529X29G` · 버전 **1.0 / 빌드 1**. 자동 프로비저닝(서명=Apple Development, 배포 서명은 S6 export에서). 아카이브 `/tmp/AiDiary.xcarchive`(95M, dSYM 포함). RN 0.84+nitro/iap 네이티브 전부 Release 컴파일+JS 번들 통과.
- S5 끝 기준("아카이브 성공") 충족.

### S6 상세 — 업로드·내부테스트 (2026-06-09)
- [x] **fastlane 자동화 + 업로드 성공** ✅ — `ios/fastlane`(Appfile·Fastfile, `beta` 레인: build_app Release app-store export + upload_to_testflight). 인증=**ASC API 키**(env, `ios/fastlane/.env`·`.p8` 커밋금지). `bundle exec fastlane beta`로 빌드+배포서명(자동 프로비저닝, Distribution 인증서 자동생성)+업로드 성공(App 6775742546, **빌드 1**).
- [x] **앱 아이콘** ✅ — 빈 아이콘셋이라 1차 검수 거부(120/152 누락·CFBundleIconName 없음) → 1024 단일사이즈 플레이스홀더 아이콘 추가(파랑→보라+일기장 페이지). 디자인 교체는 후속.
- [x] **수출규정** ✅ — `ITSAppUsesNonExemptEncryption=false`로 프롬프트 회피.
- [x] **TestFlight 내부 설치 완료** ✅(2026-06-09) — 빌드 1 처리 완료 → 내부 테스트 그룹 생성+빌드/테스터 추가 → Honey's iPhone TestFlight 설치. **S6 끝 기준("내 기기에 TestFlight 설치") 충족.**
  - ⚠️ **백엔드 미배포 이슈**: Release/TestFlight 빌드는 `API_BASE=PROD_API_BASE`(`https://api.ai-diary.app`)인데 그 서버가 **아직 없음** → 설치는 됐으나 로그인/상품 등 실동작은 백엔드 배포 후. **S7(샌드박스결제)·S8(외부검수) 전 백엔드 배포 필요.**
- 재업로드 시: `bundle exec fastlane bump`(빌드번호 +1) 후 `fastlane beta`.
- …

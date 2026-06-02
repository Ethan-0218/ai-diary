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
| **S4. IAP 셋업** | ASC에 상품(구독/소비성) 생성 + 결제 SDK(❓ RevenueCat vs react-native-iap) + **구매·복원 UI** | 앱에 구매 버튼이 상품을 불러옴 |
| **S5. 서명·릴리스 빌드** | Bundle ID·인증서·프로비저닝(Xcode 자동 서명) + 버전/빌드번호 + Release archive | 아카이브 성공 |
| **S6. 업로드·내부테스트** | ASC 업로드(Xcode/Transporter) + 수출규정(암호화) 답변 + 내부 테스터 설치 | 내 기기에 TestFlight 설치 |
| **S7. 샌드박스 결제 테스트** | 샌드박스 테스터 계정 + TestFlight 빌드에서 구매·복원 흐름 통과(무과금) | 결제가 샌드박스로 완료됨 |
| **S8. 외부 검수 통과** | 테스트 정보·외부 그룹 + Beta App Review 제출 → 승인 | 외부 배포 가능(✅ 마일스톤 완료) |

> 참고: TestFlight 빌드의 IAP는 **자동으로 샌드박스(무과금)**. 외부 검수(S8) 전, 내부 설치(S6) 직후 바로 S7 결제 테스트 가능.

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
- S3.1 상세: _(아직)_
- S3.2 상세: _(아직)_
- S3.3 상세: _(아직)_
- S3.4 상세: _(아직)_
- S3.5 상세: _(아직)_
- …

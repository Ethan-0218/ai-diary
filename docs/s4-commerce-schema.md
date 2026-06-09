# S4 — 일기장 소유·상품 스키마 (확정 스펙, living doc)

> **목적**: S4(IAP + 일기장 소유 모델)의 데이터 모델 단일 소스.
> **상태**: 스키마 **확정**(2026-06-09, 유저 피드백 반영). 구현은 S4.1~4.5로 분할.
> **근거 기획**: `docs/s3.1-service-ux.md` §4.5(일기장 모델: A 기간/칸·B 여러권·C 스타터·STT·F 소유) + §5(플로우). 페르소나=`packages/shared/src/formats.ts`.
> **결제 SDK**: **react-native-iap**(서드파티 없이 백엔드에서 영수증 검증).

---

## 0. 확정 결정 로그 (2026-06-09)

1. **칸 = 별도 `Slot` 엔티티** — 파생 아님. 각 칸 단위 액션·부분 발행(월 중 구매 시 남은 칸만 생성)에 유리.
2. **번들(12권) = 이번 S4 제외** — 스키마는 수용(`source='bundle'`), 발행은 후속.
3. **음성(STT) = 필드만(`voiceEnabled`)** — 입력 UI·음성 업그레이드 상품·스타터 맛보기는 후속.
4. **스타터 = claim 방식** — 온보딩 포맷 택1 직후 `POST /notebooks/starter {format}`(유저당 1권, 멱등).
5. **상품 카탈로그 = DB(`Product`)** — 진열 메타데이터(표지·제목·섹션·정렬·`active`)를 재배포 없이 변경. **단 가격은 DB 아님** — IAP는 ASC SKU 가격이 진실(StoreKit이 현지화 가격 반환, 그걸 표시). DB는 "무엇을 어떻게 진열할지", StoreKit은 "가격·결제".

6. **가격 = 주 단위 비례(현재 달)** — 달력 월 책장은 유지하되, 월 중 합류 허들을 **"남은 주만큼 할인"**으로 제거. 아래 §6.

---

## 1. 관계 체인

```
Product(DB 카탈로그) ──mint──▶ Notebook ──▶ Slot[] ──fill──▶ Conversation ──▶ Diary
                                  ▲
                              Purchase(영수증 검증·소유 audit, S4.4)
```

- **Product**: 진열되는 큐레이션 SKU(고정 카탈로그). ASC와 미러.
- **Notebook**: 유저가 소유한 한 권(인스턴스). 발행 시 Product 속성을 **스냅샷 동결**.
- **Slot**: 칸. 발행 시 명시 생성(월 중 구매 = 남은 칸만). `status`가 적응형 홈 3상태의 저장소.
- **Conversation/Diary**: 기존 엔티티. Conversation이 Slot에 소속.
- **Purchase**: buy-to-own 영수증 검증·복원 근거. 별도 entitlement 테이블 불필요(Purchase+Notebook 존재=소유).

---

## 2. 엔티티

### `Product` (신규, DB — S4.1 시드)
| 필드 | 타입 | 비고 |
|---|---|---|
| id | uuid | |
| appStoreProductId | string UNIQUE | StoreKit/ASC SKU. **가격은 여기(ASC)** |
| kind | 'notebook'\|'bundle'\|'voice_upgrade' | S4.1은 notebook만 시드 |
| title, description, coverKey | string | 진열 메타 |
| format | 'plain'\|'newspaper'\|'novel' | |
| periodType | 'period'\|'cell' | 기간형\|칸형 |
| periodSpec | 'month'\|'year'\|`{days:N}` | 발행 시 기간 산출법(period만) |
| slotCount | int | 칸형 고정값(period는 periodSpec서 산출) |
| voiceEnabled | boolean | |
| bundleSize | int\|null | 번들만(후속) |
| section | '연대기'\|'컬렉션' | 스토어/책장 2섹션 |
| sortOrder | int | |
| active | boolean | 진열 on/off(재배포 없이) |
| createdAt/updatedAt | | |

> 가격 컬럼 없음. preview 힌트가 필요하면 `displayPriceHint` nullable만 추가하되 **StoreKit이 진실**.

### `Notebook` (신규) — 발행 시 카탈로그 속성 동결
| 필드 | 타입 | 비고 |
|---|---|---|
| id, userId(FK) | uuid | |
| productId | string\|null | Product.appStoreProductId 느슨한 참조(스타터=`starter:plain` 등) |
| source | 'starter'\|'purchase'\|'bundle'\|'grant' | 취득 경로 |
| purchaseId | uuid\|null | 발행 근거 Purchase(스타터/grant=null) |
| title, coverKey, format, periodType, slotCount, voiceEnabled | | **스냅샷 동결** |
| periodStart, periodEnd | date\|null | 기간형만(현지시간) |
| status | 'active'\|'completed'\|'expired' | |
| completedAt | timestamp\|null | |
| createdAt/updatedAt | | |

### `Slot` (신규) — 칸
| 필드 | 타입 | 비고 |
|---|---|---|
| id, notebookId(FK) | uuid | |
| index | int | 칸 순번 1..N |
| slotDate | date\|null | 기간형=고정 날짜 / 칸형=채울 때 기록 |
| status | 'empty'\|'drafting'\|'filled' | **적응형 홈 3상태 저장소** |
| conversationId | uuid\|null | 채워지면 그날 대화 |
| createdAt/updatedAt | | |

제약: `UNIQUE(notebookId, index)`, `UNIQUE(notebookId, slotDate) where slotDate not null`("하루 한 편=일기장 단위").

### `Conversation` (수정)
- `+ slotId uuid|null` (마이그레이션 위해 nullable)
- `format` 유지 — notebook에서 복사(agent 핫패스 조인 회피)

`Diary`/`Message`/`Attachment`/`Feedback`/`LlmUsage` 변경 없음.

### `Purchase` (신규, S4.4에서 채움)
| 필드 | 타입 | 비고 |
|---|---|---|
| id, userId(FK) | uuid | |
| appStoreProductId | string | |
| transactionId | string UNIQUE | 멱등 키(중복 검증/복원 방지) |
| originalTransactionId | string | |
| purchaseDate | timestamp | |
| environment | 'sandbox'\|'production' | |
| status | 'valid'\|'refunded'\|'revoked' | |
| rawPayload | text | JWS/영수증 원본(audit) |
| targetNotebookId | uuid\|null | 음성 업그레이드 등 기존 권 대상(후속) |
| createdAt | | |

---

## 3. 상품 카탈로그 (코드 정의 → DB 시드) — `packages/shared/src/products.ts`

shared에 카탈로그 상수(타입+시드 데이터) 정의 → API 부팅 시 `Product` 테이블에 upsert 시드. ASC SKU와 1:1.

S4.1 1차 시드(다양한 상품, ASC 등록은 S4.2):
- **plain-month**(연대기, plain, 기간형 month)
- **newspaper-month**(연대기, newspaper, 기간형 month)
- **novel-30**(컬렉션, novel, 칸형 30칸)
- **plain-30**(컬렉션, plain, 칸형 30칸)

스타터는 카탈로그 행이 아니라 `mintStarter(userId, format)` 특수 처리(format∈{plain, novel}, 기간형 3칸, voiceEnabled=false).

---

## 4. 발행/사용 동작

- **스타터 발행**: `POST /notebooks/starter {format}` — 유저당 1권 멱등. 기간형 3칸(오늘·내일·모레), firm.
- **dev-grant**(IAP 전 언블락): `POST /notebooks/dev-grant {productId}` — 카탈로그 상품을 source='grant'로 발행. dev 전용.
- **기간형 발행 시 Slot 생성**: `[max(today, periodStart) .. periodEnd]` 날짜별 1칸(월 중 구매=남은 칸만). periodStart/End는 달력 단위(month=그달 1일~말일).
- **칸형 발행 시 Slot 생성**: index 1..slotCount, slotDate=null.
- **대화 생성(`POST /conversations {notebookId, modelId, location}`)**: notebook 소유 확인 → 오늘 slot 해석(기간형=slotDate=today / 칸형=다음 empty) → 이미 conversation 있으면 그걸 반환(멱등, 하루 한 편) → 없으면 conversation 생성(format=notebook.format), slot.conversationId 연결·status='drafting'.
- **일기 생성 시**: slot.status='filled'.

---

## 5. 하위 단계

| 단계 | 빌드 |
|---|---|
| **S4.1** | 엔티티 4종 + Conversation.slotId + products.ts 카탈로그·시드 + 마이그레이션(기존 대화→스타터 권+Slot 귀속) + 스타터/dev-grant + `/products`·`/notebooks`·`/notebooks/:id` + 대화 생성 slot 바인딩 + **테스트 100%** |
| **S4.2** | 1차 SKU 확정(월간 라인=4 티어 SKU + 칸형 + 번들) + ASC 상품 등록(콘솔) + `.storekit` + Product에 `lineId`·`weeksTier` 추가 + `/products` 티어 해석 |
| **S4.3** | react-native-iap 클라 + 스토어/책장 UI + 복원 |
| **S4.4** | `Purchase` + 영수증 검증(App Store Server API) + 발행/복원 + 멱등·환불 엣지 + 테스트 |
| **S4.5** | 구매한 노트북으로 홈→대화→일기 E2E(샌드박스) |

---

## 6. 가격 모델 — 주 단위 비례 (확정 2026-06-09)

**원칙**: 달력 월 책장은 유지(찾기·회상·소장감). 월 중 합류 허들은 **"남은 주만큼 할인"**으로 제거 — 손해가 아니라 할인으로 프레이밍.

### 4구간 (현재 달, 구매 시점 남은 일수 기준)
| 티어 | 남은 일수 | 가격 | 라벨 |
|---|---|---|---|
| W4 | 22일+ | 정가(100%) | "이번 달" |
| W3 | 15–21 | ~75% | "남은 약 3주" |
| W2 | 8–14 | ~50% | "남은 약 2주" |
| W1 | 1–7 | ~25% | "남은 약 1주" |

- **발행 책 = 그 달 남은 날 전부** (S4.1 `month` 발행 그대로). 티어는 *가격표*일 뿐 칸 수와 무관. 책장엔 "6월 · N칸".
- **다음 달 예약 구매 = 항상 W4 정가**(1일 시작). 비례는 당월에만.
- **월말 꼬리(W1)**: 화면은 **"다음 달부터 시작"(정가)을 기본 추천**, W1은 보조. 그 며칠은 무료 스타터가 받쳐줌 → 나쁜 딜 구간 우아하게 회피.
- % 는 가이드라인. 실제 원화 price point는 S4.2 ASC에서 확정.

### IAP/스키마 매핑 (S4.2 구현)
- IAP는 가격당 SKU → **월간 라인당 4 SKU**(`{format}_month_w4/_w3/_w2/_w1`). 3 포맷 × 4 = 12개. 칸형·번들은 단일가.
- `Product`에 필드 추가: **`lineId`**(한 진열 카드로 묶는 키, 예 `plain-month`) · **`weeksTier`**(4/3/2/1, 단일가=null).
- **`/products`**: lineId로 묶어 **라인당 1장** 진열. 월간 라인은 백엔드가 *오늘* 남은 주 보고 **해당 티어 SKU + 라벨** 반환 → 클라가 그 SKU만 StoreKit 가격 조회·구매(클라는 티어 계산 안 함).
- **mintFromProduct**: 어느 티어로 사든 `month` → 그 달 남은 날 발행(동일).

/**
 * react-native-iap(v15, nitro) 얇은 래퍼.
 * 우리 모델: 결제는 Apple, 소유는 백엔드. 구매 성공 → 백엔드 발행/검증 → finishTransaction.
 * 상품은 모두 Consumable(매달 재구매). 로컬 테스트는 ios/AiDiary.storekit + 스킴 StoreKit 설정.
 */
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Product,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';

/** StoreKit이 돌려주는 상품(가격은 현지화 문자열 — Apple 가이드상 이 값을 표시). */
export interface IapProduct {
  productId: string;
  displayPrice: string; // 예: "₩7,900"
  displayName: string | null;
  currency: string;
}

export async function initIap(): Promise<void> {
  await initConnection();
}

export async function endIap(): Promise<void> {
  await endConnection();
}

/** productId 목록의 StoreKit 가격을 조회해 productId→IapProduct 맵으로. */
export async function fetchIapProducts(
  skus: string[],
): Promise<Record<string, IapProduct>> {
  if (skus.length === 0) return {};
  const products = ((await fetchProducts({ skus, type: 'in-app' })) ??
    []) as Product[];
  const map: Record<string, IapProduct> = {};
  for (const p of products) {
    map[p.id] = {
      productId: p.id,
      displayPrice: p.displayPrice,
      displayName: p.displayName ?? p.title ?? null,
      currency: p.currency,
    };
  }
  return map;
}

/**
 * 단건 구매 — 결제 시트를 띄우고 리스너로 완료를 기다려 Purchase를 반환한다.
 * (한 번에 하나만 진행한다고 가정. 호출부는 성공 후 백엔드 발행→finishIapPurchase 순서.)
 */
export function purchaseProduct(sku: string): Promise<Purchase> {
  return new Promise<Purchase>((resolve, reject) => {
    const cleanup = () => {
      updateSub.remove();
      errorSub.remove();
    };
    const updateSub = purchaseUpdatedListener((p: Purchase) => {
      if (p.productId === sku) {
        cleanup();
        resolve(p);
      }
    });
    const errorSub = purchaseErrorListener((e: PurchaseError) => {
      cleanup();
      reject(e);
    });
    requestPurchase({ request: { apple: { sku } }, type: 'in-app' }).catch(
      (e) => {
        cleanup();
        reject(e);
      },
    );
  });
}

/** 백엔드 발행/검증이 끝난 뒤 트랜잭션 종료(소비성). 안 부르면 큐에 남아 재발화한다. */
export function finishIapPurchase(purchase: Purchase): Promise<void> {
  return finishTransaction({ purchase, isConsumable: true });
}

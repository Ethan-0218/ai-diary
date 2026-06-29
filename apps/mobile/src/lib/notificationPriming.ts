/**
 * 알림 "사전 안내" 모달의 imperative 프레젠터 레지스트리.
 * notifications.ts가 시스템 권한을 요청하기 전에 이 모달로 이유를 먼저 설명한다.
 * (location 권한의 [[locationPriming]] 패턴과 동일 구조)
 */
type Presenter = () => Promise<boolean>;

let presenter: Presenter | null = null;

export function setNotificationPrimingPresenter(fn: Presenter | null): void {
  presenter = fn;
}

/** 사전 안내 모달을 띄우고 사용자의 선택(계속=true / 나중에=false)을 반환. */
export function presentNotificationPriming(): Promise<boolean> {
  return presenter ? presenter() : Promise.resolve(true);
}

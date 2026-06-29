/**
 * 위치 "사전 안내" 모달의 imperative 프레젠터 레지스트리.
 *
 * location.ts(라이브러리)는 컴포넌트가 아니라 모달을 직접 그릴 수 없으므로,
 * 앱 트리에 마운트된 LocationPrimingModal이 여기에 presenter를 등록하고
 * location.ts는 presentLocationPriming()으로 그 모달을 띄워 결과(계속/나중에)를 받는다.
 */
type Presenter = () => Promise<boolean>;

let presenter: Presenter | null = null;

export function setLocationPrimingPresenter(fn: Presenter | null): void {
  presenter = fn;
}

/** 사전 안내 모달을 띄우고 사용자의 선택(계속=true / 나중에=false)을 반환. */
export function presentLocationPriming(): Promise<boolean> {
  // 모달이 아직 마운트되지 않은 예외 상황에서는 흐름을 막지 않도록 통과시킨다.
  return presenter ? presenter() : Promise.resolve(true);
}

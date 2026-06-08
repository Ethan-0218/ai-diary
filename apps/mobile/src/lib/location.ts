import { Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

/**
 * 현재 위치(위경도)를 취득해 대화 생성 시 백엔드에 넘긴다(→ 날씨 메모).
 * 권한 거부·타임아웃·실패는 모두 null로 흡수한다 — 위치는 부가 기능이라
 * 코어 루프(대화→일기)를 절대 막지 않는다. 백엔드도 좌표 없으면 날씨 없이 진행.
 */
export interface Coords {
  latitude: number;
  longitude: number;
}

// When In Use 권한만 요청하고, getCurrentCoords가 직접 프롬프트를 띄우게 한다.
Geolocation.setRNConfiguration({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
});

/** 현재 좌표 — 실패/거부 시 null(throw 안 함). */
export async function getCurrentCoords(timeoutMs = 8000): Promise<Coords | null> {
  try {
    if (Platform.OS === 'ios') await requestAuthorization();
    return await new Promise<Coords | null>((resolve) => {
      Geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () => resolve(null), // 권한 거부/타임아웃/위치 끔 → 날씨 없이 진행
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 600000 },
      );
    });
  } catch {
    return null;
  }
}

function requestAuthorization(): Promise<void> {
  return new Promise((resolve) => {
    // 성공/거부 모두 resolve — 거부 시 getCurrentPosition이 곧 실패해 null이 된다.
    Geolocation.requestAuthorization(
      () => resolve(),
      () => resolve(),
    );
  });
}

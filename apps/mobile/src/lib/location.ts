import { Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { presentLocationPriming } from './locationPriming';

/**
 * 현재 위치(위경도)를 취득해 대화 생성 시 백엔드에 넘긴다(→ 날씨 메모).
 * 권한 거부·타임아웃·실패는 모두 null로 흡수한다 — 위치는 부가 기능이라
 * 코어 루프(대화→일기)를 절대 막지 않는다. 백엔드도 좌표 없으면 날씨 없이 진행.
 */
export interface Coords {
  latitude: number;
  longitude: number;
}

// 권한 프롬프트는 getCurrentCoords가 직접 제어한다(아래 ensureLocationPermission).
Geolocation.setRNConfiguration({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
});

// 위치 권한이 한 번 처리(수락→네이티브 요청)됐는지 기억하는 플래그.
// 처리된 뒤에는 사전 안내를 생략한다(네이티브도 이미 결정된 권한은 재요청 안 함).
const PERMISSION_HANDLED_KEY = 'aidiary.location.permissionHandled';

/** 현재 좌표 — 실패/거부 시 null(throw 안 함). */
export async function getCurrentCoords(timeoutMs = 8000): Promise<Coords | null> {
  try {
    if (Platform.OS === 'ios') {
      const allowed = await ensureLocationPermission();
      if (!allowed) return null; // 사전 안내에서 거절 → 위치 없이 진행
    }
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

/**
 * 네이티브 위치 권한 팝업을 띄우기 전에, 왜 위치가 필요한지 먼저 안내한다.
 * - 이미 처리됨: 네이티브에 위임(권한이 이미 결정돼 있으면 재프롬프트 없음).
 * - 최초: 안내 팝업 → '계속'이면 네이티브 권한 요청, '나중에'면 false(다음에 다시 안내).
 *
 * 이 흐름 덕분에 iOS 시스템 권한 팝업이 **설명 없이 단독으로 뜨는 일이 없다**.
 */
async function ensureLocationPermission(): Promise<boolean> {
  const handled = await AsyncStorage.getItem(PERMISSION_HANDLED_KEY);
  if (handled) {
    await requestAuthorization();
    return true;
  }

  // 앱 테마에 맞춘 커스텀 모달(LocationPrimingModal)로 안내한다.
  const proceed = await presentLocationPriming();

  if (!proceed) return false; // '나중에' — 플래그 남기지 않아 다음에 다시 안내

  await AsyncStorage.setItem(PERMISSION_HANDLED_KEY, '1');
  await requestAuthorization(); // 여기서 네이티브 시스템 팝업이 뜬다
  return true;
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

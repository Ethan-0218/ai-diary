import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import type { RNFile } from './api';

export type PhotoSource = 'camera' | 'library';

/** image-picker 응답을 의미 단위로 분류 — 순수 함수(테스트 가능). */
export type PickerOutcome =
  | { kind: 'cancel' }
  | { kind: 'permission' } // 카메라/사진 권한 거부 → 설정 안내
  | { kind: 'error'; message: string }
  | { kind: 'file'; file: RNFile };

export function classifyPickerResponse(res: ImagePickerResponse): PickerOutcome {
  if (res.didCancel) return { kind: 'cancel' };
  if (res.errorCode) {
    if (res.errorCode === 'permission') return { kind: 'permission' };
    if (res.errorCode === 'camera_unavailable') {
      return { kind: 'error', message: '이 기기에서 카메라를 사용할 수 없어요.' };
    }
    return {
      kind: 'error',
      message: res.errorMessage || '사진을 불러오지 못했어요. 다시 시도해주세요.',
    };
  }
  const file = assetToFile(res.assets?.[0]);
  if (!file) return { kind: 'error', message: '사진을 불러오지 못했어요. 다시 시도해주세요.' };
  return { kind: 'file', file };
}

/** image-picker Asset → multipart용 RNFile (uri 없으면 null). */
export function assetToFile(asset: Asset | undefined): RNFile | null {
  if (!asset?.uri) return null;
  return {
    uri: asset.uri,
    type: asset.type ?? 'image/jpeg',
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
  };
}

/** 카메라/보관함 선택 시트 — 취소 시 null. */
function chooseSource(): Promise<PhotoSource | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['취소', '카메라로 촬영', '보관함에서 선택'],
          cancelButtonIndex: 0,
        },
        (i) => resolve(i === 1 ? 'camera' : i === 2 ? 'library' : null),
      );
    } else {
      Alert.alert('사진 추가', '사진을 어떻게 추가할까요?', [
        { text: '카메라로 촬영', onPress: () => resolve('camera') },
        { text: '보관함에서 선택', onPress: () => resolve('library') },
        { text: '취소', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}

/** 권한 거부 시 — 설정으로 이동할 수 있게 안내. */
function alertPermission(source: PhotoSource): void {
  const what = source === 'camera' ? '카메라' : '사진';
  Alert.alert(
    `${what} 권한이 필요해요`,
    `설정에서 ${what} 접근을 허용해주세요.`,
    [
      { text: '닫기', style: 'cancel' },
      { text: '설정 열기', onPress: () => void Linking.openSettings() },
    ],
  );
}

/**
 * 카메라/보관함 선택 → 사진 1장을 RNFile로 반환.
 * - 사용자가 취소하면 null (조용히)
 * - 권한 거부는 설정 안내 후 null
 * - 그 외 오류는 throw (호출부가 toUserMessage로 노출)
 */
export async function pickPhoto(): Promise<RNFile | null> {
  const source = await chooseSource();
  if (!source) return null;

  const res =
    source === 'camera'
      ? await launchCamera({ mediaType: 'photo', saveToPhotos: false })
      : await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });

  const outcome = classifyPickerResponse(res);
  switch (outcome.kind) {
    case 'cancel':
      return null;
    case 'permission':
      alertPermission(source);
      return null;
    case 'error':
      throw new Error(outcome.message);
    case 'file':
      return outcome.file;
  }
}

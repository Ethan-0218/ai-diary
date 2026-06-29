import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Sound, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  OutputFormatAndroidType,
  type AudioSet,
} from 'react-native-nitro-sound';
import type { RNFile } from './api';

/**
 * 음성 답변 녹음 — nitro-sound 위 얇은 추상화.
 * photo-picker.ts와 같은 정책: 권한 거부는 "설정 열기" 안내 후 조용히 실패(false/null),
 * 그 외 오류만 throw해서 호출부가 toUserMessage로 노출한다.
 * 라이브러리 교체(예: react-native-audio-recorder-player) 시 이 파일만 바꾼다.
 */

// AAC/m4a — 작고 OpenAI 전사가 바로 받는 포맷.
const AUDIO_SET: AudioSet = {
  AVFormatIDKeyIOS: 'aac',
  AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
  AVNumberOfChannelsKeyIOS: 1,
  OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
  AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
  AudioSourceAndroid: AudioSourceAndroidType.MIC,
};

/** 권한 거부 시 — 설정으로 이동할 수 있게 안내(사진 패턴과 동일 톤). */
function alertMicPermission(): void {
  Alert.alert(
    '마이크 권한이 필요해요',
    '설정에서 마이크 접근을 허용하면 음성으로 답할 수 있어요.',
    [
      { text: '닫기', style: 'cancel' },
      { text: '설정 열기', onPress: () => void Linking.openSettings() },
    ],
  );
}

/** 안드로이드는 명시적 요청, iOS는 AVAudioSession이 첫 녹음 때 시스템 프롬프트를 띄운다. */
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: '마이크 권한',
      message: '음성으로 일기를 답하려면 마이크 접근이 필요해요.',
      buttonPositive: '허용',
      buttonNegative: '나중에',
    },
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * 녹음 시작. 권한이 없으면 안내 후 false.
 * iOS 권한 거부는 startRecorder가 reject → permission으로 간주해 안내한다.
 */
export async function startRecording(): Promise<boolean> {
  if (!(await ensureMicPermission())) {
    alertMicPermission();
    return false;
  }
  try {
    await Sound.startRecorder(undefined, AUDIO_SET, false);
    return true;
  } catch {
    // iOS: 마이크 권한 거부가 가장 흔한 원인 → 설정 안내.
    alertMicPermission();
    return false;
  }
}

/** 녹음 종료 → 업로드용 RNFile. 경로가 없으면 null. */
export async function stopRecording(): Promise<RNFile | null> {
  const path = await Sound.stopRecorder();
  if (!path || path === 'Already stopped') return null;
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  const ext = (path.split('.').pop() || 'm4a').toLowerCase();
  return {
    uri,
    type: ext === 'mp4' ? 'audio/mp4' : 'audio/m4a',
    name: `voice-${Date.now()}.${ext}`,
  };
}

/** 녹음 취소 — 멈추고 결과 폐기(에러 무시). */
export async function cancelRecording(): Promise<void> {
  try {
    await Sound.stopRecorder();
  } catch {
    // 이미 멈췄거나 시작 전 — 무시.
  }
}

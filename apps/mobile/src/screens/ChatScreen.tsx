import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { BlurView } from '@react-native-community/blur';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { getFormatDef, type ConversationDetail } from '@ai-diary/shared';
import { api, API_BASE, absoluteUrl, getAuthToken, type RNFile } from '../lib/api';
import { toUserMessage } from '../lib/errors';
import { pickPhoto } from '../lib/photo-picker';
import { startRecording, stopRecording, cancelRecording } from '../lib/audio-recorder';
import { detectSignals, stripLeakedToolJson } from '../lib/chat-signals';
import { reconcileReminders } from '../lib/notifications';
import { ErrorState } from '../components/ui';
import { BackButton, GlassCard, GradientButton, NightBackground } from '../components/glass';
import { colors } from '../theme';
import type { RootScreenProps } from '../navigation/types';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function chatDate(iso: string): string {
  const d = new Date(iso);
  return `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
}

/** 달 아바타(AI) — 라벤더 그라데이션 + 발광. */
function MoonAvatar() {
  const id = useId();
  return (
    <View style={styles.aiAvaShadow}>
      <View style={styles.aiAva}>
        <Svg width={30} height={30} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id={`${id}a`} x1="0.15" y1="0" x2="0.85" y2="1">
              <Stop offset="0" stopColor="#c9bdfb" />
              <Stop offset="1" stopColor="#8a7dd0" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width={30} height={30} fill={`url(#${id}a)`} />
        </Svg>
        <Svg width={15} height={15} viewBox="0 0 24 24">
          <Path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill="#fbf7ef"
          />
        </Svg>
      </View>
    </View>
  );
}

/** 내 말풍선 — 라벤더 세로 그라데이션(밝은 위 → 진한 아래). */
function MeBubble({ children }: { children: ReactNode }) {
  const id = useId();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={[styles.bubble, styles.bubbleMe]}
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {size.w > 0 && (
        <Svg
          width={size.w}
          height={size.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <SvgLinearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.lav2} />
              <Stop offset="1" stopColor={colors.lav} />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}m)`} />
        </Svg>
      )}
      {children}
    </View>
  );
}

export function ChatScreen({ route, navigation }: RootScreenProps<'Chat'>) {
  const { conversationId } = route.params;
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setDetail(null);
    api
      .getConversation(conversationId)
      .then(setDetail)
      .catch((e) => setError(toUserMessage(e)));
  }, [conversationId]);

  useEffect(load, [load]);

  if (error) {
    return (
      <NightBackground>
        <ErrorState message={error} onRetry={load} />
      </NightBackground>
    );
  }
  if (!detail) {
    return (
      <NightBackground>
        <View style={styles.center}>
          <ActivityIndicator color={colors.lav} />
        </View>
      </NightBackground>
    );
  }
  return <ChatView detail={detail} navigation={navigation} />;
}

function ChatView({
  detail,
  navigation,
}: {
  detail: ConversationDetail;
  navigation: RootScreenProps<'Chat'>['navigation'];
}) {
  const insets = useSafeAreaInsets();
  const def = getFormatDef(detail.format);

  const initialMessages: UIMessage[] = useMemo(
    () =>
      detail.messages.map((m) => {
        const parts: any[] = [{ type: 'text', text: m.content }];
        if (Array.isArray(m.parts)) {
          for (const p of m.parts as any[]) {
            if (p?.type === 'data-photo') parts.push(p);
          }
        }
        return { id: m.id, role: m.role, parts } as UIMessage;
      }),
    [detail.messages],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: detail.id,
    transport: new DefaultChatTransport({
      api: `${API_BASE}/conversations/${detail.id}/chat`,
      headers: (): Record<string, string> => {
        const token = getAuthToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
    messages: initialMessages,
  });

  // 입력값은 ref로만 보관 — 타이핑 중 setState 재렌더가 0이라야 한글 IME 조합이 안 깨진다.
  const inputTextRef = useRef('');
  const [pending, setPending] = useState<{ file: RNFile; preview: string } | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [busyDiary, setBusyDiary] = useState(false);
  // 음성 답변 — 보내기 버튼 꾹 눌러 녹음 → 손 떼면 전사 → 바로 전송.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const pressedRef = useRef(false); // 버튼을 누르고 있는 동안 true
  const recordingRef = useRef(false); // 실제 녹음 중(async 핸들러에서 읽기 위함)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // 한글 IME 조합 깨짐 방지 — TextInput을 uncontrolled로 두고 ref로 제어한다.
  const inputRef = useRef<TextInput>(null);

  const busy = status === 'streaming' || status === 'submitted';

  const signals = useMemo(
    () => detectSignals(messages, detail.collectionState?.enough ?? false),
    [messages, detail.collectionState],
  );

  // 첫 진입 시엔 애니메이션 없이 곧장 바닥으로(쫙 내려가는 연출 방지),
  // 이후 새 메시지·상태 변화엔 부드럽게 따라간다.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    const animated = didInitialScroll.current;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated });
      didInitialScroll.current = true;
    }, 50);
    return () => clearTimeout(t);
  }, [messages, busy]);

  const onPickPhoto = async () => {
    try {
      const file = await pickPhoto();
      if (file) setPending({ file, preview: file.uri });
    } catch (e) {
      Alert.alert('사진 추가 실패', toUserMessage(e));
    }
  };

  const onSend = async () => {
    const text = inputTextRef.current.trim();
    if (busy || uploading) return;
    if (!text && !pending) return;
    const photo = pending;
    inputTextRef.current = '';
    inputRef.current?.clear();
    setPending(null);

    if (photo) {
      setUploading(true);
      try {
        const att = await api.uploadAttachment(detail.id, photo.file);
        sendMessage({
          role: 'user',
          parts: [
            ...(text ? [{ type: 'text', text }] : []),
            { type: 'data-photo', data: { url: att.url, mediaType: att.mimeType } },
          ],
        } as any);
      } catch (e: any) {
        Alert.alert('업로드 실패', toUserMessage(e));
        inputTextRef.current = text;
        inputRef.current?.setNativeProps({ text });
        setPending(photo);
        setUploading(false);
        return;
      }
      setUploading(false);
    } else {
      sendMessage({ text });
    }
  };

  // ── 음성 답변 ──
  // 250ms 임계값으로 짧은 탭(전송)과 꾹 누름(녹음)을 구분(프로토타입과 동일).
  const beginRecording = async () => {
    const ok = await startRecording();
    if (!ok) return; // 권한 거부 등 — 안내는 audio-recorder가 처리
    if (!pressedRef.current) {
      // 권한 프롬프트 사이에 이미 손을 뗌 → 녹음 취소
      await cancelRecording();
      return;
    }
    recordingRef.current = true;
    setRecording(true);
  };

  const finishRecording = async () => {
    recordingRef.current = false;
    setRecording(false);
    setTranscribing(true);
    try {
      const file = await stopRecording();
      if (!file) return;
      const { text } = await api.transcribe(detail.id, file);
      const t = text.trim();
      if (t) sendMessage({ text: t }); // 전사 결과를 바로 전송(빈 결과는 무시)
    } catch (e) {
      Alert.alert('음성 인식 실패', toUserMessage(e));
    } finally {
      setTranscribing(false);
    }
  };

  const onSendPressIn = () => {
    if (busy || uploading || transcribing) return;
    pressedRef.current = true;
    holdTimer.current = setTimeout(() => void beginRecording(), 250);
  };

  const onSendPressOut = () => {
    pressedRef.current = false;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (recordingRef.current) void finishRecording();
    else if (!recording && !transcribing) void onSend(); // 짧은 탭 = 전송
  };

  const finishDiary = async () => {
    setBusyDiary(true);
    try {
      await api.generateDiary(detail.id);
      // 오늘 일기를 썼으니 오늘 리마인더를 "썼어요" 변형으로 갱신(베스트에포트).
      void reconcileReminders();
      navigation.replace('Diary', { conversationId: detail.id });
    } catch (e: any) {
      Alert.alert('일기 생성 실패', toUserMessage(e));
      setBusyDiary(false);
    }
  };

  return (
    <NightBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* 상단바 — 글라스 sticky 바 */}
        <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType="dark"
            blurAmount={12}
            reducedTransparencyFallbackColor="#14101e"
          />
          <View style={[StyleSheet.absoluteFill, styles.barTint]} pointerEvents="none" />
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.ctInfo}>
            <View style={styles.ctTitleRow}>
              <Text style={styles.ctTitle} numberOfLines={1}>
                {detail.title || '오늘 이야기'}
              </Text>
              <View style={styles.fmtBadge}>
                <Text style={styles.fmtBadgeTxt}>{def.label}</Text>
              </View>
            </View>
            <Text style={styles.ctSub} numberOfLines={1}>
              {chatDate(detail.createdAt)}
            </Text>
          </View>
          <Pressable
            style={styles.chatMake}
            onPress={finishDiary}
            disabled={busyDiary}
          >
            <Text style={styles.chatMakeTxt}>
              {busyDiary ? '쓰는 중…' : '일기 만들기'}
            </Text>
          </Pressable>
        </View>

        {/* 대화 본문 */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.body}
        >
          <View style={styles.dayDiv}>
            <Text style={styles.dayDivTxt}>{chatDate(detail.createdAt)}</Text>
          </View>
          {!!detail.weatherNote && (
            <View style={styles.dayDiv}>
              <Text style={styles.dayDivTxt}>🌤️ {detail.weatherNote}</Text>
            </View>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {busy && <ThinkingBubble streaming={status === 'streaming'} />}
          {!!error && (
            <View style={styles.errorBubble}>
              <Text style={styles.errorText}>
                ⚠️{' '}
                {error.message?.trim() ||
                  '답장을 받지 못했어요. 잠시 후 다시 보내주세요.'}
              </Text>
            </View>
          )}

          {/* 충분히 모았을 때 — 일기로 남기기 카드.
              단, 바로 위 메시지(AI 답변/생각중 버블)가 모두 렌더된 뒤에만 노출:
              스트리밍·전송 중(busy)에는 숨겨 두고 완료 후 나타나게 한다. */}
          {signals.diary && !busy && (
            <GlassCard
              lavender
              strong
              radius={16}
              style={styles.enough}
              contentStyle={styles.enoughPad}
            >
              <Text style={styles.enoughTxt}>
                오늘 이야기, 이대로 일기로 남겨줄까?
              </Text>
              <GradientButton
                label={busyDiary ? '일기 쓰는 중…' : '일기 만들기'}
                loading={busyDiary}
                onPress={finishDiary}
              />
            </GlassCard>
          )}
        </ScrollView>

        {/* 입력바 — 글라스 sticky 바 */}
        <View style={[styles.inputWrap, { paddingBottom: insets.bottom || 14 }]}>
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType="dark"
            blurAmount={12}
            reducedTransparencyFallbackColor="#14101e"
          />
          <View style={[StyleSheet.absoluteFill, styles.barTint]} pointerEvents="none" />
          {pending && (
            <View style={styles.pendingRow}>
              <View>
                <Image source={{ uri: pending.preview }} style={styles.pendingImg} />
                <Pressable
                  onPress={() => setPending(null)}
                  style={styles.pendingRemove}
                  hitSlop={6}
                >
                  <Text style={styles.pendingRemoveX}>×</Text>
                </Pressable>
              </View>
              <Text style={styles.pendingHint}>
                사진에 곁들일 설명을 적고 함께 보내보세요.
              </Text>
            </View>
          )}
          <View style={styles.ciRow}>
            <Pressable
              onPress={onPickPhoto}
              disabled={uploading || recording || transcribing}
              style={[
                styles.ciAdd,
                signals.photo && styles.ciAddHi,
                (recording || transcribing) && styles.ciSendOff,
              ]}
            >
              <Text style={styles.ciAddTxt}>＋</Text>
            </Pressable>
            <View style={styles.ciFieldWrap}>
              <TextInput
                ref={inputRef}
                style={[styles.ciField, (recording || transcribing) && styles.ciFieldHidden]}
                placeholder={pending ? '사진에 곁들일 말…' : '메시지 입력…  꾹 눌러서 음성'}
                placeholderTextColor={colors.muted}
                defaultValue=""
                editable={!recording && !transcribing}
                onChangeText={(t) => {
                  inputTextRef.current = t;
                }}
                multiline
              />
              {(recording || transcribing) && (
                <View style={styles.voiceBar} pointerEvents="none">
                  {recording ? (
                    <>
                      <Waveform />
                      <Text style={styles.voiceTxt}>듣고 있어… 손 떼면 완료</Text>
                    </>
                  ) : (
                    <>
                      <ActivityIndicator size="small" color={colors.lav2} />
                      <Text style={styles.voiceTxt}>옮겨 적는 중…</Text>
                    </>
                  )}
                </View>
              )}
            </View>
            <View style={styles.ciSendWrap}>
              {recording && <RecordPulse />}
              <Pressable
                onPressIn={onSendPressIn}
                onPressOut={onSendPressOut}
                disabled={busy || uploading || transcribing}
                style={[
                  styles.ciSend,
                  (busy || uploading || transcribing) && styles.ciSendOff,
                  recording && styles.ciSendRec,
                ]}
              >
                {uploading || transcribing ? (
                  <ActivityIndicator size="small" color={colors.onLav} />
                ) : recording ? (
                  // 마이크 아이콘(녹음 중)
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                      stroke={colors.onLav}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <Path
                      d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
                      stroke={colors.onLav}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                ) : (
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M22 2 11 13"
                      stroke={colors.onLav}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <Path
                      d="M22 2 15 22l-4-9-9-4 20-7z"
                      stroke={colors.onLav}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </NightBackground>
  );
}

/** 녹음 중 웨이브폼 — 막대 5개가 Y스케일로 맥동(프로토타입 .wave 이식). */
const WAVE_BARS = [12, 18, 9, 16, 11];
const WAVE_DELAYS = [0, 100, 200, 300, 150];
function Waveform() {
  const vals = useRef(WAVE_BARS.map(() => new Animated.Value(0.5))).current;
  useEffect(() => {
    const items = vals.map((v, i) => {
      const seq = Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 450,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.5,
            duration: 450,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      const t = setTimeout(() => seq.start(), WAVE_DELAYS[i]);
      return { seq, t };
    });
    return () =>
      items.forEach(({ seq, t }) => {
        clearTimeout(t);
        seq.stop();
      });
  }, [vals]);
  return (
    <View style={styles.wave}>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.waveBar, { height: WAVE_BARS[i], transform: [{ scaleY: v }] }]}
        />
      ))}
    </View>
  );
}

/** 보내기 버튼 라벤더 펄스 — box-shadow가 없는 RN에서 확장하는 ring으로 근사. */
function RecordPulse() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        {
          opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.55, 0, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
        },
      ]}
    />
  );
}

function ThinkingBubble({ streaming }: { streaming: boolean }) {
  return (
    <View style={styles.msgAi}>
      <MoonAvatar />
      <View style={[styles.bubble, styles.bubbleAi, styles.thinking]}>
        <Text style={styles.bubbleAiTxt}>
          {streaming ? 'AI가 답하는 중' : 'AI가 생각 중'}
        </Text>
        <ActivityIndicator size="small" color={colors.lav} />
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  const raw = (message.parts ?? [])
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
  const text = isUser ? raw : stripLeakedToolJson(raw);
  const photos = (message.parts ?? [])
    .filter((p: any) => p.type === 'data-photo')
    .map((p: any) => p.data?.url as string | undefined)
    .filter((u): u is string => !!u);
  if (!text && photos.length === 0) return null;

  const content = (
    <>
      {photos.map((url, i) => (
        <Image
          key={i}
          source={{ uri: absoluteUrl(url) }}
          style={[
            styles.bubbleImg,
            { marginBottom: text || i < photos.length - 1 ? 8 : 0 },
          ]}
        />
      ))}
      {!!text && (
        <Text style={isUser ? styles.bubbleMeTxt : styles.bubbleAiTxt}>{text}</Text>
      )}
    </>
  );

  return (
    <View style={isUser ? styles.msgMe : styles.msgAi}>
      {!isUser && <MoonAvatar />}
      {isUser ? (
        <MeBubble>{content}</MeBubble>
      ) : (
        <View style={[styles.bubble, styles.bubbleAi]}>{content}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // 상단바
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  barTint: { backgroundColor: 'rgba(20,16,30,0.62)' },
  ctInfo: { flex: 1, minWidth: 0 },
  ctTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text, letterSpacing: -0.3, flexShrink: 1 },
  fmtBadge: {
    backgroundColor: colors.lavSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fmtBadgeTxt: { fontSize: 10.5, fontWeight: '700', color: colors.lav2 },
  ctSub: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  chatMake: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  chatMakeTxt: { fontSize: 12, fontWeight: '700', color: colors.lav2 },

  // 본문
  body: { padding: 16, paddingBottom: 20, gap: 11 },
  dayDiv: { alignSelf: 'center' },
  dayDivTxt: {
    fontSize: 11,
    color: colors.muted,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },

  msgAi: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, maxWidth: '84%', alignSelf: 'flex-start' },
  msgMe: { alignSelf: 'flex-end', maxWidth: '84%' },
  aiAvaShadow: {
    alignSelf: 'flex-end',
    shadowColor: '#9680f0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 9,
    elevation: 5,
  },
  aiAva: {
    width: 30,
    height: 30,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18 },
  bubbleAi: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  bubbleMe: {
    backgroundColor: colors.lav2,
    borderBottomRightRadius: 6,
    overflow: 'hidden',
  },
  bubbleAiTxt: { color: colors.text, fontSize: 14.5, lineHeight: 22 },
  bubbleMeTxt: { color: colors.onLav, fontSize: 14.5, lineHeight: 22, fontWeight: '500' },
  bubbleImg: { width: 200, height: 150, borderRadius: 12, resizeMode: 'cover' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  errorBubble: {
    alignSelf: 'flex-start',
    maxWidth: '84%',
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  errorText: { color: colors.danger, fontSize: 14 },

  enough: { alignSelf: 'stretch', marginTop: 8 },
  enoughPad: { padding: 14, gap: 11 },
  enoughTxt: { fontSize: 13.5, color: colors.text, lineHeight: 20, fontWeight: '600' },

  // 입력바
  inputWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pendingImg: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border2,
  },
  pendingRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRemoveX: { color: '#fff', fontSize: 16, lineHeight: 18 },
  pendingHint: { flex: 1, fontSize: 13, color: colors.textSoft },
  ciRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  ciAdd: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ciAddHi: { borderColor: colors.lav },
  ciAddTxt: { fontSize: 22, color: colors.textSoft },
  ciFieldWrap: { flex: 1, justifyContent: 'flex-end' },
  ciFieldHidden: { opacity: 0 },
  ciField: {
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: colors.text,
  },
  // 녹음/전사 중 — 입력창 위에 겹쳐지는 음성 바(프로토타입 .voice-bar).
  voiceBar: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: 'rgba(169,156,242,0.12)',
  },
  voiceTxt: { fontSize: 13, fontWeight: '700', color: colors.lav2 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: colors.lav2 },
  ciSendWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ciSend: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.lav2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ciSendRec: { backgroundColor: colors.lav },
  ciSendOff: { opacity: 0.5 },
  pulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.lav,
  },
});

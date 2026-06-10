import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Svg, { Path } from 'react-native-svg';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { getFormatDef, type ConversationDetail } from '@ai-diary/shared';
import { api, API_BASE, absoluteUrl, getAuthToken, type RNFile } from '../lib/api';
import { toUserMessage } from '../lib/errors';
import { pickPhoto } from '../lib/photo-picker';
import { detectSignals, stripLeakedToolJson } from '../lib/chat-signals';
import { ErrorState } from '../components/ui';
import { BackButton, GradientButton, NightBackground } from '../components/glass';
import { colors, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function chatDate(iso: string): string {
  const d = new Date(iso);
  return `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
}

/** 달 아바타(AI) */
function MoonAvatar() {
  return (
    <View style={styles.aiAva}>
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Path
          d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
          fill="#fbf7ef"
        />
      </Svg>
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
  const scrollRef = useRef<ScrollView>(null);
  // 한글 IME 조합 깨짐 방지 — TextInput을 uncontrolled로 두고 ref로 제어한다.
  const inputRef = useRef<TextInput>(null);

  const busy = status === 'streaming' || status === 'submitted';

  const signals = useMemo(
    () => detectSignals(messages, detail.collectionState?.enough ?? false),
    [messages, detail.collectionState],
  );

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
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

  const finishDiary = async () => {
    setBusyDiary(true);
    try {
      await api.generateDiary(detail.id);
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
        {/* 상단바 */}
        <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
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

          {/* 충분히 모았을 때 — 일기로 남기기 카드 */}
          {signals.diary && (
            <View style={styles.enough}>
              <Text style={styles.enoughTxt}>
                오늘 이야기, 이대로 일기로 남겨줄까?
              </Text>
              <GradientButton
                label={busyDiary ? '일기 쓰는 중…' : '일기 만들기'}
                loading={busyDiary}
                onPress={finishDiary}
              />
            </View>
          )}
        </ScrollView>

        {/* 입력바 */}
        <View style={[styles.inputWrap, { paddingBottom: insets.bottom || 14 }]}>
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
              disabled={uploading}
              style={[styles.ciAdd, signals.photo && styles.ciAddHi]}
            >
              <Text style={styles.ciAddTxt}>＋</Text>
            </Pressable>
            <TextInput
              ref={inputRef}
              style={styles.ciField}
              placeholder={pending ? '사진에 곁들일 말…' : '메시지 입력…'}
              placeholderTextColor={colors.muted}
              defaultValue=""
              onChangeText={(t) => {
                inputTextRef.current = t;
              }}
              multiline
            />
            <Pressable
              onPress={onSend}
              disabled={busy || uploading}
              style={[styles.ciSend, (busy || uploading) && styles.ciSendOff]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.onLav} />
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
      </KeyboardAvoidingView>
    </NightBackground>
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

  return (
    <View style={isUser ? styles.msgMe : styles.msgAi}>
      {!isUser && <MoonAvatar />}
      <View style={[styles.bubble, isUser ? styles.bubbleMe : styles.bubbleAi]}>
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
          <Text style={isUser ? styles.bubbleMeTxt : styles.bubbleAiTxt}>
            {text}
          </Text>
        )}
      </View>
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
  },
  ctInfo: { flex: 1, minWidth: 0 },
  ctTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctTitle: { fontSize: 14.5, fontWeight: '800', color: '#f0ecfb', letterSpacing: -0.3, flexShrink: 1 },
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
  aiAva: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#9a8cd8',
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
  bubbleMe: { backgroundColor: colors.lav2, borderBottomRightRadius: 6 },
  bubbleAiTxt: { color: '#ece8fa', fontSize: 14.5, lineHeight: 22 },
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

  enough: {
    alignSelf: 'stretch',
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(169,156,242,0.16)',
    borderWidth: 1,
    borderColor: colors.border2,
    gap: 11,
  },
  enoughTxt: { fontSize: 13.5, color: '#ece8fa', lineHeight: 20, fontWeight: '600' },

  // 입력바
  inputWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(20,16,30,0.6)',
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
  ciField: {
    flex: 1,
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
  ciSend: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.lav2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ciSendOff: { opacity: 0.5 },
});

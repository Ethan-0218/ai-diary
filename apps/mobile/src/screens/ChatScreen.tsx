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
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { getFormatDef, type ConversationDetail } from '@ai-diary/shared';
import { api, API_BASE, absoluteUrl, getAuthToken, type RNFile } from '../lib/api';
import { toUserMessage } from '../lib/errors';
import { pickPhoto } from '../lib/photo-picker';
import { detectSignals, stripLeakedToolJson } from '../lib/chat-signals';
import { Badge, Button, Card, ErrorState } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

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
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
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
  // (iOS/Fabric: value를 매 onChangeText마다 되먹이면 native marked-text가 리셋돼 자모가 분리됨)
  const inputRef = useRef<TextInput>(null);

  const busy = status === 'streaming' || status === 'submitted';

  const signals = useMemo(
    () => detectSignals(messages, detail.collectionState?.enough ?? false),
    [messages, detail.collectionState],
  );

  // 새 메시지/스트리밍 시 맨 아래로 스크롤
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerRow}>
          <Badge>
            {def.label} · {detail.modelId}
          </Badge>
          {!!detail.weatherNote && (
            <Text style={styles.weather}>🌤️ {detail.weatherNote}</Text>
          )}
        </View>

        <View style={{ gap: 10, marginTop: spacing.md }}>
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
        </View>

        {signals.photo && (
          <Card style={styles.photoHint}>
            <Text style={{ color: colors.text }}>
              📷 이 순간 사진이 있다면 첨부해보세요!
            </Text>
          </Card>
        )}
      </ScrollView>

      <View style={styles.composer}>
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
            <Text style={[styles.muted, { flex: 1, fontSize: 13 }]}>
              사진에 곁들일 설명을 적고 함께 보내보세요.
            </Text>
          </View>
        )}

        <View style={styles.inputRow}>
          <Pressable
            onPress={onPickPhoto}
            disabled={uploading}
            style={[styles.iconBtn, signals.photo && styles.iconBtnHighlighted]}
          >
            <Text style={{ fontSize: 18 }}>📎</Text>
          </Pressable>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder={
              pending ? '사진에 곁들일 말을 적어보세요…' : '메시지를 입력하세요…'
            }
            placeholderTextColor={colors.muted}
            defaultValue=""
            onChangeText={(t) => {
              inputTextRef.current = t;
            }}
            multiline
          />
          <Button
            label={uploading ? '…' : '보내기'}
            variant="primary"
            onPress={onSend}
            disabled={busy || uploading}
          />
        </View>

        <View style={{ marginTop: 10 }}>
          <Button
            label={busyDiary ? '일기 쓰는 중…' : '📖 일기 완성하기'}
            onPress={finishDiary}
            loading={busyDiary}
            highlighted={signals.diary}
          />
          {signals.diary && (
            <Text style={[styles.muted, { fontSize: 13, marginTop: 6 }]}>
              AI가 일기를 쓸 준비가 됐다고 제안했어요.
            </Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ThinkingBubble({ streaming }: { streaming: boolean }) {
  return (
    <View style={[styles.bubble, styles.bubbleAssistant, styles.thinking]}>
      <Text style={styles.muted}>
        {streaming ? 'AI가 답하는 중' : 'AI가 생각 중'}
      </Text>
      <ActivityIndicator size="small" color={colors.accent} />
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
    <View
      style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAssistant,
      ]}
    >
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
        <Text style={isUser ? styles.bubbleTextUser : styles.bubbleText}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  muted: { color: colors.muted },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  weather: { fontSize: 12, color: colors.muted },
  bubble: {
    maxWidth: '85%',
    borderWidth: 1,
    borderRadius: radius.bubble,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: colors.white, fontSize: 15, lineHeight: 22 },
  bubbleImg: { width: 220, height: 220, borderRadius: 10, resizeMode: 'cover' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorBubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.bubble,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  errorText: { color: colors.danger, fontSize: 14 },
  photoHint: {
    marginTop: spacing.md,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pendingImg: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRemoveX: { color: colors.white, fontSize: 16, lineHeight: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnHighlighted: { borderColor: colors.accent },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: colors.text,
  },
});

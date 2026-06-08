import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  getFormatDef,
  type ConversationDetail,
  type CostSummary,
} from '@ai-diary/shared';
import { api, absoluteUrl } from '../lib/api';
import { resolvePhotoTokens } from '../lib/photo-tokens';
import { Badge, Button, Card } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

export function DiaryScreen({ route, navigation }: RootScreenProps<'Diary'>) {
  const { conversationId: id } = route.params;
  const { width } = useWindowDimensions();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [reviseInput, setReviseInput] = useState('');
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [savedFeedback, setSavedFeedback] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [showConversation, setShowConversation] = useState(false);

  const load = () => {
    api
      .getConversation(id)
      .then((d) => {
        setDetail(d);
        setFeedback(d.feedback?.content ?? '');
        setSavedFeedback(d.feedback?.content ?? '');
        setSavedAt(d.feedback?.updatedAt ?? null);
      })
      .catch(() => {});
    api.getCosts(id).then(setCosts).catch(() => {});
  };
  useEffect(load, [id]);

  const saveFeedback = async () => {
    setSavingFeedback(true);
    try {
      const res = await api.saveFeedback(id, feedback);
      setSavedFeedback(res.feedback?.content ?? '');
      setFeedback(res.feedback?.content ?? '');
      setSavedAt(res.feedback?.updatedAt ?? null);
    } catch (e: any) {
      Alert.alert('피드백 저장 실패', e?.message ?? String(e));
    } finally {
      setSavingFeedback(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      await api.generateDiary(id);
      load();
    } catch (e: any) {
      Alert.alert('다시 쓰기 실패', e?.message ?? String(e));
    } finally {
      setRegenerating(false);
    }
  };

  const revise = async () => {
    const instruction = reviseInput.trim();
    if (!instruction || revising) return;
    setRevising(true);
    try {
      await api.reviseDiary(id, instruction);
      setReviseInput('');
      load();
    } catch (e: any) {
      Alert.alert('일기 수정 실패', e?.message ?? String(e));
    } finally {
      setRevising(false);
    }
  };

  if (!detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const def = getFormatDef(detail.format);
  const diaryCost = costs?.byStep.diary_generation;
  const imgWidth = Math.min(width - 2 * spacing.lg - 2 * 24, 320);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <Badge>
          {def.label} · {detail.modelId}
        </Badge>
      </View>

      {costs && (
        <Card style={styles.costCard}>
          <View style={styles.spaceBetween}>
            <Text style={styles.bold}>💰 이 일기 완성에 든 총비용</Text>
            <Badge>${costs.totalUsd.toFixed(5)}</Badge>
          </View>
          <Text style={[styles.muted, { marginTop: 6, fontSize: 13 }]}>
            일기 생성: ${diaryCost ? diaryCost.costUsd.toFixed(5) : '0'} · 전체 토큰
            in {costs.totalInputTokens} / out {costs.totalOutputTokens} · LLM 호출{' '}
            {costs.totalCalls}회
          </Text>
        </Card>
      )}

      <Card style={styles.article}>
        {detail.diary ? (
          <Markdown
            style={{
              body: { color: colors.text, fontSize: 16, lineHeight: 28 },
              image: {
                width: imgWidth,
                height: imgWidth,
                borderRadius: 12,
                marginVertical: 8,
              },
            }}
          >
            {resolvePhotoTokens(detail.diary.content, detail.attachments)}
          </Markdown>
        ) : (
          <Text style={styles.muted}>아직 일기가 생성되지 않았습니다.</Text>
        )}
      </Card>

      {detail.diary && (
        <Card style={styles.reviseCard}>
          <Text style={styles.bold}>✏️ 일기 고치기</Text>
          <Text style={[styles.muted, { fontSize: 13, marginVertical: 6 }]}>
            고치고 싶은 점을 적으면 그대로 다시 써줍니다. 예: “오전→오후 순서로
            바꿔줘”, “좀 더 담백하게”.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="이렇게 고쳐줘…"
            placeholderTextColor={colors.muted}
            value={reviseInput}
            onChangeText={setReviseInput}
            editable={!revising}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label={revising ? '고치는 중…' : '수정 반영'}
              variant="primary"
              onPress={revise}
              loading={revising}
              disabled={!reviseInput.trim()}
            />
          </View>
        </Card>
      )}

      {detail.messages.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Pressable
            onPress={() => setShowConversation((v) => !v)}
            style={styles.summaryToggle}
          >
            <Text style={styles.bold}>
              💬 실제 대화 전체 보기 ({detail.messages.length}개) {showConversation ? '▲' : '▼'}
            </Text>
          </Pressable>
          {showConversation && (
            <View style={{ gap: 10, marginTop: spacing.md }}>
              {detail.messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.bubble,
                      isUser ? styles.bubbleUser : styles.bubbleAssistant,
                    ]}
                  >
                    <Text style={isUser ? styles.bubbleTextUser : styles.bubbleText}>
                      {m.content}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {detail.attachments.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={[styles.bold, { marginBottom: spacing.sm }]}>첨부 사진</Text>
          <View style={styles.attachRow}>
            {detail.attachments.map((a) => (
              <View key={a.id} style={{ width: 120 }}>
                <Image
                  source={{ uri: absoluteUrl(a.url) }}
                  style={styles.attachImg}
                />
                {!!a.caption && (
                  <Text style={[styles.muted, { fontSize: 12, marginTop: 4 }]}>
                    {a.caption}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.spaceBetween}>
          <Text style={styles.bold}>📝 이 테스트에 대한 피드백</Text>
          {!!savedAt && (
            <Text style={[styles.muted, { fontSize: 12 }]}>
              저장 {new Date(savedAt).toLocaleString('ko-KR')}
            </Text>
          )}
        </View>
        <Text style={[styles.muted, { fontSize: 13, marginVertical: 6 }]}>
          생성된 일기와 대화의 좋았던 점·아쉬운 점을 자유롭게 적어두세요.
        </Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="예: 질문이 너무 일반적이었다 / 사진 제안 타이밍이 좋았다 …"
          placeholderTextColor={colors.muted}
          value={feedback}
          onChangeText={setFeedback}
          multiline
        />
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label={savingFeedback ? '저장 중…' : '피드백 저장'}
            variant="primary"
            onPress={saveFeedback}
            loading={savingFeedback}
            disabled={feedback === savedFeedback}
          />
          {feedback !== savedFeedback && (
            <Text style={[styles.muted, { fontSize: 13, marginTop: 6 }]}>
              저장되지 않은 변경사항이 있어요
            </Text>
          )}
        </View>
      </Card>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            label="대화 이어가기"
            onPress={() => navigation.navigate('Chat', { conversationId: id })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={regenerating ? '다시 쓰는 중…' : '일기 다시 쓰기'}
            onPress={regenerate}
            loading={regenerating}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  content: { padding: spacing.lg, paddingBottom: 80 },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  muted: { color: colors.muted },
  bold: { fontWeight: '700', color: colors.text },
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costCard: { marginTop: spacing.md, backgroundColor: '#fbfbf9' },
  article: { marginTop: spacing.md, paddingHorizontal: 24, paddingVertical: 24 },
  reviseCard: { marginTop: spacing.md, backgroundColor: '#fbfbf9' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  summaryToggle: {
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fbfbf9',
  },
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
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  attachImg: {
    width: 120,
    height: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});

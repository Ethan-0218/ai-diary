import React, { useEffect, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '@react-native-community/blur';
import Markdown from 'react-native-markdown-display';
import {
  getFormatDef,
  type ConversationDetail,
  type CostSummary,
  type DiaryFormat,
} from '@ai-diary/shared';
import { api, absoluteUrl } from '../lib/api';
import { toUserMessage } from '../lib/errors';
import { resolvePhotoTokens } from '../lib/photo-tokens';
import { ErrorState } from '../components/ui';
import {
  BackButton,
  GlassCard,
  GradientButton,
  NightBackground,
} from '../components/glass';
import { colors, radius, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 · ${WD[d.getDay()]}요일`;
}

/** format별 종이 타이포(react-native-markdown-display 스타일). */
function markdownStyle(format: DiaryFormat, imgWidth: number) {
  const base: Record<string, any> = {
    body: { color: colors.text, fontSize: 16, lineHeight: 30, letterSpacing: 0.1 },
    heading1: {
      color: colors.heading,
      fontSize: 24,
      fontWeight: '800',
      lineHeight: 32,
      marginBottom: 14,
      letterSpacing: -0.4,
    },
    heading2: {
      color: colors.heading,
      fontSize: 19,
      fontWeight: '700',
      marginTop: 12,
      marginBottom: 8,
    },
    paragraph: { marginTop: 0, marginBottom: 16 },
    strong: { color: '#f0ecff', fontWeight: '700' },
    em: { color: colors.textSoft, fontStyle: 'italic' },
    bullet_list: { marginBottom: 12 },
    blockquote: {
      backgroundColor: 'rgba(169,156,242,0.12)',
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.lav,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginVertical: 10,
    },
    image: {
      width: imgWidth,
      height: Math.round(imgWidth * 0.62),
      borderRadius: 14,
      marginVertical: 12,
    },
  };
  if (format === 'novel') {
    return {
      ...base,
      body: { ...base.body, fontSize: 16.5, lineHeight: 34 },
      paragraph: { marginTop: 0, marginBottom: 18 },
    };
  }
  if (format === 'newspaper') {
    return {
      ...base,
      body: { ...base.body, lineHeight: 29, color: colors.textSoft },
      heading1: { ...base.heading1, fontSize: 22, lineHeight: 30 },
    };
  }
  return base;
}

export function DiaryScreen({ route, navigation }: RootScreenProps<'Diary'>) {
  const { conversationId: id } = route.params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseInput, setReviseInput] = useState('');
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [savedFeedback, setSavedFeedback] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [showDev, setShowDev] = useState(false);
  // 상/하단 글라스 바 높이 — 스크롤 콘텐츠가 바 뒤로 가려지지 않게 padding으로 확보한다.
  const [headerH, setHeaderH] = useState(0);
  const [footerH, setFooterH] = useState(0);

  const load = () => {
    setLoadError(null);
    api
      .getConversation(id)
      .then((d) => {
        setDetail(d);
        setFeedback(d.feedback?.content ?? '');
        setSavedFeedback(d.feedback?.content ?? '');
      })
      .catch((e) => setLoadError(toUserMessage(e)));
    api.getCosts(id).then(setCosts).catch(() => {});
  };
  useEffect(load, [id]);

  const saveFeedback = async () => {
    setSavingFeedback(true);
    try {
      const res = await api.saveFeedback(id, feedback);
      setSavedFeedback(res.feedback?.content ?? '');
      setFeedback(res.feedback?.content ?? '');
    } catch (e: any) {
      Alert.alert('피드백 저장 실패', toUserMessage(e));
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
      Alert.alert('다시 쓰기 실패', toUserMessage(e));
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
      setReviseOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('일기 수정 실패', toUserMessage(e));
    } finally {
      setRevising(false);
    }
  };

  if (loadError && !detail) {
    return (
      <NightBackground>
        <ErrorState message={loadError} onRetry={load} />
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

  const def = getFormatDef(detail.format);
  const dateStr = formatDate(detail.diary?.createdAt ?? detail.createdAt);
  const imgWidth = width - 2 * spacing.lg - 2 * 22;

  return (
    <NightBackground>
      {/* 본문 — 화면을 꽉 채우고, 상/하단 글라스 바 뒤로 스크롤된다 */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerH + spacing.sm, paddingBottom: footerH + spacing.md },
        ]}
        scrollIndicatorInsets={{ top: headerH, bottom: footerH }}
        keyboardShouldPersistTaps="handled"
      >
          {/* paper-sheet */}
          <GlassCard strong radius={20} contentStyle={styles.paperPad}>
            {detail.format === 'newspaper' && (
              <View style={styles.masthead}>
                <Text style={styles.mastheadName}>취재 수첩</Text>
                <Text style={styles.mastheadDate}>{dateStr}</Text>
              </View>
            )}
            {detail.format !== 'newspaper' && (
              <Text style={styles.dDate}>{dateStr}</Text>
            )}
            {detail.diary ? (
              <Markdown style={markdownStyle(detail.format, imgWidth)}>
                {resolvePhotoTokens(detail.diary.content, detail.attachments)}
              </Markdown>
            ) : (
              <Text style={styles.empty}>아직 일기가 생성되지 않았어요.</Text>
            )}
          </GlassCard>

          {/* 첨부 사진 */}
          {detail.attachments.length > 0 && (
            <View style={styles.attachWrap}>
              <Text style={styles.sectionLabel}>첨부 사진</Text>
              <View style={styles.attachRow}>
                {detail.attachments.map((a) => (
                  <View key={a.id} style={{ width: 110 }}>
                    <Image source={{ uri: absoluteUrl(a.url) }} style={styles.attachImg} />
                    {!!a.caption && (
                      <Text style={styles.attachCap}>{a.caption}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 개발 정보(비용·피드백·대화·다시쓰기) — 접이식 */}
          <Pressable
            onPress={() => setShowDev((v) => !v)}
            style={styles.devToggle}
          >
            <Text style={styles.devToggleTxt}>
              개발 정보 (비용·피드백·대화) {showDev ? '▲' : '▼'}
            </Text>
          </Pressable>

          {showDev && (
            <View style={{ gap: spacing.md }}>
              {costs && (
                <GlassCard radius={16}>
                  <Text style={styles.devTitle}>
                    💰 총비용 ${costs.totalUsd.toFixed(5)}
                  </Text>
                  <Text style={styles.devMeta}>
                    토큰 in {costs.totalInputTokens} / out {costs.totalOutputTokens} ·
                    LLM {costs.totalCalls}회
                  </Text>
                </GlassCard>
              )}

              <GlassCard radius={16}>
                <Text style={styles.devTitle}>📝 테스트 피드백</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="좋았던 점·아쉬운 점…"
                  placeholderTextColor={colors.muted}
                  value={feedback}
                  onChangeText={setFeedback}
                  multiline
                />
                <View style={{ marginTop: spacing.sm }}>
                  <GradientButton
                    label={savingFeedback ? '저장 중…' : '피드백 저장'}
                    loading={savingFeedback}
                    disabled={feedback === savedFeedback}
                    onPress={saveFeedback}
                  />
                </View>
              </GlassCard>

              <GradientButton
                label={regenerating ? '다시 쓰는 중…' : '일기 다시 쓰기'}
                loading={regenerating}
                onPress={regenerate}
              />

              {detail.messages.length > 0 && (
                <GlassCard radius={16}>
                  <Text style={styles.devTitle}>
                    💬 실제 대화 ({detail.messages.length})
                  </Text>
                  <View style={{ gap: 8, marginTop: spacing.sm }}>
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
                          <Text
                            style={isUser ? styles.bubbleTextUser : styles.bubbleText}
                          >
                            {m.content}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </GlassCard>
              )}
            </View>
          )}
      </ScrollView>

      {/* 고정 글라스 헤더 — 콘텐츠가 뒤로 비쳐 보인다(스크롤에 안 딸려감) */}
      <View
        style={[styles.headerBar, { paddingTop: insets.top + spacing.sm }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={14}
          reducedTransparencyFallbackColor="#14101e"
        />
        <View style={[StyleSheet.absoluteFill, styles.headerTint]} pointerEvents="none" />
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.fmtLabel}>{def.label}</Text>
      </View>

      {/* 고정 글라스 하단 — 액션 + 고치기 입력. 키보드 올라오면 함께 상승 */}
      <KeyboardAvoidingView
        style={styles.footerKav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[styles.footerBar, { paddingBottom: insets.bottom || spacing.md }]}
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        >
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType="dark"
            blurAmount={14}
            reducedTransparencyFallbackColor="#14101e"
          />
          <View style={[StyleSheet.absoluteFill, styles.barTint]} pointerEvents="none" />

          {reviseOpen && detail.diary && (
            <GlassCard radius={16} style={styles.reviseCard}>
              <Text style={styles.cardDesc}>
                고치고 싶은 점을 적으면 그대로 다시 써줘요. 예: “오전→오후 순서로”,
                “좀 더 담백하게”.
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
                <GradientButton
                  label={revising ? '고치는 중…' : '수정 반영'}
                  loading={revising}
                  disabled={!reviseInput.trim()}
                  onPress={revise}
                />
              </View>
            </GlassCard>
          )}

          <View style={styles.actions}>
            <GradientButton
              label="＋ 더 얘기해 보강"
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('Chat', { conversationId: id })}
            />
            <Pressable
              style={styles.editBtn}
              onPress={() => setReviseOpen((v) => !v)}
            >
              <Text style={styles.editTxt}>✎ 고치기</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg },

  // 고정 글라스 헤더(절대배치 — 콘텐츠가 뒤로 비친다)
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // 헤더는 옅게(뒤 콘텐츠 실루엣이 비치게), 푸터는 진하게(버튼 대비 확보)
  headerTint: { backgroundColor: 'rgba(20,16,30,0.40)' },
  barTint: { backgroundColor: 'rgba(20,16,30,0.62)' },
  fmtLabel: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: colors.lav2,
    backgroundColor: colors.lavSoft,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },

  paperPad: { paddingHorizontal: 22, paddingVertical: 24 },
  dDate: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 14,
  },
  masthead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
    paddingBottom: 9,
    marginBottom: 15,
  },
  mastheadName: { fontWeight: '800', fontSize: 15, color: colors.heading, letterSpacing: 0.3 },
  mastheadDate: { fontSize: 10, color: colors.muted },
  empty: { color: colors.muted, fontSize: 15 },

  // 고정 글라스 하단(절대배치) — 액션 + 고치기 입력
  footerKav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  editBtn: {
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.glass,
  },
  editTxt: { color: colors.textSoft, fontWeight: '700', fontSize: 14 },

  reviseCard: {},
  cardDesc: { color: colors.textSoft, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },

  attachWrap: { marginTop: spacing.xl },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  attachImg: {
    width: 110,
    height: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachCap: { color: colors.muted, fontSize: 12, marginTop: 4 },

  devToggle: { marginTop: spacing.xl, paddingVertical: spacing.sm },
  devToggleTxt: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  devTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  devMeta: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.bubble,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.lav },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: colors.onLav, fontSize: 15, lineHeight: 22, fontWeight: '500' },
});

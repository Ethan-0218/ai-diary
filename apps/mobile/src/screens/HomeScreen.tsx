import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_MODEL_ID,
  type HomeFirmNotebook,
  type HomeSoftNotebook,
  type HomeSummaryDto,
  type NotebookDto,
} from '@ai-diary/shared';
import { api } from '../lib/api';
import { getCurrentCoords } from '../lib/location';
import { toUserMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { ErrorState } from '../components/ui';
import {
  BookCover,
  GlassCard,
  GradientButton,
  NightBackground,
  ProgressBar,
} from '../components/glass';
import { colors, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function partOfDay(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return '깊은 밤';
  if (h < 11) return '아침';
  if (h < 14) return '한낮';
  if (h < 18) return '오후';
  if (h < 22) return '저녁';
  return '늦은 저녁';
}

function formatDate(dateStr: string): { big: string; sub: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    big: `${m}월 ${d}일`,
    sub: `${WEEKDAYS[date.getDay()]}요일 · ${partOfDay()}`,
  };
}

/** state별 선인사 메시지(친구 톤). 동적 예정기억 훅은 P4에서. */
const GREET: Record<HomeSummaryDto['state'], string> = {
  s0: '오늘 하루도 고생했어. 근데 지금 쓰는 일기장이 없네 — 한 권 들일까?',
  s1: '오늘 하루는 어땠어? 천천히 들려줘.',
  s2: '아까 하던 얘기, 이어서 들려줄래?',
  s3: '오늘 얘기 잘 들었어. 일기로 남겨뒀어 — 내일 또 보자 :)',
};

function firmSub(f: HomeFirmNotebook): string {
  switch (f.todaySlotState) {
    case 'filled':
      return '오늘 1편 남겼어 ✓';
    case 'drafting':
      return '오늘 이야기 모으는 중…';
    case 'empty':
      return '오늘 칸은 아직 비어 있어';
    default:
      return '오늘은 쉬어가는 날';
  }
}

export function HomeScreen({ navigation }: RootScreenProps<'Home'>) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<HomeSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .getHomeSummary()
      .then(setSummary)
      .catch((e) => setError(toUserMessage(e)))
      .finally(() => setLoaded(true));
  }, []);

  // 자체 home-top을 쓰므로 네비 헤더는 숨긴다.
  useLayoutEffect(
    () => navigation.setOptions({ headerShown: false }),
    [navigation],
  );
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  /** 오늘 칸 열기 — 이미 시작된 오늘 대화가 있으면 그쪽으로(멱등). */
  const openNotebook = async (
    nb: NotebookDto,
    todayConvId?: string | null,
    slotState?: HomeFirmNotebook['todaySlotState'],
  ) => {
    if (todayConvId && slotState === 'filled') {
      navigation.navigate('Diary', { conversationId: todayConvId });
      return;
    }
    if (todayConvId && slotState === 'drafting') {
      navigation.navigate('Chat', { conversationId: todayConvId });
      return;
    }
    setBusy(nb.id);
    try {
      const coords = await getCurrentCoords();
      const conv = await api.createConversation(
        nb.id,
        DEFAULT_MODEL_ID,
        coords ?? undefined,
      );
      navigation.navigate('Chat', { conversationId: conv.id });
    } catch (e: any) {
      Alert.alert('열기 실패', toUserMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onAvatar = () => {
    Alert.alert('계정', undefined, [
      { text: '로그아웃', style: 'destructive', onPress: () => signOut() },
      { text: '닫기', style: 'cancel' },
    ]);
  };

  const renderBody = (s: HomeSummaryDto) => {
    const drafting = s.firm.find((f) => f.todaySlotState === 'drafting');
    const openable = s.firm.find((f) => f.todaySlotState === 'empty');
    // greet-hero CTA가 가리킬 1순위 firm(이어쓰기 > 새로쓰기)
    const ctaFirm = drafting ?? openable ?? s.firm[0];

    return (
      <>
        {/* 선인사 히어로 */}
        <GlassCard strong style={styles.greet}>
          <View style={styles.greetIcon}>
            <Text style={styles.greetIconTxt}>✦</Text>
          </View>
          <Text style={styles.greetFrom}>오늘의 친구 · {partOfDay()}</Text>
          <Text style={styles.greetMsg}>“{GREET[s.state]}”</Text>
          {s.state === 's1' && ctaFirm && (
            <GradientButton
              label="오늘 이야기하기"
              trailing="→"
              loading={busy === ctaFirm.notebook.id}
              onPress={() =>
                openNotebook(ctaFirm.notebook, null, ctaFirm.todaySlotState)
              }
            />
          )}
          {s.state === 's2' && drafting && (
            <GradientButton
              label="이어서 이야기하기"
              trailing="→"
              onPress={() =>
                openNotebook(
                  drafting.notebook,
                  drafting.todayConversationId,
                  'drafting',
                )
              }
            />
          )}
        </GlassCard>

        {/* s0 — 진행 중인 일기장 없음 */}
        {s.state === 's0' && (
          <Pressable onPress={() => navigation.navigate('Store')}>
            <View style={styles.empty}>
              <View style={styles.emptyEmoji}>
                <Text style={styles.emptyEmojiTxt}>＋</Text>
              </View>
              <Text style={styles.emptyTitle}>아직 쓰고 있는 일기장이 없어요</Text>
              <Text style={styles.emptyDesc}>
                새 일기장을 한 권 들이면{'\n'}오늘부터 같이 채워가요.
              </Text>
              <GradientButton
                label="새 일기장 고르기"
                trailing="→"
                onPress={() => navigation.navigate('Store')}
                style={{ marginTop: spacing.md }}
              />
            </View>
          </Pressable>
        )}

        {/* s3 — 오늘 일기(결과물) */}
        {s.state === 's3' && s.todayDiary && (
          <Pressable
            onPress={() =>
              navigation.navigate('Diary', {
                conversationId: s.todayDiary!.conversationId,
              })
            }
          >
            <GlassCard strong style={styles.today}>
              <Text style={styles.todayTag}>✦ 오늘 일기 · {formatDate(s.date).big}</Text>
              <Text style={styles.todayTitle}>{s.todayDiary.title}</Text>
              <Text style={styles.todayExcerpt} numberOfLines={3}>
                {s.todayDiary.excerpt}
              </Text>
              <Text style={styles.todayRead}>읽기 ›</Text>
            </GlassCard>
          </Pressable>
        )}

        {/* firm 존 — 연대기(능동) */}
        {s.firm.length > 0 && (
          <>
            <Text style={styles.zoneLabel}>오늘의 일기장</Text>
            <View style={{ gap: 10 }}>
              {s.firm.map((f) => (
                <Pressable
                  key={f.notebook.id}
                  onPress={() =>
                    openNotebook(f.notebook, f.todayConversationId, f.todaySlotState)
                  }
                >
                  <View style={styles.row}>
                    <BookCover format={f.notebook.format} width={48} />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {f.notebook.title}
                      </Text>
                      <Text style={styles.rowSub}>{firmSub(f)}</Text>
                    </View>
                    <Text style={styles.rowGo}>
                      {busy === f.notebook.id ? '…' : '›'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* soft 존 — 컬렉션(가볍게) */}
        {s.soft.length > 0 && (
          <>
            <View style={styles.zoneRow}>
              <Text style={styles.zoneLabel}>천천히 모으는 중</Text>
              <Text style={styles.zoneHint}>서두르지 않아도 돼</Text>
            </View>
            <View style={{ gap: 10 }}>
              {s.soft.map((sc) => (
                <SoftRow
                  key={sc.notebook.id}
                  item={sc}
                  busy={busy === sc.notebook.id}
                  onPress={() => openNotebook(sc.notebook)}
                />
              ))}
            </View>
          </>
        )}

        <Pressable onPress={() => navigation.navigate('Store')}>
          <Text style={styles.shelfLink}>지난 일기 · 내 서재 ▸</Text>
        </Pressable>
      </>
    );
  };

  return (
    <NightBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
        {/* home-top */}
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateBig}>
              {summary ? formatDate(summary.date).big : ' '}
            </Text>
            {summary && (
              <Text style={styles.dateSub}>{formatDate(summary.date).sub}</Text>
            )}
          </View>
          <Pressable onPress={onAvatar} hitSlop={8} style={styles.avatar} />
        </View>

        {error ? (
          <ErrorState message={error} onRetry={load} inline />
        ) : !loaded ? (
          <Text style={styles.loading}>불러오는 중…</Text>
        ) : summary ? (
          renderBody(summary)
        ) : null}
      </ScrollView>
    </NightBackground>
  );
}

function SoftRow({
  item,
  busy,
  onPress,
}: {
  item: HomeSoftNotebook;
  busy: boolean;
  onPress: () => void;
}) {
  const { filledCount, slotCount } = item.notebook;
  return (
    <Pressable onPress={onPress}>
      <View style={styles.row}>
        <BookCover format={item.notebook.format} width={42} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.notebook.title}
          </Text>
          <View style={{ marginTop: 7 }}>
            <ProgressBar ratio={slotCount ? filledCount / slotCount : 0} />
          </View>
          <Text style={styles.softMeta}>
            {filledCount} / {slotCount}칸 · 다 채우면 한 권
          </Text>
        </View>
        <Text style={styles.rowGo}>{busy ? '…' : '›'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },
  loading: { color: colors.muted, marginTop: spacing.xl, textAlign: 'center' },

  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  dateBig: {
    fontSize: 30,
    fontWeight: '800',
    color: '#f4f0ff',
    letterSpacing: -0.6,
  },
  dateSub: { fontSize: 13.5, color: colors.textSoft, marginTop: 4 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#7e72b8',
    borderWidth: 1,
    borderColor: colors.border2,
  },

  // greet-hero
  greet: { borderRadius: 22 },
  greetIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#9a8cd8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  greetIconTxt: { fontSize: 18, color: '#fff' },
  greetFrom: { fontSize: 11.5, fontWeight: '700', color: colors.lav2, marginBottom: 7 },
  greetMsg: {
    fontSize: 16.5,
    lineHeight: 25,
    color: '#f0ecfb',
    fontWeight: '500',
    marginBottom: 16,
  },

  // empty(s0)
  empty: {
    borderRadius: 22,
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border2,
    borderStyle: 'dashed',
  },
  emptyEmoji: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.lavSoft,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyEmojiTxt: { fontSize: 26, color: colors.lav2, fontWeight: '700' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#f0ecfb', marginBottom: 9 },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.textSoft,
    textAlign: 'center',
  },

  // today-diary(s3)
  today: { borderRadius: 20 },
  todayTag: { fontSize: 11.5, fontWeight: '700', color: colors.lav2, marginBottom: 7 },
  todayTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f4f0ff',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  todayExcerpt: { fontSize: 13.5, lineHeight: 23, color: colors.textSoft, marginBottom: 12 },
  todayRead: { fontSize: 13.5, fontWeight: '700', color: colors.lav2 },

  // zones
  zoneRow: { flexDirection: 'row', alignItems: 'center' },
  zoneLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#cdc6e6',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  zoneHint: { fontSize: 11, color: colors.muted, marginTop: spacing.sm },

  // rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#ece8fa' },
  rowSub: { fontSize: 12, color: colors.textSoft, marginTop: 3 },
  rowGo: { fontSize: 18, color: colors.lav2 },
  softMeta: { fontSize: 11, color: colors.muted, fontWeight: '600', marginTop: 6 },

  shelfLink: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSoft,
  },
});

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
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
  TopScrim,
} from '../components/glass';
import { Book3D } from '../components/Book3D';
import { colors, spacing } from '../theme';
import type { TabScreenProps } from '../navigation/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(dateStr: string): { big: string; sub: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return { big: `${m}월 ${d}일`, sub: `${WEEKDAYS[date.getDay()]}요일` };
}

/** state별 선인사 메시지(친구 톤). 동적 예정기억 훅은 P4에서. */
const GREET: Record<HomeSummaryDto['state'], string> = {
  s0: '오늘 하루도 고생 많았어. 지금 쓰는 일기장이 없는데, 새로 하나 시작해볼까?',
  s1: '오늘 하루는 어땠어? 편하게 들려줘.',
  s2: '아까 하던 얘기 이어서 들려줘.',
  s3: '오늘 이야기 잘 들었어. 일기로 잘 남겨뒀어, 내일 또 보자!',
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

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
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
        <GlassCard strong lavender radius={22}>
          <View style={styles.greetIcon}>
            <Svg viewBox="0 0 24 24" width={21} height={21}>
              <Path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                fill="#fbf7ef"
              />
            </Svg>
          </View>
          <Text style={styles.greetMsg}>{GREET[s.state]}</Text>
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
          <GlassCard strong radius={20}>
            <Text style={styles.todayTag}>오늘의 일기 · {formatDate(s.date).big}</Text>
            <Text style={styles.todayTitle}>{s.todayDiary.title}</Text>
            <Text style={styles.todayExcerpt} numberOfLines={3}>
              {s.todayDiary.excerpt}
            </Text>
            <View style={styles.todayActions}>
              <Pressable
                style={[styles.tdBtn, styles.tdRead]}
                onPress={() =>
                  navigation.navigate('Diary', {
                    conversationId: s.todayDiary!.conversationId,
                  })
                }
              >
                <Text style={styles.tdReadTxt}>읽어보기</Text>
              </Pressable>
              <Pressable
                style={[styles.tdBtn, styles.tdAug]}
                onPress={() =>
                  navigation.navigate('Chat', {
                    conversationId: s.todayDiary!.conversationId,
                  })
                }
              >
                <Text style={styles.tdAugTxt}>더 이야기하기</Text>
              </Pressable>
            </View>
          </GlassCard>
        )}

        {/* firm 존 — 연대기(능동). 일기장이 없어도 '더 들이기' 진입은 보인다(s0 제외). */}
        {s.state !== 's0' && (
          <>
            <View style={styles.zoneLabel}>
              <Text style={styles.zoneTitle}>오늘의 일기장</Text>
              <Text style={styles.zlSub}>매일 한 편씩, 오늘을 이어 써요</Text>
            </View>
            <View style={{ gap: 10 }}>
              {s.firm.map((f) => (
                <Pressable
                  key={f.notebook.id}
                  onPress={() =>
                    navigation.navigate('NotebookDetail', {
                      notebookId: f.notebook.id,
                    })
                  }
                >
                  <View style={styles.row}>
                    <Book3D
                      format={f.notebook.format}
                      title={f.notebook.title}
                      width={52}
                    />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {f.notebook.title}
                      </Text>
                      <Text style={styles.rowSub}>{firmSub(f)}</Text>
                    </View>
                    <Text style={styles.rowGo}>›</Text>
                  </View>
                </Pressable>
              ))}
              <AddRow
                title="매일 쓰는 일기장 더 들이기"
                sub="달·연 단위 연대기 일기장"
                onPress={() => navigation.navigate('Store')}
              />
            </View>
          </>
        )}

        {/* soft 존 — 컬렉션(가볍게). 일기장이 없어도 '테마 들이기' 진입은 보인다(s0 제외). */}
        {s.state !== 's0' && (
          <>
            <View style={styles.zoneLabel}>
              <Text style={styles.zoneTitle}>천천히 모으는 중</Text>
              <Text style={styles.zlSub}>칸을 다 채우면 한 권이 완성돼요</Text>
            </View>
            <View style={{ gap: 10 }}>
              {s.soft.map((sc) => (
                <SoftRow
                  key={sc.notebook.id}
                  item={sc}
                  onResume={() => openNotebook(sc.notebook)}
                  onPress={() =>
                    navigation.navigate('NotebookDetail', {
                      notebookId: sc.notebook.id,
                    })
                  }
                />
              ))}
              <AddRow
                title="테마 일기장 들이기"
                sub="30일 챌린지·여행 기록 같은 컬렉션"
                onPress={() => navigation.navigate('Store')}
              />
            </View>
          </>
        )}

      </>
    );
  };

  return (
    <NightBackground>
      <Animated.ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm },
        ]}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
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
      </Animated.ScrollView>
      <TopScrim height={insets.top} scrollY={scrollY} />
    </NightBackground>
  );
}

function SoftRow({
  item,
  onPress,
  onResume,
}: {
  item: HomeSoftNotebook;
  onPress: () => void;
  onResume: () => void;
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
        <Pressable style={styles.srCta} onPress={onResume} hitSlop={6}>
          <Text style={styles.srCtaTxt}>이어쓰기</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** firm/soft 존 끝의 '더 들이기' 점선 카드. */
function AddRow({
  title,
  sub,
  onPress,
}: {
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.addRow}>
        <View style={styles.addIco}>
          <Text style={styles.addIcoTxt}>＋</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.addT}>{title}</Text>
          <Text style={styles.addS}>{sub}</Text>
        </View>
        <Text style={styles.rowGo}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 110, gap: spacing.md },
  loading: { color: colors.muted, marginTop: spacing.xl, textAlign: 'center' },

  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  dateBig: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.heading,
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
    color: colors.text,
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
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 9 },
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
    color: colors.heading,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  todayExcerpt: { fontSize: 13.5, lineHeight: 23, color: colors.textSoft, marginBottom: 14 },
  todayActions: { flexDirection: 'row', gap: 9 },
  tdBtn: { flex: 1, borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  tdRead: { backgroundColor: colors.lav2 },
  tdReadTxt: { color: colors.onLav, fontWeight: '700', fontSize: 13.5 },
  tdAug: { borderWidth: 1, borderColor: colors.border2 },
  tdAugTxt: { color: colors.textSoft, fontWeight: '700', fontSize: 13.5 },

  // zones
  zoneLabel: { marginTop: spacing.lg, marginBottom: spacing.md },
  zoneTitle: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  zlSub: { fontSize: 11.5, fontWeight: '500', color: colors.muted, marginTop: 3 },

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
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 12, color: colors.textSoft, marginTop: 3 },
  rowGo: { fontSize: 18, color: colors.lav2 },
  softMeta: { fontSize: 11, color: colors.muted, fontWeight: '600', marginTop: 6 },
  srCta: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 11,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  srCtaTxt: { color: colors.lav2, fontWeight: '700', fontSize: 12.5 },

  // 더 들이기 점선 카드
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border2,
    borderStyle: 'dashed',
  },
  addIco: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.lavSoft,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcoTxt: { fontSize: 21, color: colors.lav2, fontWeight: '700' },
  addT: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  addS: { fontSize: 11.5, color: colors.muted },

  shelfLink: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSoft,
  },
});

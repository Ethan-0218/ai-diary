import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
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
  getFormatDef,
  type NotebookDetailDto,
} from '@ai-diary/shared';
import { api } from '../lib/api';
import { getCurrentCoords } from '../lib/location';
import { toUserMessage } from '../lib/errors';
import { ErrorState } from '../components/ui';
import {
  BackButton,
  GradientButton,
  NightBackground,
  ProgressBar,
} from '../components/glass';
import { Book3D } from '../components/Book3D';
import { colors, formatColors, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
// 서버 todaySlotDate()와 동일한 "새벽 5시 컷" — 5시 이전은 전날을 오늘로 친다.
// (기기 타임존 = 유저 타임존이라 로컬 시각 기준으로 서버 슬롯 날짜와 정합)
const todayLocal = () => {
  const d = new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function NotebookDetailScreen({
  route,
  navigation,
}: RootScreenProps<'NotebookDetail'>) {
  const { notebookId } = route.params;
  const insets = useSafeAreaInsets();
  const [nb, setNb] = useState<NotebookDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .getNotebook(notebookId)
      .then(setNb)
      .catch((e) => setError(toUserMessage(e)))
      .finally(() => setLoaded(true));
  }, [notebookId]);

  useLayoutEffect(
    () => navigation.setOptions({ headerShown: false }),
    [navigation],
  );
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const openToday = async () => {
    if (!nb) return;
    setBusy(true);
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
      setBusy(false);
    }
  };
  const openDiary = (conversationId: string) =>
    navigation.navigate('Diary', { conversationId });
  const openChat = (conversationId: string) =>
    navigation.navigate('Chat', { conversationId });

  const isPeriod = nb?.periodType === 'period';
  const done = nb ? nb.status === 'completed' : false;

  // 오늘 칸의 상태 — 기간형에서 하단 CTA를 "오늘 이미 썼는지"에 맞춰 바꾼다.
  const todaySlot =
    isPeriod && nb
      ? nb.slots.find((s) => s.slotDate === todayLocal()) ?? null
      : null;

  return (
    <NightBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
        <View style={styles.topRow}>
          <BackButton onPress={() => navigation.goBack()} />
          <Pressable
            style={styles.gear}
            hitSlop={8}
            onPress={() => navigation.navigate('NotebookSettings', { notebookId })}
          >
            <Text style={styles.gearTxt}>⚙</Text>
          </Pressable>
        </View>

        {error ? (
          <ErrorState message={error} onRetry={load} inline />
        ) : !loaded || !nb ? (
          <Text style={styles.loading}>불러오는 중…</Text>
        ) : (
          <>
            <View style={styles.hero}>
              <Book3D format={nb.format} title={nb.title} width={94} />
              <View style={styles.heroInfo}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {nb.title}
                </Text>
                <Text style={styles.heroMeta}>
                  {isPeriod ? '기간형' : '칸형'} · {getFormatDef(nb.format).label}
                </Text>
                <View style={styles.heroProg}>
                  <ProgressBar
                    ratio={nb.slotCount ? nb.filledCount / nb.slotCount : 0}
                  />
                </View>
                <Text style={styles.heroPct}>
                  {isPeriod
                    ? `${nb.filledCount}편을 남겼어`
                    : `${nb.filledCount} / ${nb.slotCount}칸`}
                </Text>
              </View>
            </View>

            {isPeriod ? (
              <PeriodCalendar nb={nb} onPick={openDiary} />
            ) : (
              <CellSlots
                nb={nb}
                onPick={openDiary}
                onResume={openChat}
                onWrite={openToday}
              />
            )}

            {!done && (
              <View style={styles.ctaWrap}>
                {todaySlot?.status === 'filled' ? (
                  // 오늘 일기를 이미 완성 → 새로 쓰기 대신 보기
                  <GradientButton
                    label="오늘 일기 보기"
                    trailing="→"
                    onPress={() =>
                      todaySlot.conversationId &&
                      openDiary(todaySlot.conversationId)
                    }
                  />
                ) : todaySlot?.status === 'drafting' ? (
                  // 오늘 대화를 시작했지만 일기 미완성 → 이어가기
                  <GradientButton
                    label="오늘 이야기 이어가기"
                    trailing="→"
                    loading={busy}
                    onPress={() =>
                      todaySlot.conversationId
                        ? openChat(todaySlot.conversationId)
                        : openToday()
                    }
                  />
                ) : (
                  <GradientButton
                    label={isPeriod ? '오늘 이야기하기' : '다음 장면 쓰기'}
                    trailing="→"
                    loading={busy}
                    onPress={openToday}
                  />
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </NightBackground>
  );
}

/** 기간형 — 월 캘린더(채운 날 filled 탭 → 일기). */
function PeriodCalendar({
  nb,
  onPick,
}: {
  nb: NotebookDetailDto;
  onPick: (conversationId: string) => void;
}) {
  const start = nb.periodStart ?? nb.slots.find((s) => s.slotDate)?.slotDate;
  if (!start) return null;
  const [y, m] = start.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayLocal();
  const byDate = new Map(
    nb.slots.filter((s) => s.slotDate).map((s) => [s.slotDate as string, s]),
  );

  const cells: ({ d: number; ds: string } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, ds: `${y}-${pad(m)}-${pad(d)}` });
  }

  return (
    <View style={styles.cal}>
      <Text style={styles.calHead}>
        {y}년 {m}월
      </Text>
      <View style={styles.dowRow}>
        {WD.map((w) => (
          <Text key={w} style={styles.dow}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid7}>
        {cells.map((c, i) => {
          if (!c) return <View key={`e${i}`} style={styles.dayCell} />;
          const slot = byDate.get(c.ds);
          const isToday = c.ds === today;
          const filled = slot?.status === 'filled';
          const hasSlot = !!slot;
          return (
            <View key={c.ds} style={styles.dayCell}>
              <Pressable
                style={[
                  styles.dayInner,
                  filled && styles.dayFilled,
                  isToday && styles.dayToday,
                ]}
                disabled={!filled || !slot?.conversationId}
                onPress={() =>
                  slot?.conversationId && onPick(slot.conversationId)
                }
              >
                <Text
                  style={[
                    styles.dayNum,
                    filled && styles.dayNumFilled,
                    !hasSlot && styles.dayNumBlank,
                    isToday && styles.dayNumToday,
                  ]}
                >
                  {c.d}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text style={styles.calNote}>
        빈 날은 그저 비워둘게.{'\n'}채운 날만 너의 기록이야.
      </Text>
    </View>
  );
}

/** 칸형 — 슬롯 그리드(done 탭 → 일기, next → 쓰기). */
function CellSlots({
  nb,
  onPick,
  onResume,
  onWrite,
}: {
  nb: NotebookDetailDto;
  onPick: (conversationId: string) => void;
  onResume: (conversationId: string) => void;
  onWrite: () => void;
}) {
  // 다음에 새로 쓸 칸 = 첫 빈 칸
  const nextIdx = nb.slots.find((s) => s.status === 'empty')?.index;

  return (
    <View style={styles.slots}>
      {nb.slots.map((s) => {
        // 일기 완성된 칸 → 읽기
        if (s.status === 'filled') {
          return (
            <View key={s.id} style={styles.slotCell}>
              <Pressable
                style={[styles.slotBox, styles.slotDone]}
                disabled={!s.conversationId}
                onPress={() => s.conversationId && onPick(s.conversationId)}
              >
                <Text style={styles.slotNum}>{s.index}</Text>
                <Text style={styles.slotLabel}>기록됨</Text>
              </Pressable>
            </View>
          );
        }
        // 쓰다 만 칸 → 이어쓰기
        if (s.status === 'drafting') {
          return (
            <View key={s.id} style={styles.slotCell}>
              <Pressable
                style={[styles.slotBox, styles.slotNext]}
                disabled={!s.conversationId}
                onPress={() => s.conversationId && onResume(s.conversationId)}
              >
                <Text style={[styles.slotNum, styles.slotNumNext]}>
                  {s.index}
                </Text>
                <Text style={styles.slotLabelNext}>이어쓰기 ›</Text>
              </Pressable>
            </View>
          );
        }
        // 다음 빈 칸 → 새로 쓰기
        if (s.index === nextIdx) {
          return (
            <View key={s.id} style={styles.slotCell}>
              <Pressable
                style={[styles.slotBox, styles.slotNext]}
                onPress={onWrite}
              >
                <Text style={[styles.slotNum, styles.slotNumNext]}>
                  {s.index}
                </Text>
                <Text style={styles.slotLabelNext}>지금 쓰기 ›</Text>
              </Pressable>
            </View>
          );
        }
        return (
          <View key={s.id} style={styles.slotCell}>
            <View style={[styles.slotBox, styles.slotEmpty]}>
              <Text style={styles.slotNumEmpty}>{s.index}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const NOVEL = formatColors.novel;

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 40 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.glass2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearTxt: { fontSize: 18, color: colors.text },
  loading: { color: colors.muted, marginTop: spacing.xl, textAlign: 'center' },
  hero: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-end',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  heroInfo: { flex: 1, paddingBottom: 4, minWidth: 0 },
  heroTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.heading,
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  heroMeta: { fontSize: 12.5, color: colors.textSoft, marginTop: 7, marginBottom: 12 },
  heroProg: { marginBottom: 6 },
  heroPct: { fontSize: 11.5, color: colors.muted, fontWeight: '600' },

  // 캘린더
  cal: { marginTop: spacing.sm },
  calHead: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.heading,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  dowRow: { flexDirection: 'row', marginBottom: 6 },
  dow: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  grid7: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  dayInner: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayFilled: {
    backgroundColor: colors.lavSoft,
    borderWidth: 1,
    borderColor: 'rgba(199,188,252,0.20)',
  },
  dayToday: { borderWidth: 2, borderColor: colors.lav },
  dayNum: { fontSize: 12.5, color: colors.textSoft },
  dayNumBlank: { color: '#544e6e' },
  dayNumFilled: { color: colors.lav2, fontWeight: '700' },
  dayNumToday: { color: '#fff', fontWeight: '800' },
  calNote: {
    marginTop: spacing.lg,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },

  // 칸형 슬롯
  slots: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  slotCell: { width: '33.33%', aspectRatio: 0.82, padding: 5 },
  slotBox: {
    flex: 1,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  slotDone: { backgroundColor: NOVEL.c2 },
  slotNext: {
    borderWidth: 2,
    borderColor: colors.lav,
    backgroundColor: colors.lavSoft,
  },
  slotEmpty: {
    borderWidth: 1.5,
    borderColor: colors.border2,
    borderStyle: 'dashed',
  },
  slotNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  slotNumNext: { color: colors.lav2 },
  slotNumEmpty: { fontSize: 20, fontWeight: '800', color: '#544e6e' },
  slotLabel: { fontSize: 10, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  slotLabelNext: { fontSize: 10, color: colors.lav2, fontWeight: '700' },

  ctaWrap: { marginTop: spacing.xl },
});

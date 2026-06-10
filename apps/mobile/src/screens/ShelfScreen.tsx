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
import { DEFAULT_MODEL_ID, type NotebookDto } from '@ai-diary/shared';
import { api } from '../lib/api';
import { getCurrentCoords } from '../lib/location';
import { toUserMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { ErrorState } from '../components/ui';
import { NightBackground, ProgressBar, Spine } from '../components/glass';
import { Book3D } from '../components/Book3D';
import { colors, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

/** 진행중 캐러셀 카드 폭 + 간격(스냅 간격 계산에 사용) */
const CARD_W = 150;
const CARD_GAP = 14;

export function ShelfScreen({ navigation }: RootScreenProps<'Shelf'>) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [notebooks, setNotebooks] = useState<NotebookDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .listNotebooks()
      .then(setNotebooks)
      .catch((e) => setError(toUserMessage(e)))
      .finally(() => setLoaded(true));
  }, []);

  useLayoutEffect(
    () => navigation.setOptions({ headerShown: false }),
    [navigation],
  );
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const openNotebook = async (nb: NotebookDto) => {
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

  const active = notebooks.filter((n) => n.status === 'active');
  const chronicle = notebooks.filter(
    (n) => n.status === 'completed' && n.periodType === 'period',
  );
  const collection = notebooks.filter(
    (n) => n.status === 'completed' && n.periodType === 'cell',
  );
  const name = user?.name?.trim() || '나';

  return (
    <NightBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
        {/* 상단 back + 헤더 */}
        <View style={styles.top}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.back}>
            <Text style={styles.backTxt}>‹</Text>
          </Pressable>
        </View>
        <Text style={styles.greet}>차오르는 나의 서재</Text>
        <Text style={styles.title}>{name}의 서재</Text>

        {error ? (
          <ErrorState message={error} onRetry={load} inline />
        ) : !loaded ? (
          <Text style={styles.loading}>불러오는 중…</Text>
        ) : (
          <>
            {/* 진행 중 — 3D 책 그리드 */}
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionTitle}>진행 중</Text>
              <Text style={styles.sectionCount}>{active.length}권</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_W + CARD_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={styles.carousel}
            >
              {active.map((nb) => (
                <Pressable
                  key={nb.id}
                  style={styles.cell}
                  onPress={() => openNotebook(nb)}
                  disabled={busy !== null}
                >
                  <Book3D format={nb.format} title={nb.title} width={CARD_W} />
                  <View style={styles.miniProg}>
                    <ProgressBar
                      ratio={nb.slotCount ? nb.filledCount / nb.slotCount : 0}
                    />
                  </View>
                  <View style={styles.cellLabel}>
                    <Text style={styles.cellTitle} numberOfLines={1}>
                      {nb.title}
                    </Text>
                    <Text style={styles.cellCount}>
                      {busy === nb.id ? '…' : `${nb.filledCount}/${nb.slotCount}`}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {/* 새 일기장 들이기 */}
              <Pressable
                style={styles.cell}
                onPress={() => navigation.navigate('Store')}
              >
                <View style={styles.addCover}>
                  <Text style={styles.addPlus}>＋</Text>
                  <Text style={styles.addStore}>스토어</Text>
                </View>
                <Text style={styles.addLabel}>새 일기장 들이기</Text>
              </Pressable>
            </ScrollView>

            {/* 완성한 서재 — 연대기 */}
            {chronicle.length > 0 && (
              <ShelfRow label="완성한 서재" count={`연대기 · ${chronicle.length}권`}>
                {chronicle.map((nb) => (
                  <Spine
                    key={nb.id}
                    format={nb.format}
                    title={nb.title}
                    caption={`${nb.filledCount}편`}
                  />
                ))}
              </ShelfRow>
            )}

            {/* 완성한 서재 — 컬렉션 */}
            {collection.length > 0 && (
              <ShelfRow label="완성한 서재" count={`컬렉션 · ${collection.length}권`}>
                {collection.map((nb) => (
                  <Spine
                    key={nb.id}
                    format={nb.format}
                    title={nb.title}
                    caption={`${nb.slotCount}칸`}
                  />
                ))}
              </ShelfRow>
            )}

            {active.length === 0 && chronicle.length === 0 && collection.length === 0 && (
              <Text style={styles.loading}>아직 일기장이 없어요. 스토어에서 한 권 들여보세요.</Text>
            )}
          </>
        )}
      </ScrollView>
    </NightBackground>
  );
}

/** 완성한 서재 한 줄 — 라벨 + 책등 가로 스크롤 + 선반(board). */
function ShelfRow({
  label,
  count,
  children,
}: {
  label: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.spines}
      >
        {children}
      </ScrollView>
      <View style={styles.board} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 60 },
  loading: { color: colors.muted, marginTop: spacing.lg, textAlign: 'center', lineHeight: 22 },

  top: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTxt: { fontSize: 22, color: colors.textSoft, marginTop: -2 },
  greet: { fontSize: 13, color: colors.textSoft, marginTop: spacing.sm },
  title: {
    fontSize: 27,
    fontWeight: '800',
    color: '#f4f0ff',
    letterSpacing: -0.5,
    marginTop: 4,
  },

  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#cdc6e6' },
  sectionCount: { fontSize: 11.5, color: colors.muted, fontWeight: '600' },

  carousel: { gap: CARD_GAP, paddingVertical: 4, paddingRight: spacing.lg },
  cell: { width: CARD_W },
  miniProg: { marginTop: 6, marginHorizontal: 4 },
  cellLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  cellTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  cellCount: { fontSize: 11.5, color: colors.muted, fontWeight: '600', marginLeft: 6 },

  addCover: {
    aspectRatio: 1 / 1.34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border2,
    borderStyle: 'dashed',
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addPlus: { fontSize: 28, color: colors.textSoft, fontWeight: '700' },
  addStore: { fontSize: 11, color: colors.muted },
  addLabel: { fontSize: 13, color: colors.muted, marginTop: 7 },

  spines: { gap: 7, paddingVertical: 6, paddingRight: spacing.lg },
  board: {
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(199,188,252,0.22)',
    marginTop: -2,
  },
});

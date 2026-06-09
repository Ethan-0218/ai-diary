import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  DEFAULT_MODEL_ID,
  getFormatDef,
  type NotebookDto,
  type ConversationSummary,
} from '@ai-diary/shared';
import { api } from '../lib/api';
import { getCurrentCoords } from '../lib/location';
import { toUserMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorState } from '../components/ui';
import { colors, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: RootScreenProps<'Home'>) {
  const { signOut } = useAuth();
  const [notebooks, setNotebooks] = useState<NotebookDto[]>([]);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.listNotebooks(), api.listConversations()])
      .then(([nb, h]) => {
        setNotebooks(nb);
        setHistory(h);
      })
      .catch((e) => setError(toUserMessage(e)))
      .finally(() => setLoaded(true));
  }, []);

  // 헤더 우측 로그아웃
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => signOut()} hitSlop={8}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>로그아웃</Text>
        </Pressable>
      ),
    });
  }, [navigation, signOut]);

  // 화면 포커스마다 갱신(일기 완성/구매 후 돌아왔을 때 반영)
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  // 일기장의 "오늘 칸"을 열어 대화 시작(이미 오늘 대화가 있으면 그걸 이어서 — 백엔드 멱등)
  const openNotebook = async (nb: NotebookDto) => {
    setOpening(nb.id);
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
      setOpening(null);
    }
  };

  const mintStarter = async (format: 'plain' | 'novel') => {
    setMinting(true);
    try {
      await api.mintStarter(format);
      load();
    } catch (e: any) {
      Alert.alert('스타터 받기 실패', toUserMessage(e));
    } finally {
      setMinting(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
    >
      {error ? (
        <ErrorState message={error} onRetry={load} inline />
      ) : !loaded ? (
        <Text style={styles.muted}>불러오는 중…</Text>
      ) : (
        <>
          <View style={styles.shelfHead}>
            <Text style={styles.sectionTitle}>내 책장</Text>
            <Pressable onPress={() => navigation.navigate('Store')} hitSlop={8}>
              <Text style={styles.storeLink}>+ 새 일기장</Text>
            </Pressable>
          </View>

          {notebooks.length === 0 ? (
            <Card>
              <Text style={styles.emptyTitle}>아직 일기장이 없어요</Text>
              <Text style={styles.emptyDesc}>
                무료 스타터(3일)로 가볍게 시작하거나, 스토어에서 한 권 골라보세요.
              </Text>
              <View style={styles.starterRow}>
                <Button
                  label="일반 3일"
                  onPress={() => mintStarter('plain')}
                  loading={minting}
                  style={{ flex: 1 }}
                />
                <Button
                  label="소설 3일"
                  onPress={() => mintStarter('novel')}
                  loading={minting}
                  style={{ flex: 1 }}
                />
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  label="스토어 둘러보기"
                  variant="primary"
                  onPress={() => navigation.navigate('Store')}
                />
              </View>
            </Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {notebooks.map((nb) => (
                <Pressable
                  key={nb.id}
                  onPress={() => openNotebook(nb)}
                  disabled={opening !== null}
                >
                  <Card style={styles.nbCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nbTitle}>{nb.title}</Text>
                      <Text style={styles.nbMeta}>
                        {getFormatDef(nb.format).label} ·{' '}
                        {nb.periodType === 'period' ? '기간형' : '칸형'} ·{' '}
                        {nb.filledCount}/{nb.slotCount}칸
                      </Text>
                    </View>
                    <Text style={styles.chevron}>
                      {opening === nb.id ? '…' : '›'}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
            최근 대화
          </Text>
          {history.length === 0 ? (
            <Text style={styles.muted}>아직 대화가 없습니다.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {history.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() =>
                    navigation.navigate(c.hasDiary ? 'Diary' : 'Chat', {
                      conversationId: c.id,
                    })
                  }
                >
                  <Card style={styles.nbCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nbTitle}>{c.title}</Text>
                      <Text style={styles.nbMeta}>
                        {new Date(c.createdAt).toLocaleString('ko-KR')}
                        {c.hasDiary ? ' · 일기 완성' : ' · 진행 중'}
                      </Text>
                    </View>
                    <Badge>${c.totalUsd.toFixed(4)}</Badge>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 80 },
  muted: { color: colors.muted },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  shelfHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  storeLink: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 14, color: colors.muted, marginTop: 6, lineHeight: 20 },
  starterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  nbCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nbTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  nbMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.muted },
});

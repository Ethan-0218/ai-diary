import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  DIARY_FORMAT_LIST,
  MODEL_OPTIONS,
  DEFAULT_MODEL_ID,
  type DiaryFormat,
  type ConversationSummary,
} from '@ai-diary/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { RootScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: RootScreenProps<'Home'>) {
  const { signOut } = useAuth();
  const [format, setFormat] = useState<DiaryFormat>('plain');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [creating, setCreating] = useState(false);

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

  // 화면 포커스마다 히스토리 갱신(일기 완성 후 돌아왔을 때 상태 반영)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      api.listConversations().then(setHistory).catch(() => {});
    });
    return unsub;
  }, [navigation]);

  const start = async () => {
    setCreating(true);
    try {
      // 위치(날씨)는 1차 생략 — 좌표 없이 생성. (geolocation은 후속)
      const conv = await api.createConversation(format, modelId);
      navigation.navigate('Chat', { conversationId: conv.id });
    } catch (e: any) {
      Alert.alert('대화 생성 실패', e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.lead}>AI와 대화하면 오늘 하루를 일기로 써줍니다.</Text>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={styles.sectionTitle}>1. 일기 형식 고르기</Text>
        <View style={{ gap: 10 }}>
          {DIARY_FORMAT_LIST.map((f) => {
            const selected = format === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFormat(f.id)}
                style={[styles.optionRow, selected && styles.optionRowSelected]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{f.label}</Text>
                  <Text style={styles.optionDesc}>{f.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
          2. 모델 고르기
        </Text>
        <View style={styles.chips}>
          {MODEL_OPTIONS.map((m) => {
            const selected = modelId === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => setModelId(m.id)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Button
            label={creating ? '시작하는 중…' : '채팅 시작하기'}
            variant="primary"
            onPress={start}
            loading={creating}
          />
        </View>
      </Card>

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>대화 히스토리</Text>
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
              <Card style={styles.historyCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>{c.title}</Text>
                  <Text style={styles.historyMeta}>
                    {new Date(c.createdAt).toLocaleString('ko-KR')} · {c.modelId}
                    {c.hasDiary ? ' · 일기 완성' : ' · 진행 중'}
                  </Text>
                </View>
                <Badge>${c.totalUsd.toFixed(4)}</Badge>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 80 },
  lead: { color: colors.muted, fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  muted: { color: colors.muted },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.control,
    padding: 12,
  },
  optionRowSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  optionLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  optionDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: colors.accent, fontWeight: '600' },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  historyMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NotebookDetailDto } from '@ai-diary/shared';
import { api } from '../lib/api';
import { toUserMessage } from '../lib/errors';
import {
  cancelNotebookReminders,
  ensureNotificationPermission,
  getNotificationPermission,
  reconcileReminders,
} from '../lib/notifications';
import { ErrorState } from '../components/ui';
import { BackButton, GlassCard, GradientButton, NightBackground } from '../components/glass';
import { TimePickerSheet } from '../components/TimePickerSheet';
import { colors, radius, spacing, type } from '../theme';
import type { RootScreenProps } from '../navigation/types';

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(m).padStart(2, '0')}`;
}

export function NotebookSettingsScreen({
  route,
  navigation,
}: RootScreenProps<'NotebookSettings'>) {
  const { notebookId, fromPurchase } = route.params;
  const insets = useSafeAreaInsets();

  const [nb, setNb] = useState<NotebookDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState('22:00');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);

  // 권한 확보(미결정이면 사전 안내→시스템 요청) 후 예약. 거부면 안내 배너 표시.
  const ensurePermissionAndSchedule = useCallback(async () => {
    const ok = await ensureNotificationPermission();
    setPermBlocked(!ok && (await getNotificationPermission()) === 'denied');
    if (ok) await reconcileReminders();
  }, []);

  const load = useCallback(() => {
    setError(null);
    api
      .getNotebook(notebookId)
      .then((d) => {
        setNb(d);
        setEnabled(d.reminderEnabled);
        setTime(d.reminderTime);
        // 리마인더가 켜진 채로 설정 화면에 들어오면 권한 확보+예약을 보장한다
        // (토글이 이미 ON이라 onToggle이 안 불려 권한 요청이 누락되던 문제 해결).
        if (d.reminderEnabled) void ensurePermissionAndSchedule();
      })
      .catch((e) => setError(toUserMessage(e)));
  }, [notebookId, ensurePermissionAndSchedule]);
  useEffect(load, [load]);

  // 변경분을 백엔드에 저장. 실패 시 롤백. 성공 여부 반환.
  const save = async (
    patch: { reminderEnabled?: boolean; reminderTime?: string },
    rollback: () => void,
  ): Promise<boolean> => {
    try {
      await api.updateReminder(notebookId, patch);
      return true;
    } catch (e) {
      rollback();
      Alert.alert('저장 실패', toUserMessage(e));
      return false;
    }
  };

  const onToggle = async (next: boolean) => {
    const prev = enabled;
    setEnabled(next);
    if (!(await save({ reminderEnabled: next }, () => setEnabled(prev)))) return;
    if (next) {
      await ensurePermissionAndSchedule();
    } else {
      setPermBlocked(false);
      await cancelNotebookReminders(notebookId);
    }
  };

  const onConfirmTime = async (next: string) => {
    const prev = time;
    setTime(next);
    setPickerOpen(false);
    if (!(await save({ reminderTime: next }, () => setTime(prev)))) return;
    if (enabled) await ensurePermissionAndSchedule();
  };

  if (error && !nb) {
    return (
      <NightBackground>
        <ErrorState message={error} onRetry={load} />
      </NightBackground>
    );
  }

  return (
    <NightBackground>
      {/* 고정 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      {/* 본문 스크롤 */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.title}>알림 설정</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {fromPurchase
            ? `'${nb?.title ?? '일기장'}'을 들였어요. 알림을 맞춰두면 매일 잊지 않고 쓸 수 있어요.`
            : `'${nb?.title ?? '일기장'}'의 일기 쓰기 알림이에요.`}
        </Text>

        <GlassCard strong radius={18} contentStyle={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>일기 쓰기 알림</Text>
              <Text style={styles.rowDesc}>매일 정한 시간에 알려드려요.</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={onToggle}
              trackColor={{ false: 'rgba(255,255,255,0.16)', true: colors.lav }}
              thumbColor="#fff"
              ios_backgroundColor="rgba(255,255,255,0.16)"
            />
          </View>

          <View style={styles.divider} />

          <Pressable
            style={[styles.row, !enabled && styles.rowDisabled]}
            disabled={!enabled}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.rowTitle}>시간</Text>
            <Text style={styles.timeValue}>{timeLabel(time)} ›</Text>
          </Pressable>
        </GlassCard>

        {permBlocked && (
          <Pressable style={styles.permHint} onPress={() => Linking.openSettings()}>
            <Text style={styles.permHintTxt}>
              기기 설정에서 알림이 꺼져 있어요. 탭해서 켜기 →
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* 고정 하단 CTA (구매 직후 완료 버튼) */}
      {fromPurchase && (
        <View style={[styles.footer, { paddingBottom: insets.bottom || spacing.md }]}>
          <GradientButton
            label="완료"
            trailing="→"
            onPress={() => navigation.navigate('Main', { screen: 'Shelf' })}
          />
        </View>
      )}

      <TimePickerSheet
        visible={pickerOpen}
        value={time}
        onClose={() => setPickerOpen(false)}
        onConfirm={onConfirmTime}
      />
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  title: { ...type.h1, color: colors.heading, marginBottom: 8 },
  sub: { ...type.body, color: colors.textSoft, marginBottom: spacing.xl },
  card: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  rowDisabled: { opacity: 0.45 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowDesc: { fontSize: 13, color: colors.muted, marginTop: 3 },
  timeValue: { marginLeft: 'auto', fontSize: 16, fontWeight: '700', color: colors.lav2 },
  divider: { height: 1, backgroundColor: colors.border },
  permHint: {
    marginTop: spacing.lg,
    padding: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  permHintTxt: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});

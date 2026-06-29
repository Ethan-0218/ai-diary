import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard, GradientButton } from './glass';
import { colors, type } from '../theme';
import { setNotificationPrimingPresenter } from '../lib/notificationPriming';

/**
 * 알림 권한 "사전 안내" 모달 — 앱 테마(다크 글라스)에 맞춘 커스텀 팝업.
 * 시스템 권한 요청 전에 왜 알림이 필요한지 설명하고, '계속'을 누르면
 * 실제 시스템 권한 요청으로 넘어간다. 앱 루트(App.tsx)에 한 번 마운트한다.
 */
export function NotificationPrimingModal() {
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    setNotificationPrimingPresenter(
      () =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
          setVisible(true);
        }),
    );
    return () => setNotificationPrimingPresenter(null);
  }, []);

  const finish = (result: boolean) => {
    setVisible(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => finish(false)}
    >
      <Pressable style={styles.backdrop} onPress={() => finish(false)}>
        <Pressable style={styles.cardWrap} onPress={() => {}}>
          <GlassCard lavender strong radius={22} contentStyle={styles.pad}>
            <Text style={styles.title}>알림을 보내도 될까요?</Text>
            <Text style={styles.body}>
              정한 시간에 "오늘 일기 쓰자"고 살짝 알려드릴게요. 알림은 기기에만
              머무는 로컬 알림이라 따로 전송하지 않아요. 언제든 일기장 설정에서
              끌 수 있어요.
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.ghost}
                onPress={() => finish(false)}
                hitSlop={6}
              >
                <Text style={styles.ghostTxt}>나중에</Text>
              </Pressable>
              <GradientButton
                label="계속"
                onPress={() => finish(true)}
                style={styles.continue}
              />
            </View>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,5,11,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  cardWrap: { width: '100%', maxWidth: 380 },
  pad: { padding: 22 },
  title: { ...type.h2, color: colors.heading, marginBottom: 12 },
  body: { ...type.body, color: colors.textSoft, marginBottom: 22 },
  actions: { flexDirection: 'row', gap: 10 },
  ghost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.glass2,
  },
  ghostTxt: { color: colors.text, fontSize: 15, fontWeight: '700' },
  continue: { flex: 1 },
});

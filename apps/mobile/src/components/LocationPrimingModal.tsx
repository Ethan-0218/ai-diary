import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard, GradientButton } from './glass';
import { colors, type } from '../theme';
import { setLocationPrimingPresenter } from '../lib/locationPriming';

/**
 * 위치 권한 "사전 안내" 모달 — 앱 테마(다크 글라스)에 맞춘 커스텀 팝업.
 * 네이티브 Alert 대신 이걸 띄워 왜 위치가 필요한지 설명하고,
 * '계속'을 누르면 그때 실제 시스템 권한 요청으로 넘어간다.
 *
 * 앱 루트(App.tsx)에 한 번 마운트해두면 location.ts가 어디서 호출하든 동작한다.
 */
export function LocationPrimingModal() {
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    setLocationPrimingPresenter(
      () =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
          setVisible(true);
        }),
    );
    return () => setLocationPrimingPresenter(null);
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
      {/* 바깥 탭 → 나중에(취소) */}
      <Pressable style={styles.backdrop} onPress={() => finish(false)}>
        {/* 카드 탭은 닫힘 방지 */}
        <Pressable style={styles.cardWrap} onPress={() => {}}>
          <GlassCard lavender strong radius={22} contentStyle={styles.pad}>
            <Text style={styles.title}>위치를 사용해도 될까요?</Text>
            <Text style={styles.body}>
              대화를 시작할 때 현재 위치로 그날의 날씨를 찾아 일기에 함께
              기록해요.{'\n\n'}위치는 날씨 메모에만 쓰이고 따로 저장하지 않아요.
              허용하지 않아도 대화와 일기는 그대로 쓸 수 있어요.
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
  title: {
    ...type.h2,
    color: colors.heading,
    marginBottom: 12,
  },
  body: {
    ...type.body,
    color: colors.textSoft,
    marginBottom: 22,
  },
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

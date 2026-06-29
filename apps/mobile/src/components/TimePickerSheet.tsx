import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { BottomSheet } from './BottomSheet';
import { GradientButton } from './glass';
import { colors } from '../theme';

const ITEM_H = 44;
const VISIBLE = 5;
const CENTER = Math.floor(VISIBLE / 2);
const HEIGHT = ITEM_H * VISIBLE;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 5분 간격

const pad = (n: number) => String(n).padStart(2, '0');

/** 'HH:mm' → [hourIndex, minuteIndex](가장 가까운 5분으로 스냅). */
function toIndices(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number);
  const hi = Math.max(0, Math.min(23, Number.isFinite(h) ? h : 22));
  const mi = Math.max(
    0,
    Math.min(MINUTES.length - 1, Math.round((Number.isFinite(m) ? m : 0) / 5)),
  );
  return [hi, mi];
}

function Wheel({
  values,
  initialIndex,
  onIndex,
  format,
}: {
  values: number[];
  initialIndex: number;
  onIndex: (i: number) => void;
  format: (v: number) => string;
}) {
  const ref = useRef<ScrollView>(null);
  const [active, setActive] = useState(initialIndex);

  // 마운트 후 선택 위치로 즉시 이동
  useEffect(() => {
    const t = setTimeout(
      () => ref.current?.scrollTo({ y: initialIndex * ITEM_H, animated: false }),
      0,
    );
    return () => clearTimeout(t);
  }, [initialIndex]);

  const update = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.max(
      0,
      Math.min(values.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)),
    );
    if (idx !== active) setActive(idx);
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingVertical: ITEM_H * CENTER }}
      onScroll={update}
      onMomentumScrollEnd={(e) => {
        update(e);
        onIndex(
          Math.max(
            0,
            Math.min(
              values.length - 1,
              Math.round(e.nativeEvent.contentOffset.y / ITEM_H),
            ),
          ),
        );
      }}
    >
      {values.map((v, i) => (
        <View key={v} style={styles.item}>
          <Text style={[styles.itemTxt, i === active && styles.itemActive]}>
            {format(v)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** 시/분 휠로 'HH:mm'을 고르는 다크 글라스 바텀시트(네이티브 피커 미사용). */
export function TimePickerSheet({
  visible,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (time: string) => void;
}) {
  const [h0, m0] = toIndices(value);
  const hourRef = useRef(h0);
  const minRef = useRef(m0);
  // 시트가 열릴 때마다 현재 값으로 초기화
  useEffect(() => {
    if (visible) {
      hourRef.current = h0;
      minRef.current = m0;
    }
  }, [visible, h0, m0]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="알림 시간">
      <View style={styles.row}>
        <View style={styles.band} pointerEvents="none" />
        <Wheel
          values={HOURS}
          initialIndex={h0}
          onIndex={(i) => (hourRef.current = i)}
          format={(v) => `${pad(v)}시`}
        />
        <Text style={styles.colon}>:</Text>
        <Wheel
          values={MINUTES}
          initialIndex={m0}
          onIndex={(i) => (minRef.current = i)}
          format={(v) => `${pad(v)}분`}
        />
      </View>
      <GradientButton
        label="확인"
        onPress={() =>
          onConfirm(`${pad(HOURS[hourRef.current])}:${pad(MINUTES[minRef.current])}`)
        }
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: HEIGHT,
    marginBottom: 16,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_H * CENTER,
    height: ITEM_H,
    borderRadius: 12,
    backgroundColor: colors.lavSoft,
    borderWidth: 1,
    borderColor: colors.border2,
  },
  wheel: { width: 96, height: HEIGHT },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemTxt: { fontSize: 20, color: colors.muted, fontWeight: '600' },
  itemActive: { color: colors.heading, fontWeight: '800' },
  colon: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textSoft,
    marginHorizontal: 6,
  },
});

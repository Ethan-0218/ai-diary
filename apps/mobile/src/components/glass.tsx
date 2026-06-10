import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, formatColors, radius, spacing } from '../theme';
import type { DiaryFormat } from '@ai-diary/shared';

/**
 * 그라데이션은 네이티브 의존성 없이 "단색 + 반투명 오버레이 층"으로 근사한다.
 * (react-native-linear-gradient는 RN New Architecture에서 링커 충돌 → 미사용)
 */

/** 밤하늘 배경 — 단색 딥다크 + 상단 라벤더 글로우(은은한 발광). */
export function NightBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.night}>
      <View style={styles.nightGlow} pointerEvents="none" />
      {children}
    </View>
  );
}

/** 반투명 글라스 카드(다크 배경 위 — blur 없이 반투명으로 근사). */
export function GlassCard({
  children,
  style,
  strong,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 보더를 한 단계 진하게(히어로/강조 카드). */
  strong?: boolean;
}) {
  return (
    <View style={[styles.glass, strong && styles.glassStrong, style]}>
      {children}
    </View>
  );
}

/** 라벤더 CTA 버튼(pill-cta). */
export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  trailing,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** 라벨 뒤 장식(예: '→'). */
  trailing?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[styles.cta, off && styles.ctaOff, style]}
    >
      {/* 상단 광택 */}
      <View style={styles.ctaGloss} pointerEvents="none" />
      {loading && (
        <ActivityIndicator size="small" color={colors.onLav} style={styles.ctaSpin} />
      )}
      <Text style={styles.ctaText}>{label}</Text>
      {trailing ? <Text style={styles.ctaTrailing}> {trailing}</Text> : null}
    </Pressable>
  );
}

/** 진행도 바(트랙 + 라벤더 fill). ratio 0~1. */
export function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={styles.progTrack}>
      <View style={[styles.progFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

const FORMAT_KEY: Record<DiaryFormat, keyof typeof formatColors> = {
  plain: 'plain',
  newspaper: 'newspaper',
  novel: 'novel',
};

/**
 * 포맷별 책 표지(정적 — 추후 3D 책으로 교체 예정).
 * 단색(c1) 베이스 + 상단 흰 광택 + 하단 어둠 + 책등(왼쪽 세로선)·페이지(오른쪽).
 */
export function BookCover({
  format,
  width,
  style,
}: {
  format: DiaryFormat;
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c1, c2 } = formatColors[FORMAT_KEY[format]];
  const height = width * 1.34;
  return (
    <View style={[{ width, height }, style]}>
      {/* 페이지(오른쪽 종이) — 표지 뒤로 살짝 보임 */}
      <View
        style={[
          styles.bookPages,
          { top: height * 0.1, bottom: -3, right: -3, left: width * 0.16 },
        ]}
      />
      {/* 표지 */}
      <View style={[styles.bookCover, { backgroundColor: c1 }]}>
        {/* 하단 깊이(어두운 c2 톤) */}
        <View style={[styles.bookShade, { backgroundColor: c2 }]} pointerEvents="none" />
        {/* 상단 광택 */}
        <View style={styles.bookGloss} pointerEvents="none" />
        {/* 책등 라인 */}
        <View style={[styles.bookSpine, { left: width * 0.16 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  night: { flex: 1, backgroundColor: '#0b0a11' },
  nightGlow: {
    position: 'absolute',
    top: -160,
    alignSelf: 'center',
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: '#2c2746',
    opacity: 0.55,
  },
  glass: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  glassStrong: { borderColor: colors.border2, backgroundColor: 'rgba(169,156,242,0.10)' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 15,
    backgroundColor: colors.lav,
    overflow: 'hidden',
  },
  ctaOff: { opacity: 0.5 },
  ctaGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  ctaSpin: { marginRight: 8 },
  ctaText: { color: colors.onLav, fontSize: 15, fontWeight: '800' },
  ctaTrailing: { color: colors.onLav, fontSize: 17, fontWeight: '800' },
  progTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  progFill: { height: '100%', borderRadius: 99, backgroundColor: colors.lav },
  bookCover: {
    flex: 1,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 11,
    borderBottomRightRadius: 11,
    overflow: 'hidden',
  },
  bookShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    opacity: 0.5,
  },
  bookGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '38%',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  bookPages: {
    position: 'absolute',
    backgroundColor: '#f3ead4',
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  bookSpine: {
    position: 'absolute',
    top: '9%',
    bottom: '9%',
    width: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(70,45,25,0.28)',
  },
});

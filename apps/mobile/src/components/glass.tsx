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
import LinearGradient from 'react-native-linear-gradient';
import { colors, formatColors, gradients, radius, spacing } from '../theme';
import type { DiaryFormat } from '@ai-diary/shared';

/** 밤하늘 그라데이션 화면 배경. 모든 적응형 홈 화면을 감싼다. */
export function NightBackground({ children }: { children: ReactNode }) {
  return (
    <LinearGradient
      colors={gradients.night}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.night}
    >
      {children}
    </LinearGradient>
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

/** 라벤더 그라데이션 CTA 버튼(pill-cta). */
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
    <Pressable onPress={onPress} disabled={off} style={[off && { opacity: 0.5 }, style]}>
      <LinearGradient
        colors={gradients.lavCta}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cta}
      >
        {loading && (
          <ActivityIndicator size="small" color={colors.onLav} style={{ marginRight: 8 }} />
        )}
        <Text style={styles.ctaText}>{label}</Text>
        {trailing ? <Text style={styles.ctaTrailing}> {trailing}</Text> : null}
      </LinearGradient>
    </Pressable>
  );
}

/** 진행도 바(트랙 + 라벤더 fill). ratio 0~1. */
export function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={styles.progTrack}>
      <LinearGradient
        colors={[colors.lav, colors.lav2]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.progFill, { width: `${pct * 100}%` }]}
      />
    </View>
  );
}

const FORMAT_KEY: Record<DiaryFormat, keyof typeof formatColors> = {
  plain: 'plain',
  newspaper: 'newspaper',
  novel: 'novel',
};

/**
 * 포맷별 그라데이션 책 표지(정적 — 추후 3D 책으로 교체 예정).
 * 책등(왼쪽 세로선)·페이지(오른쪽 밝은 가장자리)로 책 느낌을 낸다.
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
      <LinearGradient
        colors={[c1, c2]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bookCover}
      >
        {/* 상단 광택 */}
        <LinearGradient
          colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.45 }}
          style={StyleSheet.absoluteFill}
        />
        {/* 책등 라인 */}
        <View style={[styles.bookSpine, { left: width * 0.16 }]} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  night: { flex: 1 },
  glass: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  glassStrong: { borderColor: colors.border2 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 15,
  },
  ctaText: { color: colors.onLav, fontSize: 15, fontWeight: '800' },
  ctaTrailing: { color: colors.onLav, fontSize: 17, fontWeight: '800' },
  progTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  progFill: { height: '100%', borderRadius: 99 },
  bookCover: {
    flex: 1,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 11,
    borderBottomRightRadius: 11,
    overflow: 'hidden',
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

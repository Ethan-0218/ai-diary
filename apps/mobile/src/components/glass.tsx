import React, { useId, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { BlurView } from '@react-native-community/blur';
import { colors, formatColors, radius, spacing } from '../theme';
import type { DiaryFormat } from '@ai-diary/shared';

/**
 * 그라데이션·발광은 react-native-svg로 그린다(웹 radial-gradient/linear-gradient 재현).
 * 웹의 backdrop-filter:blur(글라스 카드 뒤 흐림)는 RN 기본 미지원 → 반투명으로 근사.
 */

/** 밤하늘 배경 — 딥다크 베이스 + 상단 라벤더 발광(중심→투명 페이드). */
export function NightBackground({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const id = useId();
  return (
    <View style={styles.night}>
      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          {/* 프로토타입 body: radial(900x600 at 50% -10%, #2c2746 → transparent 60%) */}
          <RadialGradient id={`${id}g`} cx="50%" cy="0%" rx="90%" ry="58%">
            <Stop offset="0" stopColor="#2c2746" stopOpacity="1" />
            <Stop offset="0.6" stopColor="#2c2746" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${id}g)`} />
      </Svg>
      {children}
    </View>
  );
}

/** 글라스 카드 — BlurView로 카드 뒤 배경(라벤더 발광)을 흐려 진짜 글라스모피즘. */
export function GlassCard({
  children,
  style,
  strong,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 라벤더 틴트·보더를 한 단계 진하게(히어로/강조 카드). */
  strong?: boolean;
}) {
  return (
    <View style={[styles.glassWrap, strong && styles.glassWrapStrong, style]}>
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType="dark"
        blurAmount={14}
        reducedTransparencyFallbackColor="#16131f"
      />
      <View
        style={[StyleSheet.absoluteFill, strong ? styles.tintStrong : styles.tint]}
        pointerEvents="none"
      />
      <View style={styles.glassInner}>{children}</View>
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
 * 포맷별 그라데이션 책 표지(정적 — 추후 3D 책으로 교체 예정).
 * 표지 그라데이션(c1→c2) + 상단 광택 + 책등(왼쪽 세로선)·페이지(오른쪽).
 * 비대칭 모서리(책 모양)는 부모 View의 borderRadius+overflow로 svg를 클립한다.
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
  const id = useId();
  return (
    <View style={[{ width, height }, style]}>
      {/* 페이지(오른쪽 종이) — 표지 뒤로 살짝 보임 */}
      <View
        style={[
          styles.bookPages,
          { top: height * 0.1, bottom: -3, right: -3, left: width * 0.16 },
        ]}
      />
      {/* 표지(비대칭 모서리로 클립) */}
      <View style={styles.bookCover}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id={`${id}c`} x1="0.15" y1="0" x2="0.55" y2="1">
              <Stop offset="0" stopColor={c1} />
              <Stop offset="1" stopColor={c2} />
            </SvgLinearGradient>
            <SvgLinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
              <Stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill={`url(#${id}c)`} />
          <Rect x="0" y="0" width={width} height={height} fill={`url(#${id}g)`} />
        </Svg>
        {/* 책등 라인 */}
        <View style={[styles.bookSpine, { left: width * 0.16 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  night: { flex: 1, backgroundColor: '#08070d' },
  glassWrap: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  glassWrapStrong: { borderColor: colors.border2 },
  glassInner: { padding: spacing.lg },
  tint: { backgroundColor: 'rgba(255,255,255,0.05)' },
  tintStrong: { backgroundColor: 'rgba(169,156,242,0.12)' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 15,
    backgroundColor: colors.lav2,
    overflow: 'hidden',
  },
  ctaGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  ctaOff: { opacity: 0.5 },
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

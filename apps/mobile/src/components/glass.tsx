import React, { useId, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { BlurView } from '@react-native-community/blur';
import { colors, formatColors, spacing } from '../theme';
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
          {/* 프로토타입 body: radial(900x600 at 50% -10%, #2c2746 → transparent 60%).
              발광 반경을 화면 폭의 2배 이상으로 키워 상단 ~40%를 덮는다. */}
          <RadialGradient id={`${id}g`} cx="50%" cy="-8%" rx="210%" ry="80%">
            <Stop offset="0" stopColor="#3a3360" stopOpacity="1" />
            <Stop offset="0.35" stopColor="#2c2746" stopOpacity="0.85" />
            <Stop offset="0.62" stopColor="#2c2746" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${id}g)`} />
      </Svg>
      {children}
    </View>
  );
}

/**
 * 공통 화면 골격 — 상단 글라스 헤더 + 본문 스크롤 + (선택)하단 글라스 CTA.
 * - 헤더/CTA는 절대배치 글라스 바(스크롤에 딸려가지 않음), 본문만 스크롤.
 * - 글라스(blur+tint)는 **처음엔 투명**이고 **스크롤되면 페이드인**된다(iOS 네비바 패턴).
 * - 바 높이를 onLayout으로 측정해 본문 padding으로 확보(가려짐 방지).
 * - 하단 CTA는 키보드가 뜨면 함께 올라온다.
 */
export function GlassScaffold({
  header,
  footer,
  children,
  contentStyle,
}: {
  /** 헤더 바 안에 들어갈 내용(예: 뒤로가기/기어 행). */
  header: ReactNode;
  /** 하단 CTA 바 내용(없으면 바 미표시). */
  footer?: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(0);
  const [footerH, setFooterH] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  // 헤더: 스크롤 0→24 구간에서 글라스 0→1로 페이드(처음 투명 → 스크롤 시 frosted).
  const headerGlass = scrollY.interpolate({
    inputRange: [0, 24],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // 푸터: "뒤에 콘텐츠가 있을 때"만 글라스. 바닥까지 남은 거리로 판정 →
  // 콘텐츠가 푸터 뒤로 깔리면 frosted, 끝까지 스크롤(또는 콘텐츠가 짧음)하면 투명.
  const footerGlass = useRef(new Animated.Value(0)).current;
  const layoutH = useRef(0);
  const contentH = useRef(0);
  const updateFooterGlass = (offsetY: number) => {
    const distanceToBottom = contentH.current - layoutH.current - offsetY;
    footerGlass.setValue(Math.max(0, Math.min(1, distanceToBottom / 24)));
  };

  return (
    <NightBackground>
      <Animated.ScrollView
        style={styles.scaffFlex}
        contentContainerStyle={[
          styles.scaffContent,
          {
            paddingTop: headerH + spacing.sm,
            paddingBottom: (footer != null ? footerH : insets.bottom) + spacing.lg,
          },
          contentStyle,
        ]}
        scrollIndicatorInsets={{ top: headerH, bottom: footer != null ? footerH : 0 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onLayout={(e) => {
          layoutH.current = e.nativeEvent.layout.height;
          updateFooterGlass(0);
        }}
        onContentSizeChange={(_w, h) => {
          contentH.current = h;
          updateFooterGlass(0);
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const ne = e.nativeEvent;
              layoutH.current = ne.layoutMeasurement.height;
              contentH.current = ne.contentSize.height;
              updateFooterGlass(ne.contentOffset.y);
            },
          },
        )}
      >
        {children}
      </Animated.ScrollView>

      {/* 고정 글라스 헤더 */}
      <View
        style={[styles.scaffHeader, { paddingTop: insets.top + spacing.sm }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.scaffHeaderGlass, { opacity: headerGlass }]}
          pointerEvents="none"
        >
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType="dark"
            blurAmount={5}
            reducedTransparencyFallbackColor="#0c0a14"
          />
          <View style={[StyleSheet.absoluteFill, styles.scaffTint]} />
        </Animated.View>
        {header}
      </View>

      {/* 고정 글라스 하단 CTA */}
      {footer != null && (
        <KeyboardAvoidingView
          style={styles.scaffFooterKav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[styles.scaffFooter, { paddingBottom: insets.bottom || spacing.md }]}
            onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          >
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.scaffFooterGlass, { opacity: footerGlass }]}
              pointerEvents="none"
            >
              <BlurView
                style={StyleSheet.absoluteFill}
                blurType="dark"
                blurAmount={5}
                reducedTransparencyFallbackColor="#0c0a14"
              />
              <View style={[StyleSheet.absoluteFill, styles.scaffTint]} />
            </Animated.View>
            {footer}
          </View>
        </KeyboardAvoidingView>
      )}
    </NightBackground>
  );
}

/** 글라스 뒤로가기 버튼 — blur + 상단 하이라이트 + 발광 그림자 + 큰 chevron(‹). */
export function BackButton({ onPress }: { onPress: () => void }) {
  const id = useId();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.backShadow}>
      <View style={styles.backClip}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={8}
          reducedTransparencyFallbackColor="#1c182a"
        />
        <View style={[StyleSheet.absoluteFill, styles.backTint]} pointerEvents="none" />
        <Svg width={40} height={40} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id={`${id}bh`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
              <Stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width={40} height={40} fill={`url(#${id}bh)`} />
        </Svg>
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Path
            d="M15 5l-7 7 7 7"
            stroke={colors.text}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </Pressable>
  );
}

/**
 * 글라스 카드 — glassmorphism 4요소: blur + 표면 그라데이션(반사광) +
 * 상단 하이라이트(빛 모서리) + 발광 그림자(depth).
 * svg는 onLayout으로 측정한 실제 크기로 그린다(% 크기는 RN svg에서 불안정).
 */
export function GlassCard({
  children,
  style,
  strong,
  lavender,
  radius = 18,
  contentStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 보더를 한 단계 진하게(강조 카드). */
  strong?: boolean;
  /** 라벤더 틴트(135deg, 프로토타입 greet-hero). 미지정 시 중립 흰빛 반사. */
  lavender?: boolean;
  radius?: number;
  /** 내부 패딩 등 콘텐츠 래퍼 스타일. */
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const id = useId();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={[styles.cardShadow, { borderRadius: radius }, style]}>
      <View
        style={[
          styles.cardClip,
          { borderRadius: radius },
          strong && styles.cardClipStrong,
        ]}
        onLayout={(e) =>
          setSize({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
      >
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={6}
          reducedTransparencyFallbackColor="#16131f"
        />
        {size.w > 0 && (
          <Svg
            width={size.w}
            height={size.h}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              {/* 표면 — lavender는 프로토타입 greet-hero 그라데이션
                  linear-gradient(135deg, rgba(169,156,242,.26), rgba(120,108,200,.07)).
                  135deg = 좌상→우하(x1,y1=0 → x2,y2=1). 일반은 중립 흰빛 반사. */}
              <SvgLinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
                {lavender
                  ? [
                      <Stop key="a" offset="0" stopColor="#a99cf2" stopOpacity="0.26" />,
                      <Stop key="b" offset="1" stopColor="#786cc8" stopOpacity="0.07" />,
                    ]
                  : [
                      <Stop
                        key="a"
                        offset="0"
                        stopColor="#ffffff"
                        stopOpacity={strong ? 0.1 : 0.07}
                      />,
                      <Stop key="b" offset="0.5" stopColor="#ffffff" stopOpacity="0.015" />,
                      <Stop key="c" offset="1" stopColor="#ffffff" stopOpacity="0" />,
                    ]}
              </SvgLinearGradient>
              {/* 상단 하이라이트 — 위쪽 빛 모서리(은은하게) */}
              <SvgLinearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity="0.13" />
                <Stop offset="0.22" stopColor="#ffffff" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}s)`} />
            <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}h)`} />
          </Svg>
        )}
        <View style={[styles.cardPad, contentStyle]}>{children}</View>
      </View>
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
  const id = useId();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[styles.cta, off && styles.ctaOff, style]}
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {/* 부드러운 라벤더 그라데이션(밝은 위→연한 아래) + 은은한 상단 하이라이트.
          하드 경계 없이 자연스러운 광택. */}
      {size.w > 0 && (
        <Svg
          width={size.w}
          height={size.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <SvgLinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#C9BEFD" />
              <Stop offset="1" stopColor="#A99CF2" />
            </SvgLinearGradient>
            <SvgLinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.30" />
              <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.05" />
              <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}b)`} />
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}g)`} />
        </Svg>
      )}
      {loading && (
        <ActivityIndicator size="small" color={colors.onLav} style={styles.ctaSpin} />
      )}
      <Text style={styles.ctaText}>{label}</Text>
      {trailing ? <Text style={styles.ctaTrailing}> {trailing}</Text> : null}
    </Pressable>
  );
}

/**
 * 상단 safe-area(상태바) 글라스 스크림.
 * 헤더가 없는 스크롤 화면에서 콘텐츠가 위로 스크롤될 때 시계·배터리 영역과 겹쳐
 * 보이지 않도록, 상태바 높이만큼 상단을 덮는다. 탭은 통과(pointerEvents none).
 *
 * scrollY를 주면 **처음엔 투명, 스크롤되면 글라스가 페이드인**된다(GlassScaffold와 동일).
 * 안 주면 항상 켜진 글라스.
 */
export function TopScrim({
  height,
  scrollY,
}: {
  height: number;
  scrollY?: Animated.Value;
}) {
  if (height <= 0) return null;
  const opacity = scrollY
    ? scrollY.interpolate({
        inputRange: [0, 24],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      })
    : 1;
  return (
    <View style={[styles.topScrim, { height }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={16}
          reducedTransparencyFallbackColor="#0c0a14"
        />
        <View style={[StyleSheet.absoluteFill, styles.topScrimTint]} />
      </Animated.View>
    </View>
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

/** 책장 선반에 꽂힌 책등(정적 — 완성한 서재용, WebView 미사용). */
export function Spine({
  format,
  title,
  caption,
  onPress,
}: {
  format: DiaryFormat;
  title: string;
  caption?: string;
  onPress?: () => void;
}) {
  const { c1, c2 } = formatColors[FORMAT_KEY[format]];
  return (
    <Pressable onPress={onPress} style={[styles.spine, { backgroundColor: c1 }]}>
      {/* 좌측 하이라이트 / 우측 그림자 */}
      <View style={[styles.spineEdge, { backgroundColor: c2, opacity: 0.5 }]} pointerEvents="none" />
      <Text style={styles.spineTitle} numberOfLines={1}>
        {title}
      </Text>
      {caption ? <Text style={styles.spineCap}>{caption}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  night: { flex: 1, backgroundColor: '#08070d' },
  backShadow: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  backClip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTint: { backgroundColor: 'rgba(255,255,255,0.025)' },
  cardShadow: {
    shadowColor: '#7c6bd6',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 10,
  },
  cardClip: {
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cardClipStrong: { borderColor: colors.border2 },
  cardPad: { padding: spacing.lg },
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
  ctaOff: { opacity: 0.5 },
  ctaSpin: { marginRight: 8 },
  ctaText: { color: colors.onLav, fontSize: 15, fontWeight: '800' },
  ctaTrailing: { color: colors.onLav, fontSize: 17, fontWeight: '800' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  topScrimTint: { backgroundColor: 'rgba(10,8,16,0.45)' },
  // GlassScaffold
  scaffFlex: { flex: 1 },
  scaffContent: { paddingHorizontal: spacing.lg },
  scaffHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  scaffHeaderGlass: {
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scaffFooterKav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  scaffFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  scaffFooterGlass: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scaffTint: { backgroundColor: 'rgba(20,16,30,0.28)' },
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
  spine: {
    width: 38,
    height: 150,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spineEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 8,
  },
  spineTitle: {
    transform: [{ rotate: '90deg' }],
    width: 124,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(58,42,28,0.92)',
  },
  spineCap: {
    position: 'absolute',
    bottom: 7,
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(58,42,28,0.55)',
  },
});

import React, { useId } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '@react-native-community/blur';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { RootTabParamList } from '../navigation/types';
import { colors } from '../theme';

const ICON: Record<keyof RootTabParamList, string> = {
  Home: '☾',
  Shelf: '▤',
  Store: '＋',
  Profile: '◉',
};
const LABEL: Record<keyof RootTabParamList, string> = {
  Home: '오늘',
  Shelf: '책장',
  Store: '스토어',
  Profile: '나',
};

const SIDE = 14; // wrap 좌우 패딩
const BAR_H = 64;

/**
 * 프로토타입 floating 글라스 탭바.
 * blur + 어두운 틴트 + 상단 하이라이트(유리 모서리) + 발광 그림자(떠있음).
 */
export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const id = useId();
  const barW = width - SIDE * 2;
  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
      pointerEvents="box-none"
    >
      <View style={styles.barShadow}>
        <View style={styles.barClip}>
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType="dark"
            blurAmount={8}
            reducedTransparencyFallbackColor="#1c182a"
          />
          <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
          <Svg
            width={barW}
            height={BAR_H}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              {/* 상단 하이라이트 — 유리 모서리 빛 */}
              <SvgLinearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity="0.08" />
                <Stop offset="0.4" stopColor="#ffffff" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width={barW} height={BAR_H} fill={`url(#${id}h)`} />
          </Svg>
          {state.routes.map((route, i) => {
            const name = route.name as keyof RootTabParamList;
            const focused = state.index === i;
            return (
              <Pressable
                key={route.key}
                style={styles.tab}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              >
                <Text style={[styles.icon, focused && styles.iconOn]}>
                  {ICON[name]}
                </Text>
                <Text style={[styles.label, focused && styles.labelOn]}>
                  {LABEL[name]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIDE,
  },
  barShadow: {
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 18,
  },
  barClip: {
    height: BAR_H,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tint: { backgroundColor: 'rgba(28,24,42,0.3)' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  icon: { fontSize: 18, color: colors.muted },
  iconOn: { color: colors.lav2 },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.muted },
  labelOn: { color: colors.lav2 },
});

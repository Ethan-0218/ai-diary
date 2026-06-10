import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '@react-native-community/blur';
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

/** 프로토타입 floating 글라스 탭바. 화면 위에 떠 있고, 각 화면은 paddingBottom으로 여백 확보. */
export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={22}
          reducedTransparencyFallbackColor="#1c182a"
        />
        <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
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
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
  },
  bar: {
    height: 64,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tint: { backgroundColor: 'rgba(28,24,42,0.55)' },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  icon: { fontSize: 18, color: colors.muted },
  iconOn: { color: colors.lav2 },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.muted },
  labelOn: { color: colors.lav2 },
});

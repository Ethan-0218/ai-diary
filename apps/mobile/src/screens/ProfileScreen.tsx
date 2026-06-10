import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { GlassCard, NightBackground } from '../components/glass';
import { colors, radius, spacing } from '../theme';
import type { TabScreenProps } from '../navigation/types';

export function ProfileScreen(_props: TabScreenProps<'Profile'>) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  return (
    <NightBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg },
        ]}
      >
        <Text style={styles.title}>나</Text>

        <GlassCard strong radius={20} contentStyle={styles.cardRow}>
          <View style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name ?? '일기 쓰는 사람'}</Text>
            {!!user?.email && <Text style={styles.email}>{user.email}</Text>}
          </View>
        </GlassCard>

        <Pressable style={styles.logout} onPress={() => signOut()}>
          <Text style={styles.logoutTxt}>로그아웃</Text>
        </Pressable>
      </ScrollView>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 110 },
  title: {
    fontSize: 27,
    fontWeight: '800',
    color: '#f4f0ff',
    letterSpacing: -0.5,
    marginBottom: spacing.lg,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#7e72b8',
    borderWidth: 1,
    borderColor: colors.border2,
  },
  name: { fontSize: 18, fontWeight: '700', color: '#f0ecfb' },
  email: { fontSize: 13, color: colors.textSoft, marginTop: 3 },
  logout: {
    marginTop: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
  },
  logoutTxt: { color: colors.danger, fontWeight: '700', fontSize: 15 },
});

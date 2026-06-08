import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  appleAuth,
  AppleButton,
} from '@invertase/react-native-apple-authentication';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { colors } from '../theme';

export function LoginScreen() {
  const { signInWithApple, devLogin } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, label: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      // 사용자가 취소한 경우는 조용히 무시
      if (e?.code !== appleAuth.Error.CANCELED) {
        Alert.alert(`${label} 실패`, e?.message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>AI 일기</Text>
        <Text style={styles.subtitle}>
          매일 친구한테 수다 떨면,{'\n'}그게 다시 보고 싶은 내 일기가 됩니다.
        </Text>
      </View>

      <View style={styles.actions}>
        {appleAuth.isSupported && (
          <AppleButton
            buttonStyle={AppleButton.Style.BLACK}
            buttonType={AppleButton.Type.SIGN_IN}
            style={styles.appleButton}
            onPress={() => run(signInWithApple, 'Apple 로그인')}
          />
        )}

        {__DEV__ && (
          <View style={{ marginTop: 16 }}>
            <Button
              label="개발용 로그인 (dev-login)"
              onPress={() => run(devLogin, '개발 로그인')}
              disabled={busy}
            />
            <Text style={styles.devNote}>
              Apple 콘솔 셋업 전 코어 루프 검증용. 릴리스 빌드에선 숨겨집니다.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  hero: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '800', color: colors.text, marginBottom: 12 },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.muted },
  actions: { paddingBottom: 40 },
  appleButton: { width: '100%', height: 50 },
  devNote: { fontSize: 12, color: colors.muted, marginTop: 8, textAlign: 'center' },
});

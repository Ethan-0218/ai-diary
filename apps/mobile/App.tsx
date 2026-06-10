/**
 * AI 일기 — 앱 루트.
 * 인증 게이트(AuthContext) → 미인증=Login / 인증=코어 스택(Home→Chat→Diary).
 *
 * @format
 */
import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import type { RootStackParamList } from './src/navigation/types';
import { colors } from './src/theme';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { NotebookDetailScreen } from './src/screens/NotebookDetailScreen';
import { StoreScreen } from './src/screens/StoreScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { DiaryScreen } from './src/screens/DiaryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {status === 'guest' ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'AI 일기' }}
          />
          <Stack.Screen
            name="Shelf"
            component={ShelfScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="NotebookDetail"
            component={NotebookDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Store"
            component={StoreScreen}
            options={{ title: '일기장 스토어' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ title: '오늘 이야기' }}
          />
          <Stack.Screen
            name="Diary"
            component={DiaryScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});

export default App;

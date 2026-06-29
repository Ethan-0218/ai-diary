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
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import type {
  RootStackParamList,
  RootTabParamList,
} from './src/navigation/types';
import { colors } from './src/theme';
import { GlassTabBar } from './src/components/GlassTabBar';
import { LocationPrimingModal } from './src/components/LocationPrimingModal';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { NotebookDetailScreen } from './src/screens/NotebookDetailScreen';
import { StoreScreen } from './src/screens/StoreScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { DiaryScreen } from './src/screens/DiaryScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shelf" component={ShelfScreen} />
      <Tab.Screen name="Store" component={StoreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

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
    <RootStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerShown: false,
      }}
    >
      {status === 'guest' ? (
        <RootStack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <RootStack.Screen name="Main" component={MainTabs} />
          <RootStack.Screen name="NotebookDetail" component={NotebookDetailScreen} />
          <RootStack.Screen name="Chat" component={ChatScreen} />
          <RootStack.Screen name="Diary" component={DiaryScreen} />
        </>
      )}
    </RootStack.Navigator>
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
      <LocationPrimingModal />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});

export default App;

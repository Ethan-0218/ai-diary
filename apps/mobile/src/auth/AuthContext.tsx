import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { authApi, setAuthToken, type AuthUser } from '../lib/api';
import { setUnauthorizedHandler } from '../lib/errors';

const TOKEN_KEY = 'aidiary.accessToken';
const USER_KEY = 'aidiary.user';

type Status = 'loading' | 'authed' | 'guest';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  signInWithApple: () => Promise<void>;
  devLogin: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  // 앱 시작 시 저장된 토큰 복원
  useEffect(() => {
    (async () => {
      try {
        const [token, rawUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (token) {
          setAuthToken(token);
          setUser(rawUser ? JSON.parse(rawUser) : null);
          setStatus('authed');
          return;
        }
      } catch {
        // 복원 실패 시 게스트로 시작
      }
      setStatus('guest');
    })();
  }, []);

  const persist = async (token: string, u: AuthUser) => {
    setAuthToken(token);
    setUser(u);
    setStatus('authed');
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(u)],
    ]);
  };

  const signInWithApple = async () => {
    const resp = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    });
    const identityToken = resp.identityToken;
    if (!identityToken) throw new Error('Apple 로그인 토큰을 받지 못했어요.');
    const result = await authApi.socialLogin('apple', identityToken);
    await persist(result.accessToken, result.user);
  };

  // 개발용 — Apple 콘솔 셋업 전 코어 루프를 기기에서 검증하기 위한 escape hatch.
  const devLogin = async () => {
    const result = await authApi.devLogin();
    await persist(result.accessToken, result.user);
  };

  const signOut = async () => {
    setAuthToken(null);
    setUser(null);
    setStatus('guest');
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  };

  // API 레이어가 401(토큰 만료)을 만나면 자동 로그아웃하도록 핸들러 등록.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signInWithApple, devLogin, signOut }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

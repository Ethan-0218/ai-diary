import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { reconcileReminders } from '../lib/notifications';

/**
 * 앱 루트에 1회 마운트. 로그인 상태에서 앱 시작·포그라운드 복귀 때 리마인더를
 * 현재 일기장 상태에 맞춰 재동기화한다(권한 없으면 내부에서 no-op).
 */
export function ReminderReconciler() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'authed') return;
    void reconcileReminders();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reconcileReminders();
    });
    return () => sub.remove();
  }, [status]);

  return null;
}

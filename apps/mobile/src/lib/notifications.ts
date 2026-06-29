import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AuthorizationStatus,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';
import type { HomeSummaryDto, NotebookDto } from '@ai-diary/shared';
import { api } from './api';
import { presentNotificationPriming } from './notificationPriming';

/**
 * 일기장별 로컬 리마인더 스케줄러.
 *
 * 일자별 메시지를 다르게(오늘 작성 여부) 보내야 하므로 "매일 반복" 트리거 대신
 * **일자별 one-shot TIMESTAMP 알림의 롤링 윈도우**로 모델링한다.
 * id = `aidiary.reminder.<notebookId>.<YYYY-MM-DD>` — 특정 일자/일기장 단위로
 * 취소·교체·열거가 가능하다. iOS 64개 보류 한도를 동적 윈도우로 관리한다.
 */

const PERMISSION_HANDLED_KEY = 'aidiary.notifications.permissionHandled';
const ID_PREFIX = 'aidiary.reminder.';
const ANDROID_CHANNEL = 'reminders';
const MAX_PENDING = 60; // iOS 64 한도 여유
const MAX_WINDOW = 7; // 일기장당 최대 예약 일수

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function reminderId(notebookId: string, ymd: string): string {
  return `${ID_PREFIX}${notebookId}.${ymd}`;
}

// notebookId(uuid)엔 '.'이 없고 ymd만 'YYYY-MM-DD'라 마지막 '.' 기준 분리.
function parseReminderId(id: string): { notebookId: string; ymd: string } | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  const rest = id.slice(ID_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot < 0) return null;
  return { notebookId: rest.slice(0, dot), ymd: rest.slice(dot + 1) };
}

// ─── 권한 ───

type PermStatus = 'authorized' | 'denied' | 'notDetermined';

function mapStatus(s: number): PermStatus {
  if (s === AuthorizationStatus.AUTHORIZED || s === AuthorizationStatus.PROVISIONAL)
    return 'authorized';
  if (s === AuthorizationStatus.DENIED) return 'denied';
  return 'notDetermined';
}

export async function getNotificationPermission(): Promise<PermStatus> {
  const s = await notifee.getNotificationSettings();
  return mapStatus(s.authorizationStatus);
}

/**
 * 권한을 확보한다. 미결정이면 사전 안내 모달 → 시스템 요청.
 * 반환 true = 예약 가능, false = 거부/미허용(설정 화면에서 안내).
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const status = await getNotificationPermission();
  if (status === 'authorized') return true;
  if (status === 'denied') return false; // 이미 거부 — 기기 설정에서 켜야 함

  const handled = await AsyncStorage.getItem(PERMISSION_HANDLED_KEY);
  if (!handled) {
    const proceed = await presentNotificationPriming();
    if (!proceed) return false;
    await AsyncStorage.setItem(PERMISSION_HANDLED_KEY, '1');
  }
  const res = await notifee.requestPermission();
  return mapStatus(res.authorizationStatus) === 'authorized';
}

// ─── 메시지 ───

function messageFor(
  notebook: NotebookDto,
  written: boolean,
): { title: string; body: string } {
  if (written) {
    return {
      title: '오늘 일기, 잘 남겼어요 ✨',
      body: `'${notebook.title}'에 오늘을 기록했어요. 내일도 가볍게 만나요.`,
    };
  }
  return {
    title: '오늘 하루, 어땠어요?',
    body: `'${notebook.title}'에 오늘을 남겨볼까요? 탭해서 쓰러 가기`,
  };
}

// ─── 스케줄링 ───

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({ id: ANDROID_CHANNEL, name: '일기 리마인더' });
}

function fireDate(ymd: string, time: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

async function scheduleOne(
  id: string,
  notebook: NotebookDto,
  when: Date,
  written: boolean,
): Promise<void> {
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: when.getTime(),
  };
  const { title, body } = messageFor(notebook, written);
  await notifee.createTriggerNotification(
    {
      id,
      title,
      body,
      data: { notebookId: notebook.id },
      ios: { sound: 'default' },
      android: { channelId: ANDROID_CHANNEL, pressAction: { id: 'default' } },
    },
    trigger,
  );
}

function collectWrittenToday(home: HomeSummaryDto): Set<string> {
  const s = new Set<string>();
  for (const f of home.firm) {
    if (f.todaySlotState === 'filled') s.add(f.notebook.id);
  }
  if (home.todayDiary) s.add(home.todayDiary.notebookId);
  return s;
}

let inflight: Promise<void> | null = null;

/**
 * 모든 활성 일기장의 리마인더를 현재 상태에 맞춰 재동기화한다.
 * 권한이 있을 때만 동작하며(시작 시 프롬프트 없음), 중복 실행은 락으로 막는다.
 * 앱 시작·포그라운드 복귀·설정 변경·일기 작성 후에 호출.
 */
export function reconcileReminders(): Promise<void> {
  if (inflight) return inflight;
  inflight = doReconcile()
    .catch(() => {
      // 베스트에포트 — notifee/네트워크 실패가 호출부로 새어 나가지 않게 한다.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function doReconcile(): Promise<void> {
  if ((await getNotificationPermission()) !== 'authorized') return;
  await ensureAndroidChannel();

  let notebooks: NotebookDto[];
  let writtenToday: Set<string>;
  try {
    notebooks = await api.listNotebooks();
    writtenToday = collectWrittenToday(await api.getHomeSummary());
  } catch {
    return; // 네트워크 실패 — 다음 기회에
  }

  const active = notebooks.filter(
    (n) => n.status === 'active' && n.reminderEnabled,
  );
  const activeIds = new Set(active.map((n) => n.id));

  const now = Date.now();
  const N = Math.max(
    1,
    Math.min(MAX_WINDOW, Math.floor(MAX_PENDING / Math.max(1, active.length))),
  );

  // 향후 N개 캘린더 일자(오늘부터)
  const dates: { ymd: string; isToday: boolean }[] = [];
  const base = new Date();
  for (let i = 0; i < N; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    dates.push({ ymd: ymdOf(d), isToday: i === 0 });
  }

  // 원하는 알림 집합 계산(이미 지난 시각은 제외)
  const desired = new Map<
    string,
    { notebook: NotebookDto; when: Date; written: boolean }
  >();
  for (const nb of active) {
    for (const { ymd, isToday } of dates) {
      const when = fireDate(ymd, nb.reminderTime);
      if (when.getTime() <= now) continue; // 지난 시각(오늘 이미 지난 등) 스킵
      desired.set(reminderId(nb.id, ymd), {
        notebook: nb,
        when,
        written: isToday && writtenToday.has(nb.id),
      });
    }
  }

  // 기존 우리 알림 열거 → 원하지 않는/비활성 일기장 것 취소
  const pending = (await notifee.getTriggerNotificationIds()).filter((id) =>
    id.startsWith(ID_PREFIX),
  );
  const toCancel = pending.filter((id) => {
    const p = parseReminderId(id);
    return !p || !activeIds.has(p.notebookId) || !desired.has(id);
  });
  await Promise.all(toCancel.map((id) => notifee.cancelTriggerNotification(id)));

  // 원하는 알림 예약/교체(같은 id면 덮어써져 오늘 변형도 반영)
  for (const [id, d] of desired) {
    await scheduleOne(id, d.notebook, d.when, d.written);
  }
}

/** 특정 일기장의 모든 보류 리마인더 취소(토글 OFF 시 즉시 반영용). */
export async function cancelNotebookReminders(notebookId: string): Promise<void> {
  const pending = await notifee.getTriggerNotificationIds();
  const mine = pending.filter((id) => {
    const p = parseReminderId(id);
    return p?.notebookId === notebookId;
  });
  await Promise.all(mine.map((id) => notifee.cancelTriggerNotification(id)));
}

import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** 바텀탭 — 오늘(홈)/책장/스토어/나 */
export type RootTabParamList = {
  Home: undefined;
  Shelf: undefined;
  Store: undefined;
  Profile: undefined;
};

/** 루트 스택 — 탭(Main) 위로 푸시되는 풀스크린(상세/대화/일기) */
export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<RootTabParamList> | undefined;
  NotebookDetail: { notebookId: string };
  NotebookSettings: { notebookId: string; fromPurchase?: boolean };
  Chat: { conversationId: string };
  Diary: { conversationId: string };
};

/** 탭 화면 props — 탭 + 부모 스택 navigate 모두 가능 */
export type TabScreenProps<T extends keyof RootTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<RootTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

/** 스택 화면 props(상세/대화/일기) */
export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

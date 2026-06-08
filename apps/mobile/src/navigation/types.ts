import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** 코어 스택 라우트 — web 3화면(Home/Chat/Diary)에 1:1 대응 */
export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Chat: { conversationId: string };
  Diary: { conversationId: string };
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

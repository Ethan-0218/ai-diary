/**
 * AI 일기 mobile — S2 연동 검증용 임시 화면.
 * @ai-diary/shared(웹/백엔드와 공유)를 import해서 모노레포 연결을 확인한다.
 *
 * @format
 */

import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, useColorScheme } from 'react-native';
import { DIARY_FORMAT_LIST, MODEL_OPTIONS } from '@ai-diary/shared';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>AI 일기 — 모노레포 연동 OK</Text>
        <Text style={styles.subtitle}>@ai-diary/shared 를 mobile에서 import</Text>

        <Text style={styles.section}>일기 형식 ({DIARY_FORMAT_LIST.length})</Text>
        {DIARY_FORMAT_LIST.map(f => (
          <Text key={f.id} style={styles.item}>• {f.id} — {f.label}</Text>
        ))}

        <Text style={styles.section}>모델 옵션 ({MODEL_OPTIONS.length})</Text>
        {MODEL_OPTIONS.map(m => (
          <Text key={m.id} style={styles.item}>• {m.id}</Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 6 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 4 },
  item: { fontSize: 15, color: '#222' },
});

export default App;

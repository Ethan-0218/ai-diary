import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { DiaryFormat } from '@ai-diary/shared';
import { BOOK3D_HTML } from './book3d-html';

/** 우리 포맷 → webview-book.html PRESETS 키 */
const COLOR: Record<DiaryFormat, string> = {
  plain: 'plain',
  newspaper: 'news',
  novel: 'novel',
};

/**
 * Three.js 3D 일기장 — docs/prototype/webview-book.html을 WebView로 띄운다.
 * html이 {type:'ready'}를 보내면 setBook(제목/부제/색)을 주입하고, 책 탭 시 onTap.
 * (three.js 0.160은 html 내 CDN importmap으로 로드 → 인터넷 필요)
 */
export function Book3D({
  format,
  title,
  sub,
  width,
  onTap,
}: {
  format: DiaryFormat;
  title: string;
  sub?: string;
  width: number;
  onTap?: () => void;
}) {
  const ref = useRef<WebView>(null);
  const payload = JSON.stringify({ title, sub: sub ?? '', color: COLOR[format] });
  const setBook = `window.setBook && window.setBook(${payload}); true;`;
  return (
    <View
      style={{ width, height: width * 1.32 }}
      pointerEvents={onTap ? 'auto' : 'none'}
    >
      <WebView
        ref={ref}
        source={{ html: BOOK3D_HTML, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // 다크 배경 위에 투명하게 얹는다.
        style={styles.web}
        containerStyle={styles.web}
        onMessage={(e: WebViewMessageEvent) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.type === 'ready') ref.current?.injectJavaScript(setBook);
            if (d.type === 'tap') onTap?.();
          } catch {
            /* 무시 */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});

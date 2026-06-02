import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AI 일기',
  description: 'AI가 대화를 통해 일기를 대신 써주는 PoC',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

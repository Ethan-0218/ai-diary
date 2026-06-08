/**
 * @format
 */

// ⚠️ App import보다 먼저 — 스트리밍 fetch/스트림/인코딩 전역 폴리필을 설치한다.
import './src/lib/streaming-polyfill';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

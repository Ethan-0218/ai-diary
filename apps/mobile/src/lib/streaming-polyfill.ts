/**
 * 스트리밍 fetch 폴리필 — `@ai-sdk/react` useChat이 RN에서 동작하려면 필요.
 *
 * RN의 기본 fetch는 응답 본문을 ReadableStream으로 노출하지 않아(`response.body.getReader()`
 * 미지원) AI SDK의 UI message stream을 읽지 못한다. 아래 폴리필로 fetch/스트림/인코딩을
 * 교체하고, react-native-fetch-api의 `textStreaming` 플래그를 켜 스트리밍 응답을 활성화한다.
 *
 * ⚠️ index.js 최상단에서 App import보다 **먼저** import 해야 한다(전역 교체이므로).
 */
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';

// URL / URLSearchParams (AI SDK가 URL 파싱에 사용)
import 'react-native-url-polyfill/auto';

// structuredClone
import structuredClonePolyfill from '@ungap/structured-clone';
if (typeof (globalThis as any).structuredClone === 'undefined') {
  polyfillGlobal('structuredClone', () => structuredClonePolyfill as any);
}

// TextEncoder / TextDecoder
import { TextEncoder, TextDecoder } from 'text-encoding';
polyfillGlobal('TextEncoder', () => TextEncoder as any);
polyfillGlobal('TextDecoder', () => TextDecoder as any);

// btoa / atob
import { encode as btoaPolyfill, decode as atobPolyfill } from 'base-64';
polyfillGlobal('btoa', () => btoaPolyfill);
polyfillGlobal('atob', () => atobPolyfill);

// Streams (web-streams-polyfill v4: 루트에서 export)
// AI SDK의 SSE 파서가 `class EventSourceParserStream extends TransformStream`라
// ReadableStream뿐 아니라 TransformStream/WritableStream도 전역에 있어야 한다.
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'web-streams-polyfill';
import {
  TextEncoderStream,
  TextDecoderStream,
} from '@stardazed/streams-text-encoding';
polyfillGlobal('ReadableStream', () => ReadableStream as any);
polyfillGlobal('TransformStream', () => TransformStream as any);
polyfillGlobal('WritableStream', () => WritableStream as any);
polyfillGlobal('TextEncoderStream', () => TextEncoderStream as any);
polyfillGlobal('TextDecoderStream', () => TextDecoderStream as any);

// fetch — react-native-fetch-api로 교체하고 텍스트 스트리밍을 켠다.
import {
  fetch as fetchPolyfill,
  Headers as HeadersPolyfill,
  Request as RequestPolyfill,
  Response as ResponsePolyfill,
} from 'react-native-fetch-api';
polyfillGlobal(
  'fetch',
  () =>
    (input: any, init?: any) =>
      fetchPolyfill(input, {
        ...(init ?? {}),
        reactNative: { textStreaming: true },
      }),
);
polyfillGlobal('Headers', () => HeadersPolyfill as any);
polyfillGlobal('Request', () => RequestPolyfill as any);
polyfillGlobal('Response', () => ResponsePolyfill as any);

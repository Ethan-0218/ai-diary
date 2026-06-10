// docs/prototype/webview-book.html을 three.js 인라인 번들로 변환해
// src/components/book3d-html.ts(외부 의존 0 = 오프라인 동작)를 생성한다.
//
//   node scripts/build-book3d.mjs
//
// - <script type="module">(three import) → esbuild로 three+addons 포함 IIFE 번들 인라인
// - importmap(CDN) 제거, pretendard 폰트 link 제거(시스템 -apple-system fallback)
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../../docs/prototype/webview-book.html');
const OUT = resolve(here, '../src/components/book3d-html.ts');
const TMP = resolve(here, '.book3d-entry.mjs');

const html = readFileSync(SRC, 'utf8');

// 1) module 스크립트 추출 → addons 경로를 실제 패키지 경로로 치환
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error('module script를 찾지 못했습니다');
const entry = m[1].replace(/three\/addons\//g, 'three/examples/jsm/');
writeFileSync(TMP, entry);

// 2) esbuild로 three 포함 단일 ESM 번들(원래 type="module" 동작 보존 — top-level await 등)
const res = await build({
  entryPoints: [TMP],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  legalComments: 'none',
  target: ['safari15'],
});
const bundleJs = res.outputFiles[0].text;

// 3) html 재조립: importmap·폰트 link 제거, module script → 번들 inline(type="module" 유지)
const out = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(/<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr[^>]*>\s*/, '')
  // replacement를 함수로 — bundleJs의 `$&`/`$$` 등이 replace 특수 패턴으로
  // 해석돼 원본(import 'three')이 도로 끼어드는 것을 막는다.
  .replace(
    /<script type="module">[\s\S]*?<\/script>/,
    () => `<script type="module">\n${bundleJs}\n</script>`,
  );

// 실제 외부 리소스 로드만 검사(번들 내부 문자열 URL은 네트워크 요청이 아니므로 무시).
const loaders =
  /cdn\.jsdelivr|<script\s+type="importmap"|<script[^>]+\bsrc="https?:|<link[^>]+href="https?:/i;
if (loaders.test(out)) {
  throw new Error('외부 리소스 로드가 남아있습니다(오프라인 불가)');
}

// 4) ts 문자열로(백틱/${ 이스케이프)
const esc = out.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  '// 자동 생성: webview-book.html + three.js 인라인 번들(외부 의존 0).\n' +
    '// 재생성: node scripts/build-book3d.mjs\n/* eslint-disable */\n' +
    'export const BOOK3D_HTML = `' + esc + '`;\n',
);

console.log(`완료: ${(out.length / 1024).toFixed(0)}KB html (외부 URL 0) → ${OUT}`);

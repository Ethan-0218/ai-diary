/**
 * 디자인 토큰 — "달빛 글라스 (Moonlit Glass)".
 * docs/prototype/prototype.html의 :root CSS 변수를 RN 값으로 옮긴 것.
 * 밤하늘 그라데이션 · 라벤더 발광 · 글라스모피즘 · 포맷별 인격색.
 *
 * 기존 화면(Chat/Diary/Store/Login)이 쓰던 키(bg/card/border/text/muted/
 * accent/accentSoft/white/danger…)는 다크 팔레트로 매핑해 자동으로 다크 톤이
 * 되도록 유지한다(점진 마이그레이션). 신규 코드는 lav/glass/textSoft 등 신규 토큰 사용.
 */
export const colors = {
  // 텍스트
  heading: '#F4F0FF', // 제목·강조(가장 밝은 흰보라)
  text: '#F2F0FA', // 본문
  textSoft: '#A7A1C2', // 부제·보조
  muted: '#6E6986', // 캡션·placeholder

  // 라벤더(브랜드 액센트)
  lav: '#A99CF2',
  lav2: '#C7BCFC',
  lavSoft: 'rgba(169,156,242,0.16)',
  onLav: '#1C1630', // 라벤더 위 텍스트(어두운 보라)

  // 글라스 표면 / 보더 (다크 배경 위 반투명 — blur 없이 근사)
  glass: 'rgba(255,255,255,0.055)',
  glass2: 'rgba(255,255,255,0.085)',
  border: 'rgba(255,255,255,0.10)',
  border2: 'rgba(255,255,255,0.17)',

  // 밤하늘 배경
  bg: '#08070d',
  bgTop: '#2a2542',
  bgMid: '#16131f',
  bgBottom: '#0b0a11',

  // 위험
  danger: '#ff8a8a',
  dangerBg: 'rgba(192,57,43,0.16)',
  dangerBorder: 'rgba(240,120,120,0.4)',

  // 레거시 호환(기존 화면이 참조) — 신규 코드는 위 토큰 사용
  card: 'rgba(255,255,255,0.055)',
  accent: '#A99CF2',
  accentSoft: 'rgba(169,156,242,0.16)',
  white: '#ffffff',
};

/** 포맷 = 일기장 인격. 일반만 웜(피치)으로 감정홈 강조, 나머지는 쿨톤. */
export const formatColors: Record<
  'plain' | 'newspaper' | 'novel',
  { c1: string; c2: string }
> = {
  plain: { c1: '#F6AE94', c2: '#E08C70' }, // 친구(피치코랄)
  newspaper: { c1: '#9EC7EC', c2: '#6FA1CE' }, // 리포터(스카이)
  novel: { c1: '#C8A8EE', c2: '#9E79D2' }, // 소설가(라일락)
};

export const radius = {
  card: 18,
  bubble: 16,
  control: 14,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

/**
 * 타이포 스케일 — 크기·굵기·자간만(색은 colors와 조합).
 * 사용: style={[type.h2, { color: colors.heading }]}
 */
export const type = {
  /** 홈 날짜 등 가장 큰 디스플레이 */
  display: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  /** 화면 제목 */
  h1: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  /** 카드/섹션 큰 제목 */
  h2: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  /** 카드 제목·항목 제목 */
  title: { fontSize: 16, fontWeight: '700' },
  /** 강조 본문(히어로 메시지 등) */
  bodyLg: { fontSize: 16.5, lineHeight: 25, fontWeight: '500' },
  /** 기본 본문 */
  body: { fontSize: 15, lineHeight: 22 },
  /** 부제·메타 */
  sub: { fontSize: 13 },
  /** 캡션 */
  caption: { fontSize: 12 },
  /** 섹션 라벨·버튼 라벨 */
  label: { fontSize: 13, fontWeight: '700' },
} as const;

/** 그라데이션 헬퍼 — LinearGradient colors prop에 전달. */
export const gradients = {
  /** 라벤더 CTA(밝→연) */
  lavCta: ['#C7BCFC', '#A99CF2'],
  /** 밤하늘 화면 배경(위→아래) */
  night: ['#2a2542', '#16131f', '#0b0a11'],
};

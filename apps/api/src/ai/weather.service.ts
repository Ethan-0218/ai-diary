import { Injectable, Logger } from '@nestjs/common';

/**
 * 현재 위치(위경도) 기반 실시간 날씨 조회.
 * Open-Meteo(현재 날씨) + BigDataCloud(역지오코딩) — 둘 다 API 키가 필요 없다.
 * 실패하면 null을 반환해 대화는 날씨 없이 진행한다(환각 금지).
 *
 * ⚠️ [PRODUCTION TODO] 지금은 PoC라 무료·무인증 엔드포인트를 서버에서 직접 호출한다.
 * 프로덕션 개발 시작 시 아래를 반드시 재검토할 것:
 *
 * 1) Open-Meteo (fetchWeather)
 *    - 무료는 '비영리'에 한함. 상업적 사용은 유료 플랜(API 키)으로 전환 필요.
 *      https://open-meteo.com/en/pricing  (commercial: api key + customer-api 도메인)
 *    - 무료 한도: ~10,000 calls/day. 대화 생성당 1회라 PoC엔 충분하나, 트래픽 증가 시 한도/요금 확인.
 *    - 출처 표기 권장: "Weather data by Open-Meteo.com" (CC BY 4.0).
 *
 * 2) BigDataCloud reverse-geocode-client (fetchPlaceName)
 *    - 이 엔드포인트는 원래 '브라우저(클라이언트)에서 직접 호출'하라고 만든 무인증 API다.
 *      현재는 서버에서 호출 중 → 트래픽이 늘면 차단/한도 위험.
 *    - 선택지: (a) 역지오코딩을 프론트로 이동해 좌표+지명을 백엔드로 전달,
 *      (b) 인증형 제공자(BigDataCloud 유료 / Google / Mapbox 등)로 교체.
 *    - 지명은 "흐림, 27°C"에 동네명을 붙이는 부가 정보일 뿐 → 부담되면 지명 제거하고 날씨만 사용해도 됨.
 *
 * 3) 공통: 외부 API 타임아웃/실패는 이미 null 처리되어 대화는 정상 진행된다(현 동작 유지).
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  async getWeatherNote(lat: number, lon: number): Promise<string | null> {
    try {
      const [weather, place] = await Promise.all([
        this.fetchWeather(lat, lon),
        this.fetchPlaceName(lat, lon),
      ]);
      if (!weather) return null;
      const { temp, desc, isDay } = weather;
      const head = place ? `${place} · ` : '';
      const dayPart = isDay ? '낮' : '밤';
      return `${head}${desc}, ${Math.round(temp)}°C (${dayPart})`;
    } catch (e) {
      this.logger.warn(`weather lookup failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async fetchWeather(
    lat: number,
    lon: number,
  ): Promise<{ temp: number; desc: string; isDay: boolean } | null> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return null;
    const json: any = await res.json();
    const cur = json?.current;
    if (!cur) return null;
    return {
      temp: Number(cur.temperature_2m),
      desc: wmoToKorean(Number(cur.weather_code)),
      isDay: Number(cur.is_day) === 1,
    };
  }

  private async fetchPlaceName(lat: number, lon: number): Promise<string | null> {
    try {
      const url =
        `https://api.bigdatacloud.net/data/reverse-geocode-client` +
        `?latitude=${lat}&longitude=${lon}&localityLanguage=ko`;
      const res = await fetchWithTimeout(url, 6000);
      if (!res.ok) return null;
      const json: any = await res.json();
      // 동네 우선, 없으면 시/구
      const parts = [json?.principalSubdivision, json?.locality || json?.city].filter(
        (s) => s && String(s).trim(),
      );
      return parts.length ? parts.join(' ') : null;
    } catch {
      return null;
    }
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** WMO weather interpretation code → 한국어 설명 */
function wmoToKorean(code: number): string {
  if (code === 0) return '맑음';
  if (code === 1) return '대체로 맑음';
  if (code === 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if (code >= 51 && code <= 57) return '이슬비';
  if (code >= 61 && code <= 67) return '비';
  if (code >= 71 && code <= 77) return '눈';
  if (code >= 80 && code <= 82) return '소나기';
  if (code === 85 || code === 86) return '소나기성 눈';
  if (code === 95) return '뇌우';
  if (code === 96 || code === 99) return '우박 동반 뇌우';
  return '알 수 없는 날씨';
}

import { WeatherService } from './weather.service';

function res(ok: boolean, body?: any) {
  return { ok, json: async () => body };
}

describe('WeatherService', () => {
  let service: WeatherService;

  beforeEach(() => {
    service = new WeatherService();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** open-meteo / bigdatacloud URL에 따라 다른 응답을 주는 fetch 목 */
  function mockFetch(weather: any, place: any) {
    global.fetch = jest.fn((url: any) =>
      Promise.resolve(String(url).includes('open-meteo') ? weather : place),
    ) as any;
  }

  it('날씨+지명 모두 있으면 한 줄로 조합 (낮)', async () => {
    mockFetch(
      res(true, { current: { temperature_2m: 26.4, weather_code: 0, is_day: 1 } }),
      res(true, { principalSubdivision: '서울특별시', locality: '명동' }),
    );
    expect(await service.getWeatherNote(37.5, 127)).toBe('서울특별시 명동 · 맑음, 26°C (낮)');
  });

  it('지명 없으면 head 생략, is_day=0이면 밤', async () => {
    mockFetch(
      res(true, { current: { temperature_2m: 10, weather_code: 3, is_day: 0 } }),
      res(false),
    );
    expect(await service.getWeatherNote(1, 2)).toBe('흐림, 10°C (밤)');
  });

  it('지명에 city 폴백 사용', async () => {
    mockFetch(
      res(true, { current: { temperature_2m: 5, weather_code: 0, is_day: 1 } }),
      res(true, { city: '부산' }),
    );
    expect(await service.getWeatherNote(1, 2)).toBe('부산 · 맑음, 5°C (낮)');
  });

  it('날씨 응답 not ok → null', async () => {
    mockFetch(res(false), res(true, { locality: 'x' }));
    expect(await service.getWeatherNote(1, 2)).toBeNull();
  });

  it('current 없으면 null', async () => {
    mockFetch(res(true, {}), res(false));
    expect(await service.getWeatherNote(1, 2)).toBeNull();
  });

  it('지명 응답 not ok면 지명 null (parts 비어 join 안 함)', async () => {
    mockFetch(
      res(true, { current: { temperature_2m: 1, weather_code: 0, is_day: 1 } }),
      res(true, {}),
    );
    expect(await service.getWeatherNote(1, 2)).toBe('맑음, 1°C (낮)');
  });

  it('지명 fetch가 throw해도 catch로 null', async () => {
    global.fetch = jest.fn((url: any) =>
      String(url).includes('open-meteo')
        ? Promise.resolve(res(true, { current: { temperature_2m: 1, weather_code: 0, is_day: 1 } }))
        : Promise.reject(new Error('geo down')),
    ) as any;
    expect(await service.getWeatherNote(1, 2)).toBe('맑음, 1°C (낮)');
  });

  it('날씨 fetch가 throw하면 getWeatherNote catch → null + warn', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('net'))) as any;
    expect(await service.getWeatherNote(1, 2)).toBeNull();
    expect(service['logger'].warn).toHaveBeenCalled();
  });

  it('fetchWithTimeout: 타임아웃이 fetch를 abort', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: any, opts: any) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as any;
    const p = service.getWeatherNote(1, 2);
    await jest.advanceTimersByTimeAsync(6000);
    expect(await p).toBeNull();
  });

  describe('wmoToKorean (weather_code → 설명)', () => {
    const cases: [number, string][] = [
      [0, '맑음'],
      [1, '대체로 맑음'],
      [2, '구름 조금'],
      [3, '흐림'],
      [45, '안개'],
      [48, '안개'],
      [51, '이슬비'],
      [61, '비'],
      [71, '눈'],
      [80, '소나기'],
      [85, '소나기성 눈'],
      [86, '소나기성 눈'],
      [95, '뇌우'],
      [96, '우박 동반 뇌우'],
      [99, '우박 동반 뇌우'],
      [12345, '알 수 없는 날씨'],
    ];
    it.each(cases)('code %i → %s', async (code, desc) => {
      mockFetch(
        res(true, { current: { temperature_2m: 20, weather_code: code, is_day: 1 } }),
        res(false),
      );
      expect(await service.getWeatherNote(1, 2)).toBe(`${desc}, 20°C (낮)`);
    });
  });
});

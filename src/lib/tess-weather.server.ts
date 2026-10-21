// Server-side weather for Tess's fictional region. Open-Meteo needs no API
// key, so nothing secret is exposed; this module only ever runs server-side.
// ZIP 16602 (Altoona, PA) is a coarse regional anchor — never user location.

export const WEATHER_ZIP = "16602";

export type WeatherContext = {
  condition: string; // "clear" | "cloudy" | "rain" | "snow" | "storm" | "fog"
  temperature_f: number;
  feels_like_f: number;
  precipitation: boolean;
  snowing: boolean;
  rain: boolean;
  wind_mph: number;
  weather_alert: string | null;
  sunrise: string;
  sunset: string;
  local_time: string;
  timezone: string;
  weather_region: string;
};

const CACHE_MS = 30 * 60 * 1000; // 30 minutes — weather doesn't change per message
let cache: { at: number; data: WeatherContext } | null = null;

const WMO: Record<number, { condition: string; rain?: boolean; snow?: boolean; storm?: boolean }> = {
  0: { condition: "clear" },
  1: { condition: "clear" },
  2: { condition: "cloudy" },
  3: { condition: "cloudy" },
  45: { condition: "fog" },
  48: { condition: "fog" },
  51: { condition: "rain", rain: true },
  53: { condition: "rain", rain: true },
  55: { condition: "rain", rain: true },
  56: { condition: "rain", rain: true },
  57: { condition: "rain", rain: true },
  61: { condition: "rain", rain: true },
  63: { condition: "rain", rain: true },
  65: { condition: "rain", rain: true },
  66: { condition: "rain", rain: true },
  67: { condition: "rain", rain: true },
  71: { condition: "snow", snow: true },
  73: { condition: "snow", snow: true },
  75: { condition: "snow", snow: true },
  77: { condition: "snow", snow: true },
  80: { condition: "rain", rain: true },
  81: { condition: "rain", rain: true },
  82: { condition: "rain", rain: true },
  85: { condition: "snow", snow: true },
  86: { condition: "snow", snow: true },
  95: { condition: "storm", rain: true, storm: true },
  96: { condition: "storm", rain: true, storm: true },
  99: { condition: "storm", rain: true, storm: true },
};

type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** Normalize Open-Meteo output into the simulation's weather shape. */
export function normalizeWeather(geo: { name?: string }, raw: unknown, zip: string): WeatherContext {
  const r = raw as {
    timezone?: string;
    current?: { time?: string; temperature_2m?: number; apparent_temperature?: number; weather_code?: number; wind_speed_10m?: number; precipitation?: number };
    daily?: { sunrise?: string[]; sunset?: string[] };
  };
  const code = r.current?.weather_code ?? 0;
  const w = WMO[code] ?? { condition: "cloudy" };
  const windKmh = r.current?.wind_speed_10m ?? 0;
  return {
    condition: w.condition,
    temperature_f: Math.round(r.current?.temperature_2m ?? 50),
    feels_like_f: Math.round(r.current?.apparent_temperature ?? r.current?.temperature_2m ?? 50),
    precipitation: (r.current?.precipitation ?? 0) > 0 || !!w.rain || !!w.snow,
    snowing: !!w.snow,
    rain: !!w.rain && !w.snow,
    wind_mph: Math.round(windKmh * 0.621371),
    weather_alert: w.storm ? "thunderstorms in the area" : null,
    sunrise: r.daily?.sunrise?.[0] ?? "",
    sunset: r.daily?.sunset?.[0] ?? "",
    local_time: r.current?.time ?? "",
    timezone: r.timezone ?? "America/New_York",
    weather_region: zip,
  };
}

/**
 * Current weather for the simulation region. Returns null on any failure —
 * chat must continue without weather, and Tess never mentions the failure.
 * Results are cached for 30 minutes.
 */
export async function getWeatherContext(zip: string = WEATHER_ZIP, fetcher?: Fetcher): Promise<WeatherContext | null> {
  if (cache && Date.now() - cache.at < CACHE_MS && cache.data.weather_region === zip) return cache.data;
  const f: Fetcher =
    fetcher ??
    (async (url: string) => {
      const res = await fetch(url, { headers: { "User-Agent": "TessApp/1.0 (weather)", Accept: "application/json" } });
      return { ok: res.ok, json: () => res.json() };
    });
  try {
    // Open-Meteo geocoding doesn't reliably resolve ZIP codes; use known coords for the home region.
    let loc: { latitude: number; longitude: number; name?: string } | undefined =
      zip === "16602" && !fetcher ? { latitude: 40.5187, longitude: -78.3947, name: "Altoona" } : undefined;
    if (!loc) {
      const geoRes = await f(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(zip)}&count=1&country=US`);
      if (!geoRes.ok) throw new Error("geocode failed");
      const geo = (await geoRes.json()) as { results?: { latitude: number; longitude: number; name?: string }[] };
      loc = geo.results?.[0];
    }
    if (!loc) throw new Error("zip not found");
    const wxRes = await f(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation` +
        `&daily=sunrise,sunset&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1`,
    );
    if (!wxRes.ok) throw new Error("forecast failed");
    const data = normalizeWeather(loc, await wxRes.json(), zip);
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    console.error("weather lookup failed", e);
    // Reasonably recent cached weather is better than none.
    if (cache && Date.now() - cache.at < 6 * CACHE_MS) return cache.data;
    return null;
  }
}

/** Test hook: reset the module cache. */
export function __resetWeatherCache() {
  cache = null;
}

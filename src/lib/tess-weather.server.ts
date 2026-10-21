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

/** Known coordinates for every character's home ZIP — no geocoding round-trip needed. */
const REGION_COORDS: Record<string, { latitude: number; longitude: number; name: string }> = {
  "16601": { latitude: 40.5187, longitude: -78.3947, name: "Altoona" },
  "16602": { latitude: 40.5187, longitude: -78.3947, name: "Altoona" },
  "16635": { latitude: 40.4334, longitude: -78.4137, name: "Duncansville" },
};

// Central PA monthly normals (°F high / low), used only when every provider is down.
const NORMALS: [number, number][] = [
  [34, 19], [37, 20], [46, 27], [59, 37], [69, 47], [77, 56],
  [81, 60], [79, 59], [72, 52], [61, 40], [49, 32], [38, 24],
];

/** Deterministic, plausible seasonal weather for the region (stable per day/hour). */
export function seasonalBaseline(zip: string, now: Date = new Date()): WeatherContext {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hour12: false })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const month = Number(parts.month) - 1;
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const [hi, lo] = NORMALS[month];
  // Coldest ~6am, warmest ~3pm.
  const t = (Math.cos(((hour - 15) / 24) * 2 * Math.PI) + 1) / 2;
  const seed = (Number(parts.year) * 372 + month * 31 + day) % 97;
  const temp = Math.round(lo + (hi - lo) * t + ((seed % 7) - 3));
  const cold = temp <= 32;
  const roll = seed % 10;
  const condition = roll < 4 ? "cloudy" : roll < 6 ? (cold ? "snow" : "rain") : roll < 7 ? "fog" : "clear";
  const wind = 4 + (seed % 9);
  return {
    condition,
    temperature_f: temp,
    feels_like_f: temp - (wind > 8 ? 4 : 1),
    precipitation: condition === "rain" || condition === "snow",
    snowing: condition === "snow",
    rain: condition === "rain",
    wind_mph: wind,
    weather_alert: null,
    sunrise: "",
    sunset: "",
    local_time: now.toISOString(),
    timezone: "America/New_York",
    weather_region: zip,
  };
}

/** Map an NWS hourly period into the simulation shape. */
export function normalizeNws(period: { temperature?: number; shortForecast?: string; windSpeed?: string; startTime?: string }, zip: string): WeatherContext {
  const f = (period.shortForecast ?? "").toLowerCase();
  const condition = /thunder/.test(f) ? "storm" : /snow|flurr|sleet/.test(f) ? "snow" : /rain|shower|drizzle/.test(f) ? "rain" : /fog/.test(f) ? "fog" : /cloud|overcast/.test(f) ? "cloudy" : "clear";
  const wind = Number((period.windSpeed ?? "").match(/\d+/)?.[0] ?? 0);
  const temp = Math.round(period.temperature ?? 50);
  return {
    condition,
    temperature_f: temp,
    feels_like_f: temp - (wind > 10 ? 4 : 0),
    precipitation: ["rain", "snow", "storm"].includes(condition),
    snowing: condition === "snow",
    rain: condition === "rain" || condition === "storm",
    wind_mph: wind,
    weather_alert: condition === "storm" ? "thunderstorms in the area" : null,
    sunrise: "",
    sunset: "",
    local_time: period.startTime ?? "",
    timezone: "America/New_York",
    weather_region: zip,
  };
}

const caches = new Map<string, { at: number; data: WeatherContext }>();

/**
 * Current weather for a character's region. Never returns null: Open-Meteo,
 * then the National Weather Service, then recent cache, then a seasonal baseline.
 * Results are cached for 30 minutes per ZIP.
 */
export async function getWeatherContext(zip: string = WEATHER_ZIP, fetcher?: Fetcher): Promise<WeatherContext> {
  const cached = caches.get(zip);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const f: Fetcher =
    fetcher ??
    (async (url: string) => {
      const res = await fetch(url, { headers: { "User-Agent": "TessApp/1.0 (weather; contact@screen-to-same-studio.lovable.app)", Accept: "application/json, application/geo+json" } });
      return { ok: res.ok, json: () => res.json() };
    });
  const save = (data: WeatherContext) => {
    caches.set(zip, { at: Date.now(), data });
    return data;
  };

  let loc: { latitude: number; longitude: number; name?: string } | undefined = REGION_COORDS[zip];
  try {
    if (!loc) {
      const geoRes = await f(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(zip)}&count=1&country=US`);
      if (geoRes.ok) {
        const geo = (await geoRes.json()) as { results?: { latitude: number; longitude: number; name?: string }[] };
        loc = geo.results?.[0];
      }
    }
    loc ??= REGION_COORDS["16602"]!;
    const wxRes = await f(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation` +
        `&daily=sunrise,sunset&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1`,
    );
    if (!wxRes.ok) throw new Error("open-meteo forecast failed");
    return save(normalizeWeather(loc ?? {}, await wxRes.json(), zip));
  } catch (e) {
    console.warn("open-meteo failed, trying NWS", e);
  }

  try {
    const l = loc ?? REGION_COORDS["16602"]!;
    const pts = await f(`https://api.weather.gov/points/${l.latitude.toFixed(4)},${l.longitude.toFixed(4)}`);
    if (!pts.ok) throw new Error("nws points failed");
    const hourlyUrl = ((await pts.json()) as { properties?: { forecastHourly?: string } }).properties?.forecastHourly;
    if (!hourlyUrl) throw new Error("nws no hourly url");
    const hr = await f(hourlyUrl);
    if (!hr.ok) throw new Error("nws hourly failed");
    const period = ((await hr.json()) as { properties?: { periods?: Parameters<typeof normalizeNws>[0][] } }).properties?.periods?.[0];
    if (!period) throw new Error("nws no periods");
    return save(normalizeNws(period, zip));
  } catch (e) {
    console.warn("NWS failed, using cache or seasonal baseline", e);
  }

  if (cached && Date.now() - cached.at < 6 * CACHE_MS) return cached.data;
  return seasonalBaseline(zip);
}

/** Test hook: reset the module cache. */
export function __resetWeatherCache() {
  caches.clear();
}

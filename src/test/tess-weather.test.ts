import { describe, expect, it, beforeEach } from "vitest";
import { WEATHER_ZIP, __resetWeatherCache, getWeatherContext, normalizeWeather } from "@/lib/tess-weather.server";

const GEO = { results: [{ latitude: 40.52, longitude: -78.39, name: "Altoona" }] };
const FORECAST = {
  timezone: "America/New_York",
  current: { time: "2026-10-20T18:00", temperature_2m: 31.2, apparent_temperature: 24.1, weather_code: 73, wind_speed_10m: 22.5, precipitation: 0.8 },
  daily: { sunrise: ["2026-10-20T07:20"], sunset: ["2026-10-20T18:15"] },
};

function fakeFetcher(geo: unknown, forecast: unknown, ok = true) {
  return async (url: string) => ({
    ok,
    json: async () => (url.includes("geocoding") ? geo : forecast),
  });
}

describe("weather provider", () => {
  beforeEach(() => __resetWeatherCache());

  it("ZIP 16602 is the configured weather region", () => {
    expect(WEATHER_ZIP).toBe("16602");
  });

  it("returns normalized data for the configured region", async () => {
    const w = await getWeatherContext("16602", fakeFetcher(GEO, FORECAST));
    expect(w).not.toBeNull();
    expect(w!.weather_region).toBe("16602");
    expect(w!.condition).toBe("snow");
    expect(w!.snowing).toBe(true);
    expect(w!.rain).toBe(false);
    expect(w!.precipitation).toBe(true);
    expect(w!.temperature_f).toBe(31);
    expect(w!.feels_like_f).toBe(24);
    expect(w!.wind_mph).toBe(14);
    expect(w!.timezone).toBe("America/New_York");
    expect(w!.sunrise).toContain("07:20");
    expect(w!.weather_alert).toBeNull();
  });

  it("normalizes storms into an alert", () => {
    const w = normalizeWeather({}, { ...FORECAST, current: { ...FORECAST.current, weather_code: 95 } }, "16602");
    expect(w.condition).toBe("storm");
    expect(w.weather_alert).toMatch(/thunderstorm/i);
  });

  it("total provider failure falls back to a seasonal baseline, never null", async () => {
    const w = await getWeatherContext("16602", fakeFetcher(null, null, false));
    expect(w).not.toBeNull();
    expect(w.weather_region).toBe("16602");
  });

  it("falls back to the National Weather Service when Open-Meteo is blocked", async () => {
    const f = async (url: string) => {
      if (url.includes("open-meteo")) return { ok: false, json: async () => null };
      if (url.includes("/points/")) return { ok: true, json: async () => ({ properties: { forecastHourly: "https://api.weather.gov/hourly" } }) };
      return { ok: true, json: async () => ({ properties: { periods: [{ temperature: 44, shortForecast: "Light Rain", windSpeed: "12 mph" }] } }) };
    };
    const w = await getWeatherContext("16601", f);
    expect(w.condition).toBe("rain");
    expect(w.temperature_f).toBe(44);
    expect(w.wind_mph).toBe(12);
  });

  it("a failure after success falls back to cached weather", async () => {
    const first = await getWeatherContext("16602", fakeFetcher(GEO, FORECAST));
    expect(first).not.toBeNull();
    const second = await getWeatherContext("16602", fakeFetcher(null, null, false));
    expect(second).toEqual(first); // cached, chat continues
  });

  it("caches results — the provider is not called per message", async () => {
    let calls = 0;
    const counting = async (url: string) => {
      calls++;
      return { ok: true, json: async () => (url.includes("geocoding") ? GEO : FORECAST) };
    };
    await getWeatherContext("16602", counting);
    await getWeatherContext("16602", counting);
    await getWeatherContext("16602", counting);
    expect(calls).toBe(1); // known coords, one forecast, then cache
  });
});

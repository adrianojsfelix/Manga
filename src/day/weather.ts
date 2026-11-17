// The weather from Open-Meteo (free, no key): the city found by name, now
// and the next days. Pure readers of its answers: tested on their own.

export interface Place {
  name: string;
  /** "São Paulo, Brasil". */
  label: string;
  lat: number;
  lon: number;
}

export interface Day {
  /** "2026-11-17". */
  date: string;
  max: number;
  min: number;
  code: number;
  rain: number;
}

export interface Weather {
  temp: number;
  feels: number;
  code: number;
  humidity: number;
  wind: number;
  isDay: boolean;
  days: Day[];
}

export function geocodeUrl(name: string): string {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=5&language=pt&format=json`;
}

export function parsePlaces(json: string): Place[] {
  try {
    const d = JSON.parse(json) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
    return (d.results ?? []).map((r) => ({ name: r.name, label: [r.name, r.admin1, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude }));
  } catch {
    return [];
  }
}

export function forecastUrl(p: Place): string {
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "6",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function parseWeather(json: string): Weather | null {
  try {
    const d = JSON.parse(json);
    const c = d.current;
    const day = d.daily;
    if (!c || !day) return null;
    const days: Day[] = (day.time as string[]).map((date: string, i: number) => ({
      date,
      max: Math.round(day.temperature_2m_max[i]),
      min: Math.round(day.temperature_2m_min[i]),
      code: day.weather_code[i],
      rain: day.precipitation_probability_max?.[i] ?? 0,
    }));
    return {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      code: c.weather_code,
      humidity: Math.round(c.relative_humidity_2m),
      wind: Math.round(c.wind_speed_10m),
      isDay: c.is_day !== 0,
      days,
    };
  } catch {
    return null;
  }
}

/** WMO weather code → a symbol and an English key for t(). */
export function sky(code: number, isDay = true): { icon: string; label: string } {
  if (code === 0) return { icon: isDay ? "☀️" : "🌙", label: "Clear" };
  if (code <= 2) return { icon: isDay ? "🌤️" : "☁️", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Cloudy" };
  if (code <= 48) return { icon: "🌫️", label: "Fog" };
  if (code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: "🌧️", label: "Rain" };
  if (code <= 77 || code === 85 || code === 86) return { icon: "🌨️", label: "Snow" };
  return { icon: "⛈️", label: "Storm" };
}

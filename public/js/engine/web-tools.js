// The tools that call another service: Wikipedia and the weather (Open-Meteo). The hosts are fixed in this file,
// a call has a time limit and a size limit, and every failure becomes a ToolError with a text the model can read.
import { ToolError } from "./own-tools.js";

export const WEB_TOOL_LIMITS = { timeoutMs: 8000, bodyMax: 300000, queryMax: 200, summaryChars: 1200, retryDelayMs: 1500 };
const WIKI_LANGUAGES = ["en", "cs"];
const WEATHER_CODES = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "heavy rain showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail" };

// Gets one JSON document from a fixed host. fetchImpl and timeoutMs are replaced in tests.
// An answer 429 (too many requests, common on shared server addresses) or 503 is tried once more after a short wait.
async function getJson(url, { fetchImpl = globalThis.fetch, timeoutMs = WEB_TOOL_LIMITS.timeoutMs, retryDelayMs = WEB_TOOL_LIMITS.retryDelayMs, service } = {}) {
  if (typeof fetchImpl !== "function") throw new ToolError(`${service} cannot be reached from here.`);
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);
  try {
    let response = await fetchImpl(url, { signal: control.signal, headers: { accept: "application/json", "user-agent": "AgentAtlasAcademy/1.0 (teaching tool)" } });
    if (response.status === 429 || response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      response = await fetchImpl(url, { signal: control.signal, headers: { accept: "application/json", "user-agent": "AgentAtlasAcademy/1.0 (teaching tool)" } });
    }
    if (!response.ok) throw new ToolError(`${service} answered with the error ${response.status}.`);
    const body = await response.text();
    if (body.length > WEB_TOOL_LIMITS.bodyMax) throw new ToolError(`${service} sent too much data.`);
    try {
      return JSON.parse(body);
    } catch {
      throw new ToolError(`${service} sent an answer that is not readable.`);
    }
  } catch (error) {
    if (error instanceof ToolError) throw error;
    if (error?.name === "AbortError") throw new ToolError(`${service} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    throw new ToolError(`${service} cannot be reached.`);
  } finally {
    clearTimeout(timer);
  }
}

const cleanQuery = (value, what) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") throw new ToolError(`${what} is needed.`);
  if (text.length > WEB_TOOL_LIMITS.queryMax) throw new ToolError(`${what} is too long (at most ${WEB_TOOL_LIMITS.queryMax} characters).`);
  return text;
};

// The title, a summary of about 1200 characters and the address of the best page for a query.
export async function wikipediaText({ query, language } = {}, options = {}) {
  const q = cleanQuery(query, "A search text (query)");
  const lang = language === undefined || language === "" ? "en" : String(language).toLowerCase();
  if (!WIKI_LANGUAGES.includes(lang)) throw new ToolError(`The language must be one of: ${WIKI_LANGUAGES.join(", ")}.`);
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1&prop=extracts|info&exintro=1&explaintext=1&exchars=${WEB_TOOL_LIMITS.summaryChars}&inprop=url`;
  const data = await getJson(url, { ...options, service: "Wikipedia" });
  const page = Object.values(data?.query?.pages ?? {})[0];
  if (!page || typeof page.extract !== "string" || page.extract.trim() === "") throw new ToolError(`Wikipedia has no page for "${q}" in ${lang}.`);
  return `${page.title} (Wikipedia, ${lang})\n${page.extract.trim()}\n${page.fullurl ?? ""}`.trim();
}

const rounded = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : "?");

// The weather now and for the next 3 days at a place.
export async function weatherText({ place } = {}, options = {}) {
  const name = cleanQuery(place, "A place");
  const found = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`, { ...options, service: "The place search" });
  const spot = found?.results?.[0];
  if (!spot || typeof spot.latitude !== "number" || typeof spot.longitude !== "number") throw new ToolError(`No place was found for "${name}".`);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=4`;
  const data = await getJson(url, { ...options, service: "The weather service" });
  const now = data?.current;
  const days = data?.daily;
  if (!now || !Array.isArray(days?.time)) throw new ToolError("The weather service sent no forecast.");
  const where = [spot.name, spot.admin1, spot.country].filter(Boolean).join(", ");
  const lines = [`Weather in ${where}`, `Now: ${rounded(now.temperature_2m)} C, ${WEATHER_CODES[now.weather_code] ?? "no description"}, rain ${rounded(now.precipitation)} mm, wind ${rounded(now.wind_speed_10m)} km/h`];
  days.time.slice(0, 4).forEach((day, i) => lines.push(`${day}: ${rounded(days.temperature_2m_min?.[i])} to ${rounded(days.temperature_2m_max?.[i])} C, rain ${rounded(days.precipitation_sum?.[i])} mm, wind up to ${rounded(days.wind_speed_10m_max?.[i])} km/h`));
  return lines.join("\n");
}

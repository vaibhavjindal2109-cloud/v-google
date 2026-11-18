// Top trending Google searches via a third-party provider (SerpApi "Google Trends Trending Now").
// Google has no open public API for this (its official Trends API is an application-only alpha), so this is
// provider data, labelled as such. Nothing here is invented: without a key the endpoint reports "not configured".
const TTL_MS = 30 * 60 * 1000;
const cache = new Map();

export function normalizeTrending(payload, limit = 100) {
  const list = Array.isArray(payload?.trending_searches) ? payload.trending_searches : [];
  const seen = new Set();
  return list
    .map((t) => ({
      query: String(t.query ?? t.title ?? '').trim(),
      searchVolume: Number.isFinite(t.search_volume) ? t.search_volume : null,
      increasePercentage: Number.isFinite(t.increase_percentage) ? t.increase_percentage : null,
      startedAt: Number.isFinite(t.start_timestamp) ? new Date(t.start_timestamp * 1000).toISOString() : null,
    }))
    .filter((t) => t.query && !seen.has(t.query.toLowerCase()) && seen.add(t.query.toLowerCase()))
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .slice(0, limit)
    .map((t, i) => ({ rank: i + 1, ...t }));
}

export async function getTrending({ geo = 'IN', limit = 100, apiKey = process.env.SERPAPI_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) return { configured: false, message: 'Set SERPAPI_KEY in backend/.env to load live Google trending searches.' };
  const key = `${geo}:${limit}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.value, cached: true };
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({ engine: 'google_trends_trending_now', geo, hours: '24', hl: 'en', api_key: apiKey });
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Trending provider returned ${res.status}`);
  const value = { configured: true, source: 'Google Trends "Trending Now" via SerpApi', geo, fetchedAt: new Date().toISOString(), items: normalizeTrending(await res.json(), limit) };
  cache.set(key, { at: Date.now(), value });
  return value;
}

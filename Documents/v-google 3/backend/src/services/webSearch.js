// Live web results through a provider adapter. V-Google does not crawl or index these pages: it re-ranks the
// provider's candidate set. The API key stays on the server.
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const PAGE_SIZE = 10;

const safeUrl = (u) => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : null; } catch { return null; } };

export function normalizeWeb(payload, { offset = 0 } = {}) {
  const seen = new Set(), out = [];
  for (const r of payload?.organic_results || []) {
    const url = safeUrl(r.link);
    if (!url || !r.title) continue;
    const u = new URL(url), key = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
    if (seen.has(key)) continue; // deduplicate by host + path
    seen.add(key);
    const t = Date.parse(r.date);
    out.push({
      page: offset + out.length + 1, url, title: String(r.title), text: String(r.snippet || r.title),
      links_to: [], retrieved: true, providerRank: offset + out.length + 1, ...(Number.isFinite(t) ? { published: new Date(t).toISOString() } : {}),
    });
  }
  return out;
}

const providers = {
  serpapi: async ({ q, page, safe, apiKey, fetchImpl }) => {
    const url = new URL('https://serpapi.com/search.json');
    url.search = new URLSearchParams({ engine: 'google', q, start: String((page - 1) * PAGE_SIZE), safe: safe ? 'active' : 'off', hl: 'en', api_key: apiKey });
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Search provider returned ${res.status}`);
    return normalizeWeb(await res.json(), { offset: (page - 1) * PAGE_SIZE });
  },
};

export async function getWebSearch({ q, page = 1, safe = true, apiKey = process.env.SERPAPI_KEY, provider = process.env.WEB_SEARCH_PROVIDER || 'serpapi', fetchImpl = fetch } = {}) {
  if (!apiKey) return { configured: false, message: 'Set SERPAPI_KEY in backend/.env to enable live web search.' };
  const run = providers[provider];
  if (!run) throw new Error(`Unknown search provider "${provider}"`);
  const key = `${provider}:${q.toLowerCase()}:${page}:${safe}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = { configured: true, docs: await run({ q, page, safe, apiKey, fetchImpl }) };
  cache.set(key, { at: Date.now(), value });
  return value;
}

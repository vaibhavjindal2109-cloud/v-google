import { tokenize, queryTerms, docTitleTokens, count, stuffing, candidates, clamp, finish } from './text.js';

export const MODERN_WEIGHTS = { bm25: 0.30, pagerank: 0.25, providerRank: 0.25, title: 0.15, quality: 0.10, queryMatch: 0.10, source: 0.05, freshness: 0.05 };
const LABELS = { bm25: 'BM25 relevance', pagerank: 'PageRank authority', providerRank: 'Provider rank (authority stand-in)', title: 'Title relevance', quality: 'Content quality', queryMatch: 'Query match', source: 'Source quality', freshness: 'Freshness' };

// Iterative PageRank over the corpus link graph (dangling mass spread evenly).
export function pagerank(corpus, d = 0.85, maxIter = 100, eps = 1e-10) {
  const N = corpus.length, idx = new Map(corpus.map((x, i) => [x.page, i]));
  const out = corpus.map((x) => (x.links_to || []).filter((t) => idx.has(t) && t !== x.page).map((t) => idx.get(t)));
  let pr = Array(N).fill(1 / N);
  for (let it = 0; it < maxIter; it++) {
    const next = Array(N).fill((1 - d) / N);
    let dangling = 0;
    out.forEach((o, i) => { if (!o.length) dangling += pr[i]; else o.forEach((j) => (next[j] += (d * pr[i]) / o.length)); });
    for (let j = 0; j < N; j++) next[j] += (d * dangling) / N;
    const diff = next.reduce((s, v, i) => s + Math.abs(v - pr[i]), 0);
    pr = next;
    if (diff < eps) break;
  }
  return new Map(corpus.map((x, i) => [x.page, pr[i]]));
}

export function bm25Scores(corpus, q, k1 = 1.5, b = 0.75) {
  const toks = corpus.map((d) => tokenize(d.title ? `${d.title} ${d.title} ${d.text}` : d.text)), N = corpus.length;
  const avg = toks.reduce((s, t) => s + t.length, 0) / N;
  const df = Object.fromEntries(q.map((t) => [t, toks.filter((x) => x.includes(t)).length]));
  return new Map(corpus.map((d, i) => {
    let s = 0;
    for (const t of q) {
      const f = count(toks[i], [t]);
      if (!f) continue;
      s += Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5)) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avg)));
    }
    return [d.page, s];
  }));
}

const freshness = (iso) => { if (!iso) return null; const days = (Date.now() - Date.parse(iso)) / 864e5; return Number.isFinite(days) ? 100 * Math.exp(-Math.max(0, days) / 365) : null; };

// usePageRank=false models results without a link graph (e.g. external web results): the factor becomes "missing".
export function modernRank(corpus, query, { usePageRank = true } = {}) {
  const q = queryTerms(query);
  const cands = candidates(corpus, q);
  if (!q.length || !cands.length) return [];
  const bm = bm25Scores(corpus, q), maxBm = Math.max(...cands.map((d) => bm.get(d.page))) || 1;
  const pr = usePageRank ? pagerank(corpus) : null, maxPr = pr ? Math.max(...pr.values()) : 1;
  const ranked = cands.filter((x) => x.providerRank != null).sort((a, b) => a.providerRank - b.providerRank);
  const posOf = new Map(ranked.map((x, i) => [x.page, i + 1]));
  return finish(cands.map((d) => {
    const body = tokenize(d.text), title = docTitleTokens(d), sp = stuffing(body, q);
    const uniq = new Set(body).size / (body.length || 1);
    const raw = {
      bm25: (100 * bm.get(d.page)) / maxBm,
      pagerank: pr ? (100 * pr.get(d.page)) / maxPr : null,
      providerRank: posOf.has(d.page) ? (100 * (ranked.length - posOf.get(d.page) + 1)) / ranked.length : null,
      title: (100 * q.filter((t) => title.includes(t)).length) / q.length,
      quality: 100 * (0.7 * uniq + 0.3 * Math.min(1, body.length / (d.retrieved ? 25 : 8))),
      queryMatch: (100 * q.filter((t) => body.includes(t) || title.includes(t)).length) / q.length,
      source: d.sourceQuality ?? null,
      freshness: freshness(d.published),
    };
    const keys = Object.keys(MODERN_WEIGHTS).filter((k) => k !== 'providerRank' || raw.providerRank != null), avail = keys.filter((k) => raw[k] != null);
    const total = avail.reduce((s, k) => s + MODERN_WEIGHTS[k], 0);
    const factors = keys.map((k) => ({ name: LABELS[k], value: raw[k] == null ? null : +raw[k].toFixed(1), weight: raw[k] == null ? 0 : +(MODERN_WEIGHTS[k] / total).toFixed(3) }));
    const base = avail.reduce((s, k) => s + raw[k] * (MODERN_WEIGHTS[k] / total), 0);
    const score = clamp(sp.stuffed ? base * 0.5 : base); // spam penalty is explicit and shown in the explanation
    const verdict = total < 0.5 ? 'INSUFFICIENT EVIDENCE' : score >= 70 ? 'STRONG RESULT' : score >= 50 ? 'GOOD RESULT' : score >= 30 ? 'MODERATE RESULT' : 'WEAK RESULT';
    const top = factors.filter((f) => f.value != null).sort((a, b) => b.value * b.weight - a.value * a.weight).slice(0, 2).map((f) => `${f.name} (${f.value})`);
    const missing = factors.filter((f) => f.value == null).map((f) => f.name.toLowerCase());
    return {
      id: d.page, url: d.url, title: d.title || title.join(' '), text: d.text, score: +score.toFixed(1), verdict, spam: sp.stuffed,
      providerRank: d.providerRank ?? null, pagerank: pr ? +pr.get(d.page).toFixed(4) : null, pagerankScore: raw.pagerank == null ? null : +raw.pagerank.toFixed(1),
      bm25: +bm.get(d.page).toFixed(3), bm25Score: +raw.bm25.toFixed(1), factors,
      explanation: `Strongest signals: ${top.join(', ')}.` + (missing.length ? ` No data for ${missing.join(', ')}; weight redistributed.` : '') +
        (sp.stuffed ? ' Spam indicator: repeated-term stuffing, score halved.' : '') + ' A strong ranking is not a claim that the page is factually reliable.',
    };
  }));
}

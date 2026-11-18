import { queryTerms } from './text.js';
import { classicRank } from './classic.js';
import { modernRank } from './modern.js';

export function compare(corpus, query, opts = {}) {
  const usePR = opts.usePageRank !== false;
  const classic = classicRank(corpus, query), modern = modernRank(corpus, query, opts);
  const cr = new Map(classic.map((r) => [r.id, r.rank])), mr = new Map(modern.map((r) => [r.id, r.rank]));
  const rows = classic.map((r) => {
    const change = cr.get(r.id) - mr.get(r.id); // positive: moved up under Modern
    const driver = change >= 1 ? (usePR ? 'links' : 'signals') : change <= -1 ? 'keywords' : 'stable';
    return { id: r.id, url: r.url, classicRank: cr.get(r.id), modernRank: mr.get(r.id), change, driver };
  });
  const notes = rows.filter((r) => r.driver !== 'stable').map((r) => r.driver === 'links'
    ? `Page ${r.id} (${new URL(r.url).hostname}) rose ${r.change} place(s): ${usePR ? 'inbound links and relevance' : 'relevance and quality signals'} outweigh raw keyword count.`
    : `Page ${r.id} (${new URL(r.url).hostname}) fell ${-r.change} place(s): it ranked on keyword repetition, which Modern discounts.`);
  return { query, terms: queryTerms(query), classic, modern, rows, notes };
}

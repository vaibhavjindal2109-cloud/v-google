import { tokenize, queryTerms, docTitleTokens, count, stuffing, candidates, clamp, finish } from './text.js';

export const CLASSIC_WEIGHTS = { title: 0.4, body: 0.3, density: 0.2, phrase: 0.1 };

// Experimental historical-style keyword model. Not a reconstruction of any real Google algorithm.
export function classicRank(corpus, query) {
  const q = queryTerms(query);
  if (!q.length) return [];
  const phrase = ` ${tokenize(query).join(' ')} `;
  const rows = candidates(corpus, q).map((d) => {
    const body = tokenize(d.text), title = docTitleTokens(d), sp = stuffing(body, q);
    return { d, body, title, sp, titleHits: q.filter((t) => title.includes(t)).length, phrase: ` ${body.join(' ')} `.includes(phrase) };
  });
  const maxTf = Math.max(1, ...rows.map((r) => r.sp.tf));
  return finish(rows.map((r) => {
    const v = {
      title: (100 * r.titleHits) / q.length,
      body: r.sp.tf ? (100 * Math.log1p(r.sp.tf)) / Math.log1p(maxTf) : 0, // log scale: repetition has diminishing returns
      density: clamp(r.sp.density * 100),
      phrase: r.phrase ? 100 : 0,
    };
    const score = clamp(Object.keys(v).reduce((s, k) => s + v[k] * CLASSIC_WEIGHTS[k], 0));
    const verdict = r.sp.stuffed ? 'POSSIBLE KEYWORD STUFFING' : score >= 60 ? 'HIGH KEYWORD MATCH' : score >= 30 ? 'MODERATE KEYWORD MATCH' : 'LOW KEYWORD MATCH';
    return {
      id: r.d.page, url: r.d.url, title: r.d.title || r.title.join(' '), text: r.d.text,
      score: +score.toFixed(1), verdict, spam: r.sp.stuffed,
      keywordFrequency: r.sp.tf, keywordDensity: +r.sp.density.toFixed(3), titleMatch: r.titleHits > 0,
      factors: Object.keys(v).map((k) => ({ name: { title: 'Title match', body: 'Body frequency (log)', density: 'Keyword density', phrase: 'Exact phrase' }[k], value: +v[k].toFixed(1), weight: CLASSIC_WEIGHTS[k] })),
      explanation: `${r.sp.tf} keyword hit(s) in ${r.body.length} words (${(r.sp.density * 100).toFixed(0)}% density)` +
        (r.titleHits ? ', and the domain name matches the query.' : ', no domain-name match.') +
        (r.sp.stuffed ? ' Density this high suggests keyword stuffing; Classic cannot tell, so it still scores the page.' : ''),
    };
  }));
}

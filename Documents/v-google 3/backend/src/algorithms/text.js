export const tokenize = (s) => String(s).toLowerCase().match(/[a-z0-9]+/g) || [];
export const queryTerms = (q) => [...new Set(tokenize(q))];
export const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
export const count = (tokens, terms) => tokens.filter((t) => terms.includes(t)).length;
// Documents have no title field, so the hostname words (minus TLD) act as a title proxy. Display only; data is untouched.
export const titleTokens = (url) => tokenize(new URL(url).hostname.replace(/^www\./, '').replace(/\.(com|org|net|in)$/, ''));
export const docTitleTokens = (d) => (d.title ? tokenize(d.title) : titleTokens(d.url));
export const stuffing = (tokens, terms) => {
  const tf = count(tokens, terms);
  const density = tokens.length ? tf / tokens.length : 0;
  return { tf, density, stuffed: tf >= 5 && density >= 0.4 };
};
// Shared candidate set: both engines rank exactly these documents.
export const candidates = (corpus, terms) =>
  corpus.filter((d) => d.retrieved || terms.some((t) => tokenize(d.text).includes(t) || docTitleTokens(d).includes(t)));
export const finish = (rows) =>
  rows.sort((a, b) => b.score - a.score || a.id - b.id).map((r, i) => ({ ...r, rank: i + 1 }));

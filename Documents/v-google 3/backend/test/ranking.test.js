import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classicRank } from '../src/algorithms/classic.js';
import { modernRank, pagerank } from '../src/algorithms/modern.js';
import { compare } from '../src/algorithms/compare.js';

const docs = JSON.parse(readFileSync(new URL('../data/documents.json', import.meta.url), 'utf8'));

test('dataset has the six documents with exact content', () => {
  assert.equal(docs.length, 6);
  assert.equal(docs[5].url, 'http://pizza-pizza-pizza.com');
  assert.equal(docs[5].text, 'pizza '.repeat(10).trim());
  assert.deepEqual(docs[3].links_to, [2, 5]);
});

test('classic ranks the stuffed page first and flags it', () => {
  const r = classicRank(docs, 'pizza');
  assert.equal(r[0].id, 6);
  assert.equal(r[0].verdict, 'POSSIBLE KEYWORD STUFFING');
  assert.equal(r[0].keywordFrequency, 10);
  assert.equal(r[0].keywordDensity, 1);
});

test('pagerank comes from the real edges and sums to 1', () => {
  const pr = pagerank(docs);
  assert.ok(Math.abs([...pr.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const order = [...pr.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  assert.equal(order[0], 2);
  assert.equal(order.at(-1), 6); // no inbound links
  const noLinks = pagerank(docs.map((d) => ({ ...d, links_to: [] })));
  assert.ok(new Set([...noLinks.values()].map((v) => v.toFixed(9))).size === 1); // no edges, no authority differences
});

test('modern demotes the stuffed page below link-backed relevant pages', () => {
  const r = modernRank(docs, 'pizza');
  assert.equal(r[0].id, 2);
  assert.ok(r.find((x) => x.id === 6).rank > 1);
  assert.ok(r.find((x) => x.id === 6).spam);
});

test('both engines rank the same candidates; scores are normalised', () => {
  const c = compare(docs, 'pizza');
  assert.deepEqual(c.classic.map((r) => r.id).sort(), c.modern.map((r) => r.id).sort());
  for (const r of [...c.classic, ...c.modern]) assert.ok(r.score >= 0 && r.score <= 100);
  assert.notDeepEqual(c.classic.map((r) => r.id), c.modern.map((r) => r.id));
});

test('missing signals are redistributed, never invented', () => {
  const f = modernRank(docs, 'pizza')[0].factors;
  assert.equal(f.find((x) => x.name === 'Freshness').value, null);
  assert.ok(Math.abs(f.reduce((s, x) => s + x.weight, 0) - 1) < 0.01);
  const noGraph = modernRank(docs, 'pizza', { usePageRank: false })[0].factors;
  assert.equal(noGraph.find((x) => x.name === 'PageRank authority').value, null);
});

test('empty and unmatched queries return nothing', () => {
  assert.deepEqual(classicRank(docs, '   '), []);
  assert.deepEqual(modernRank(docs, 'zzzz'), []);
});

import { normalizeTrending, getTrending } from '../src/services/trending.js';

test('trending: normalises, dedupes, ranks by volume, caps at 100', () => {
  const payload = { trending_searches: [
    { query: 'b', search_volume: 10 }, { query: 'a', search_volume: 500, increase_percentage: 100, start_timestamp: 1750349400 },
    { query: 'A', search_volume: 1 }, { title: 'c' },
  ] };
  const r = normalizeTrending(payload);
  assert.deepEqual(r.map((x) => x.query), ['a', 'b', 'c']);
  assert.equal(r[0].rank, 1);
  assert.equal(r[2].searchVolume, null); // missing volume stays null, never invented
  assert.equal(normalizeTrending({ trending_searches: Array.from({ length: 150 }, (_, i) => ({ query: `q${i}`, search_volume: i })) }).length, 100);
});

test('trending: without a key it reports not configured and makes no request', async () => {
  const out = await getTrending({ apiKey: '', fetchImpl: () => { throw new Error('should not fetch'); } });
  assert.equal(out.configured, false);
});

import { normalizeWeb, getWebSearch } from '../src/services/webSearch.js';

const webPayload = { organic_results: [
  { title: 'Best pizza in Pune', link: 'https://www.example.com/pizza/', snippet: 'Wood-fired pizza guide', date: 'Mar 3, 2026' },
  { title: 'Duplicate', link: 'https://example.com/pizza', snippet: 'dup' },
  { title: 'Bad scheme', link: 'javascript:alert(1)', snippet: 'x' },
  { title: 'Pizza pizza pizza pizza pizza pizza', link: 'http://spam.test', snippet: 'pizza pizza pizza pizza pizza pizza pizza' },
] };

test('web: normalises, dedupes, drops unsafe links, keeps dates only when present', () => {
  const d = normalizeWeb(webPayload);
  assert.equal(d.length, 2);
  assert.ok(d[0].published && !('published' in d[1]));
  assert.ok(d.every((x) => x.retrieved && x.url.startsWith('http')));
});

test('web: both engines rank the same retrieved set; PageRank is missing, not invented', () => {
  const d = normalizeWeb(webPayload);
  const c = compare(d, 'pizza', { usePageRank: false });
  assert.deepEqual(c.classic.map((r) => r.id).sort(), c.modern.map((r) => r.id).sort());
  assert.equal(c.modern.length, 2);
  assert.equal(c.modern[0].pagerankScore, null);
  assert.equal(c.modern[0].factors.find((f) => f.name === 'PageRank authority').value, null);
});

test('web: no key means not configured and no request', async () => {
  const out = await getWebSearch({ q: 'x', apiKey: '', fetchImpl: () => { throw new Error('no fetch'); } });
  assert.equal(out.configured, false);
});

test('web: uses the provider response and caches it', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => webPayload }; };
  const a = await getWebSearch({ q: 'cache-test', apiKey: 'k', fetchImpl });
  await getWebSearch({ q: 'cache-test', apiKey: 'k', fetchImpl });
  assert.equal(a.docs.length, 2);
  assert.equal(calls, 1);
});

test('web: Modern uses provider rank, so it can disagree with Classic on stuffed results', () => {
  const mk = (page, title, text) => ({ page, url: `https://s${page}.test/`, title, text, links_to: [], retrieved: true, providerRank: page });
  const d = [mk(1, 'Pizza guide', 'A thorough guide to making pizza at home'),
             mk(2, 'Pizza', 'pizza pizza pizza pizza pizza pizza pizza pizza')];
  const c = compare(d, 'pizza', { usePageRank: false });
  assert.equal(c.classic[0].id, 2);
  assert.equal(c.modern[0].id, 1);
  assert.equal(c.modern[0].factors.find((f) => f.name.startsWith('Provider rank')).value, 100);
  assert.equal(c.modern[0].factors.find((f) => f.name === 'PageRank authority').value, null);
});

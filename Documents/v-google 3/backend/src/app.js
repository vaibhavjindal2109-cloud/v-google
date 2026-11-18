import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'node:fs';
import { classicRank } from './algorithms/classic.js';
import { modernRank } from './algorithms/modern.js';
import { compare } from './algorithms/compare.js';
import { tokenize, titleTokens } from './algorithms/text.js';
import { getWebSearch } from './services/webSearch.js';
import { getTrending } from './services/trending.js';

export const corpus = JSON.parse(readFileSync(new URL('../data/documents.json', import.meta.url), 'utf8'));
const NOTICE = 'Demonstration corpus: six sample documents. Scores illustrate ranking behaviour and do not represent real-world website authority.';

const WEB_NOTICE = 'Live web results from a search provider. V-Google re-ranks this candidate set; it does not crawl or index these pages. There is no link graph here, so PageRank is unavailable: Modern uses the search provider rank position as a stand-in for authority, plus BM25 over title and snippet, content quality and query match.';

const getQuery = (req, res, next) => {
  const q = req.query.q;
  if (typeof q !== 'string' || !q.trim() || q.length > 200) return res.status(400).json({ error: 'Provide a query "q" of 1-200 characters.' });
  req.q = q.trim();
  next();
};

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120 }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, documents: corpus.length }));
  app.get('/api/search/suggestions', getQuery, (req, res) => {
    const vocab = [...new Set(corpus.flatMap((d) => tokenize(d.text)))];
    const last = tokenize(req.q).pop() || '';
    res.json({ suggestions: vocab.filter((w) => w.startsWith(last) && w !== last && w.length > 2).slice(0, 6) });
  });
  app.get('/api/search/classic', getQuery, (req, res) => res.json({ notice: NOTICE, results: classicRank(corpus, req.q) }));
  app.get('/api/search/modern', getQuery, (req, res) => res.json({ notice: NOTICE, results: modernRank(corpus, req.q) }));
  const both = (req, res) => res.json({ notice: NOTICE, ...compare(corpus, req.q) });
  app.get('/api/search', getQuery, both);
  app.get('/api/search/compare', getQuery, both);
  app.get('/api/examples', (_req, res) => res.json({
    note: 'Hand-written examples for the demo corpus; not Google data.',
    queries: ['pizza', 'pune food', 'pizza recipes', 'canteen', 'wood fired pizza', 'chai'],
    demoDomains: corpus.map((d) => ({ id: d.page, url: d.url, query: titleTokens(d.url).join(' ') })),
  }));
  app.get('/api/trending', async (req, res, next) => {
    const geo = String(req.query.geo || 'IN').toUpperCase();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 100));
    if (!/^[A-Z]{2}$/.test(geo)) return res.status(400).json({ error: 'geo must be a 2-letter country code.' });
    try {
      const out = await getTrending({ geo, limit });
      res.status(out.configured ? 200 : 503).json(out);
    } catch (e) { console.error(e.message); res.status(502).json({ configured: true, error: 'The trending provider is unavailable right now.' }); }
  });
  app.get('/api/web/search', getQuery, async (req, res) => {
    const page = Math.min(10, Math.max(1, parseInt(req.query.page, 10) || 1));
    try {
      const out = await getWebSearch({ q: req.q, page, safe: req.query.safe !== 'off' });
      if (!out.configured) return res.status(503).json(out);
      res.json({ notice: WEB_NOTICE, source: 'web', page, ...compare(out.docs, req.q, { usePageRank: false }) });
    } catch (e) { console.error(e.message); res.status(502).json({ error: 'The web search provider is unavailable right now.' }); }
  });
  app.get('/api/documents', (_req, res) => res.json(corpus));
  app.get('/api/documents/:id', (req, res) => {
    const d = corpus.find((x) => String(x.page) === req.params.id);
    d ? res.json(d) : res.status(404).json({ error: 'Document not found.' });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Something went wrong.' }); });
  return app;
}

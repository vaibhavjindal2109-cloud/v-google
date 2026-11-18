# V-Google

Independent educational search project (not affiliated with Google). One query, two rankers over the same documents:

- **Classic** (red): keyword frequency. Score = title 0.40 + body frequency (log-scaled) 0.30 + density 0.20 + exact phrase 0.10, normalised to 0-100. Stuffing is flagged separately. An experimental historical-style model, not a reconstruction of any real algorithm.
- **Modern** (green): BM25 0.30, PageRank 0.25, title 0.15, content quality 0.10, query match 0.10, source quality 0.05, freshness 0.05. Missing factors (e.g. freshness, which the corpus lacks) are shown as "no data" and their weight is redistributed. Stuffing halves the score. PageRank is iterated (d = 0.85) over the real `links_to` graph.

Dataset: `backend/data/documents.json` (the six demo documents, unmodified). Documents have no title field, so the domain words act as a title proxy.

## Run
Needs Node 20.6 or newer. From this folder:
```
npm run dev
```
That installs dependencies on first run, creates `backend/.env` if missing, and starts the API (:3001) and the site (:5173). Open http://localhost:5173. To enable live web search, paste your `SERPAPI_KEY` into `backend/.env` and restart. Tests: `npm test`.

## API
`GET /api/health`, `/api/search?q=`, `/api/search/classic?q=`, `/api/search/modern?q=`, `/api/search/compare?q=`, `/api/search/suggestions?q=`, `/api/documents`, `/api/documents/:id`

## Live web search
`GET /api/web/search` fetches 10 results per page from SerpApi's Google engine (`SERPAPI_KEY`, cached 10 min, deduplicated, http/https links only, safe search on by default) and runs both rankers over those same results. V-Google does not crawl or index them. With no link graph, PageRank is reported as "no data"; Modern instead uses the provider's rank position as a labelled stand-in for authority, and BM25 over title plus snippet. Switch providers by adding an entry in `services/webSearch.js`.

## Not built yet
Image Search, AI Mode, Ranking Lab page, typo correction, pagination/sorting/domain filters, deployment guide. These need provider keys or more build time and are deliberately absent rather than faked.

## Deploy
`cd frontend && npm run build`, serve `dist/` statically, run the backend with `npm start` and set `CORS_ORIGIN` (see `.env.example`).

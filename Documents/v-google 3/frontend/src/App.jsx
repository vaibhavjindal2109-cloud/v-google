import { useState, useEffect } from 'react';

const SAMPLES = ['pizza', 'pune food', 'pizza recipes', 'canteen'];
const LETTERS = [['V', '#4285F4'], ['-', '#9BA3AE'], ['G', '#4285F4'], ['o', '#EA4335'], ['o', '#FBBC05'], ['g', '#4285F4'], ['l', '#34A853'], ['e', '#EA4335']];

const Wordmark = ({ small }) => (
  <span className={small ? 'wm sm' : 'wm'}>{LETTERS.map(([c, col], i) => <span key={i} style={{ color: col }}>{c}</span>)}</span>
);

function Hl({ text, terms }) {
  if (!terms.length) return text;
  return text.split(new RegExp(`(${terms.join('|')})`, 'gi')).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

function Result({ r, mode, terms, row, showDiff, web }) {
  const move = row && row.change !== 0 ? (mode === 'modern' ? row.change : -row.change) : 0;
  return (
    <li className="result">
      <div className="top">
        <span className="rank">#{r.rank}</span>
        <a href={r.url} target="_blank" rel="noopener noreferrer">{web ? r.title : r.url.replace(/^https?:\/\//, '')}</a>
        <span className="score">{r.score}</span>
      </div>
      <p className="snippet"><Hl text={r.text} terms={terms} /></p>
      <div className="meta">
        {web && <span>{new URL(r.url).hostname}</span>}
        <span className={`verdict ${r.spam ? 'warn' : ''}`}>{r.verdict}</span>
        {mode === 'classic'
          ? <span>{r.keywordFrequency} hits · {(r.keywordDensity * 100).toFixed(0)}% density · title {r.titleMatch ? 'match' : 'no match'}</span>
          : <span>BM25 {r.bm25Score} · {r.providerRank != null ? `Provider rank #${r.providerRank}` : `PageRank ${r.pagerankScore ?? 'n/a'}`}</span>}
        {showDiff && row && row.driver !== 'stable' && (
          <span className={`shift ${move > 0 ? 'up' : 'down'}`}>
            {mode === 'modern' ? (move > 0 ? `up ${move} ${row.driver === 'links' ? 'via links' : 'on relevance signals'}` : `down ${-move}, keyword repetition discounted`)
              : (move > 0 ? `up ${move} thanks to keyword repetition` : `down ${-move} vs Modern`)}
          </span>
        )}
      </div>
      <details>
        <summary>Why this result?</summary>
        <table><tbody>
          {r.factors.map((f) => (
            <tr key={f.name}><td>{f.name}</td><td>{f.value ?? 'no data'}</td><td>weight {(f.weight * 100).toFixed(0)}%</td></tr>
          ))}
        </tbody></table>
        <p>{r.explanation}</p>
      </details>
    </li>
  );
}

export default function App() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [state, setState] = useState('idle');
  const [tab, setTab] = useState('classic');
  const [source, setSource] = useState('demo');
  const [page, setPage] = useState(1);
  const [diff, setDiff] = useState(false);
  const [sugg, setSugg] = useState([]);
  const [trend, setTrend] = useState({ status: 'loading' });
  const [ex, setEx] = useState(null);
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('vg-history')) || []; } catch { return []; } });

  useEffect(() => {
    fetch('/api/examples').then((r) => r.json()).then(setEx).catch(() => {});
    fetch('/api/trending?geo=IN&limit=100').then(async (r) => {
      const j = await r.json();
      setTrend(r.ok ? { status: 'ok', ...j } : { status: r.status === 503 ? 'off' : 'error', message: j.message || j.error });
    }).catch(() => setTrend({ status: 'error', message: 'Backend not reachable.' }));
  }, []);

  useEffect(() => {
    if (!input.trim()) return setSugg([]);
    const t = setTimeout(() => fetch(`/api/search/suggestions?q=${encodeURIComponent(input)}`).then((r) => r.json()).then((j) => setSugg(j.suggestions || [])).catch(() => setSugg([])), 200);
    return () => clearTimeout(t);
  }, [input]);

  async function run(q, pg = 1, src = source) {
    q = q.trim();
    if (!q) return;
    setInput(q); setQuery(q); setSugg([]); setPage(pg); setState('loading');
    const h = [q, ...history.filter((x) => x !== q)].slice(0, 8);
    setHistory(h);
    try { localStorage.setItem('vg-history', JSON.stringify(h)); } catch { /* storage unavailable */ }
    try {
      const enc = encodeURIComponent(q);
      const res = await fetch(src === 'web' ? `/api/web/search?q=${enc}&page=${pg}` : `/api/search/compare?q=${enc}`);
      const txt = await res.text();
      let j = null;
      try { j = JSON.parse(txt); } catch { /* empty or non-JSON body */ }
      if (!j) throw new Error('The backend did not respond. It may have crashed: check the terminal running npm run dev for an error.');
      if (!res.ok) throw new Error(j.error || j.message || 'Search failed.');
      setData(j); setState('done');
    } catch (e) { setData({ error: e instanceof TypeError ? 'Cannot reach the backend on port 3001.' : e.message }); setState('error'); }
  }

  const pick = (s) => { setSource(s); if (query) run(query, 1, s); };
  const sourceToggle = (
    <div className="src" role="group" aria-label="Search source">
      <button className={source === 'demo' ? 'on' : ''} onClick={() => pick('demo')}>Demo corpus</button>
      <button className={source === 'web' ? 'on' : ''} onClick={() => pick('web')}>Live web</button>
    </div>
  );
  const rows = data?.rows ? Object.fromEntries(data.rows.map((r) => [r.id, r])) : {};
  const searchBox = (
    <form className="box" onSubmit={(e) => { e.preventDefault(); run(input); }}>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search anything on V-Google..." aria-label="Search" autoFocus />
      {input && <button type="button" className="ghost" onClick={() => { setInput(''); setSugg([]); }} aria-label="Clear search">Clear</button>}
      <button type="submit" className="go">Search</button>
      {sugg.length > 0 && <ul className="sugg">{sugg.map((s) => <li key={s}><button type="button" onClick={() => run(s)}>{s}</button></li>)}</ul>}
    </form>
  );

  if (state === 'idle') return (
    <main className="home">
      <Wordmark />
      <p className="by">Created by Vaibhav</p>
      <p className="lead">Search differently. Understand better.</p>
      {searchBox}
      {sourceToggle}
      <p className="try">Try: {SAMPLES.map((s) => <button key={s} className="link" onClick={() => run(s)}>{s}</button>)}</p>
      {history.length > 0 && <p className="try">Recent: {history.map((s) => <button key={s} className="link" onClick={() => run(s)}>{s}</button>)}
        <button className="link muted" onClick={() => { setHistory([]); try { localStorage.removeItem('vg-history'); } catch { /* ignore */ } }}>clear history</button></p>}
      {ex && <section className="examples">
        <h3>Demo corpus</h3>
        <p className="dim">Six sample sites. Pick one to search by its name, or try an example query.</p>
        <div className="chips">{ex.demoDomains.map((d) => <button key={d.id} onClick={() => run(d.query)}>{d.url.replace('http://', '')}</button>)}</div>
        <div className="chips">{ex.queries.map((q) => <button key={q} className="q" onClick={() => run(q)}>{q}</button>)}</div>
      </section>}
      <section className="examples">
        <h3>Top 100 trending on Google (India, last 24h)</h3>
        {trend.status === 'loading' && <p className="dim">Loading…</p>}
        {(trend.status === 'off' || trend.status === 'error') && <p className="dim">{trend.message}</p>}
        {trend.status === 'ok' && <>
          <p className="dim">{trend.source}. Choose Live web above to search these; the demo corpus only covers food topics.</p>
          <ol className="trend">{trend.items.map((t) => (
            <li key={t.rank}><button onClick={() => run(t.query)}><span className="n">{t.rank}</span>{t.query}{t.searchVolume != null && <span className="vol">{t.searchVolume.toLocaleString('en-IN')}+</span>}</button></li>))}</ol>
        </>}
      </section>
      <footer>One Search. Two Generations. Better Discovery. · Independent educational project, not affiliated with Google.</footer>
    </main>
  );

  const col = (mode, title, sub, results) => (
    <section className={`col ${mode} ${tab === mode ? 'on' : ''}`}>
      <header><h2>{title}</h2><p>{sub}</p></header>
      {results.length === 0 ? <p className="empty">No documents contain these terms. Try a sample query such as "pizza".</p>
        : <ol>{results.map((r) => <Result key={r.id} r={r} mode={mode} terms={data.terms} row={rows[r.id]} showDiff={diff} web={data.source === 'web'} />)}</ol>}
    </section>
  );

  return (
    <main className="results">
      <div className="bar"><button className="logo" onClick={() => setState('idle')}><Wordmark small /></button>{searchBox}
        <button className={`diff ${diff ? 'active' : ''}`} onClick={() => setDiff(!diff)} aria-pressed={diff}>See the difference</button>{sourceToggle}</div>
      {state === 'loading' && <p className="status">Searching…</p>}
      {state === 'error' && <p className="status err">{data.error}</p>}
      {state === 'done' && <>
        <p className="notice">{data.notice}</p>
        {diff && <div className="explain">{data.notes.length ? data.notes.map((n) => <p key={n}>{n}</p>) : <p>Both engines agree on this query; nothing moved.</p>}</div>}
        <div className="tabs" role="tablist">
          <button className={tab === 'classic' ? 'on c' : ''} onClick={() => setTab('classic')}>Classic</button>
          <button className={tab === 'modern' ? 'on m' : ''} onClick={() => setTab('modern')}>Modern</button>
        </div>
        <div className="cols">
          {col('classic', 'Classic search', 'Traditional keyword frequency', data.classic)}
          {col('modern', 'Modern search', 'Relevance + PageRank-inspired ranking', data.modern)}
        </div>
        {data.source === 'web' && <div className="pager">
          <button disabled={page <= 1} onClick={() => run(query, page - 1)}>Previous</button><span>Page {page}</span>
          <button disabled={page >= 10} onClick={() => run(query, page + 1)}>Next</button></div>}
      </>}
    </main>
  );
}

import { useCallback, useEffect, useState } from 'react';

import Nav from './views/Nav.jsx';
import Overview from './views/Overview.jsx';
import Instruments from './views/Instruments.jsx';
import Meta from './views/Meta.jsx';
import Config from './views/Config.jsx';

const API = 'http://127.0.0.1:8765/api';

/* The only fetches in the app. /api/config says whether the framework has been
   set up; until it has, /api/results has nothing to serve and the first-run
   form is shown instead. Results are read once and handed down as props under
   the backend's own field names — nothing is renamed, and no component fetches
   anything itself. */
export default function Terminal() {
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pf, setPf] = useState('meta');
  const [tab, setTab] = useState('overview');
  const [win, setWin] = useState('1Y');
  const [settings, setSettings] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const cfg = await fetch(API + '/config').then((r) => r.json());
      setMeta(cfg);
      if (!cfg.configured) return setData(null);

      const res = await fetch(API + '/results');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  /* Returns the backend's complaints, or null once it has saved and rebuilt. */
  const save = useCallback(async (payload) => {
    try {
      const res = await fetch(API + '/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) return body.errors ?? ['Save failed.'];
    } catch (e) {
      return ['Could not reach the backend — ' + e.message];
    }
    setSettings(false);
    setData(null);
    await load();
    return null;
  }, [load]);

  useEffect(() => { load(); }, [load]);

  if (error && !meta) return <div className="page"><div className="notice">No backend at {API} — {error}</div></div>;
  if (!meta) return <div className="page"><div className="notice">Loading…</div></div>;

  if (!meta.configured) {
    return <Config meta={meta} onSave={save} portfolio={pf} />;
  }

  const names = data ? Object.keys(data.portfolios) : [];
  const isMeta = pf === 'meta';
  const view = data && !isMeta ? data.portfolios[pf] ?? data.portfolios[names[0]] : null;
  const shown = isMeta ? 'overview' : tab;

  return (
    <div className="page">
      <Nav
        data={isMeta && data ? { portfolio: data.meta } : view}
        win={win} tab={shown} setTab={setTab} onSettings={() => setSettings(true)}
        portfolios={[['meta', 'Meta — all portfolios'],
                     ...names.map((n) => [n, data.portfolios[n].label])]}
        selected={pf} setSelected={setPf} isMeta={isMeta}
      />
      {!data && !error && <div className="notice">Loading…</div>}
      {error && <div className="notice">No results — {error}</div>}
      {data && isMeta && <Meta data={data} win={win} />}
      {view && shown === 'overview' && <Overview data={view} win={win} />}
      {view && shown === 'instruments' && <Instruments data={view} win={win} setWin={setWin} />}

      {settings && (
        <Config meta={meta} onSave={save} onClose={() => setSettings(false)} portfolio={pf} />
      )}
    </div>
  );
}

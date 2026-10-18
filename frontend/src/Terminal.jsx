import { useEffect, useState } from 'react';

import Nav from './views/Nav.jsx';
import Overview from './views/Overview.jsx';
import Instruments from './views/Instruments.jsx';

const API_URL = 'http://127.0.0.1:8765/api/results';

/* The only fetch in the app. The results dictionary is read once and handed
   down as props under the backend's own field names — nothing is renamed, and
   no component fetches anything itself. */
export default function Terminal() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [win, setWin] = useState('1Y');

  useEffect(() => {
    fetch(API_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <Nav data={data} win={win} tab={tab} setTab={setTab} />
      {!data && !error && <div className="notice">Loading…</div>}
      {error && <div className="notice">No data from {API_URL} — {error}</div>}
      {data && tab === 'overview' && <Overview data={data} win={win} />}
      {data && tab === 'instruments' && <Instruments data={data} win={win} setWin={setWin} />}
    </div>
  );
}

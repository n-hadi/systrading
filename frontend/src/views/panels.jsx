import { useState } from 'react';
import { ComposedChart, BarChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';

import { CO, nn, f, windowRange, rows } from '../lib/format.js';
import { AXIS, MARGIN, TOOLTIP, CURVE, shortDate } from '../lib/rc.js';

/* The backend stores each pair under one of the two orderings. */
const pairAt = (pairs, a, b) => pairs[a + ' / ' + b] || pairs[b + ' / ' + a] || null;

const fmtCorr = (v) => (nn(v) ? (v >= 0 ? '' : '−') + Math.abs(v).toFixed(2) : '—');

function cellColour(v) {
  if (!nn(v)) return { bg: 'rgba(233,233,237,.03)', edge: 'rgba(233,233,237,.06)' };
  const m = Math.min(1, Math.abs(v));
  const stops = v >= 0
    ? [[30, 32, 51], [40, 40, 64], [51, 47, 88], [63, 56, 112]]
    : [[30, 32, 51], [36, 39, 50], [44, 48, 60], [54, 59, 72]];
  const x = m * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), fr = x - i;
  const rgb = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * fr));
  return { bg: 'rgb(' + rgb.join(',') + ')', edge: v >= 0 ? 'rgba(145,132,217,.25)' : 'rgba(147,151,171,.2)' };
}

/* One panel for both correlation views: instrument pairs on the overview, rule
   signals on the instrument tab. `sources` holds one entry per selectable input;
   a single entry hides the source toggle. The correlation windows (20/60/120)
   are estimation lookbacks set in correlations.py, not display ranges — they
   are deliberately independent of the window selector. */
export function CorrPanel({ sources, keys, width, chartW, bars, expandable }) {
  const [srcKey, setSrcKey] = useState(sources[0].key);
  const [view, setView] = useState('matrix');
  const [corrWin, setCorrWin] = useState(60);
  const [pick, setPick] = useState('Average');
  const [open, setOpen] = useState(false);

  const src = sources.find((s) => s.key === srcKey) || sources[0];
  const { Date: dates, pairs: allPairs, average: allAvg } = src.corr;
  const [i0, i1] = windowRange(dates.length, bars);
  const pairs = allPairs[corrWin] || {};
  const average = allAvg[corrWin] || [];
  const pairKeys = Object.keys(pairs);
  const ink = (k) => [CO.a4, CO.a6, CO.n6, CO.a7, CO.a5, CO.n7][Math.max(0, pairKeys.indexOf(k)) % 6];
  const shown = pick === 'Average' ? average : (pairs[pick] || []);
  const cellH = open ? 92 : 46;

  return (
    <>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <div className={'panel' + (open ? ' open' : '')} style={open ? undefined : { width }}>
        <div className="panel-head inset" style={{ justifyContent: 'flex-end' }}>
          <span className="title">{src.title}</span>
          {sources.length > 1 && (
            <div className="pillbox">
              {sources.map((s) => (
                <button
                  key={s.key} title={s.note} onClick={() => setSrcKey(s.key)}
                  className={'pill glyph' + (srcKey === s.key ? ' on' : '')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <div className="pillbox">
            {[{ k: 'matrix', label: '⊞', title: 'Matrix' },
              { k: 'history', label: '∿', title: 'Rolling history' }].map((o) => (
                <button
                  key={o.k} title={o.title} onClick={() => setView(o.k)}
                  className={'pill glyph' + (view === o.k ? ' on' : '')}
                >
                  {o.label}
                </button>
              ))}
          </div>
          <span className="grow" />
          {view === 'history' && (
            <select className="select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pair">
              <option value="Average">Average of all pairs</option>
              {pairKeys.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <div style={{ flexBasis: '100%', display: 'flex', justifyContent: 'flex-end', marginRight: expandable ? -28 : 0 }}>
            <div className="pillbox">
              {Object.keys(allPairs).map(Number).map((n) => (
                <button key={n} className={'pill' + (corrWin === n ? ' on' : '')} onClick={() => setCorrWin(n)}>{n}d</button>
              ))}
            </div>
          </div>
          {expandable && (
            <button className="expand-btn" title="Expand" onClick={() => setOpen(!open)}>
              {open ? '⤡' : '⤢'}
            </button>
          )}
        </div>

        {view === 'matrix' && (
          <div
            className="matrix"
            style={{ gridTemplateColumns: (open ? 'minmax(80px,120px)' : '66px') + ` repeat(${keys.length}, minmax(0,1fr))` }}
          >
            <div />
            {keys.map((k) => <div className="matrix-col" key={k}>{k}</div>)}
            {keys.map((a, ri) => [
              <div className="matrix-row-label" key={a} style={{ height: cellH }}>{a}</div>,
              ...keys.map((b, ci) => {
                const diag = ci === ri;
                const upper = ci > ri;
                const series = pairAt(pairs, a, b);
                const v = diag ? 1 : (series ? series[i1] : null);
                const sc = cellColour(v);
                return (
                  <div
                    className="matrix-cell" key={a + b}
                    style={{
                      height: cellH,
                      color: diag ? CO.dim : CO.text,
                      background: upper ? 'rgba(233,233,237,.025)' : (diag ? 'rgba(233,233,237,.04)' : sc.bg),
                      boxShadow: 'inset 0 0 0 1px '
                        + (upper ? 'rgba(233,233,237,.05)' : (diag ? 'rgba(233,233,237,.07)' : sc.edge)),
                    }}
                  >
                    {upper ? '' : (diag ? '1.00' : fmtCorr(v))}
                  </div>
                );
              }),
            ])}
          </div>
        )}

        {view === 'history' && (
          <ComposedChart
            width={open ? 1136 : chartW} height={open ? 300 : 236} margin={MARGIN}
            data={rows(dates, { shown, average }, i0, i1)}
          >
            <CartesianGrid stroke="rgba(233,233,237,.07)" />
            <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
            <YAxis {...AXIS} width={36} domain={[-1, 1]} tickFormatter={(v) => v.toFixed(1)} />
            <Tooltip {...TOOLTIP} formatter={(v) => (nn(v) ? v.toFixed(2) : '—')} />
            <ReferenceLine y={0.5} stroke={CO.n7} strokeDasharray="2 4" />
            <ReferenceLine y={-0.5} stroke={CO.n7} strokeDasharray="2 4" />
            {pick !== 'Average' && (
              <Line name="Average" dataKey="average" stroke={CO.a8} strokeWidth={1} strokeDasharray="3 3" {...CURVE} />
            )}
            <Area
              name={pick} dataKey="shown" fill="rgba(145,132,217,.14)"
              stroke={pick === 'Average' ? CO.a3 : ink(pick)} strokeWidth={1.6} {...CURVE}
            />
          </ComposedChart>
        )}

        <div className="stats" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
          <div>
            <div className="stat-k">Average pairwise corr</div>
            <div style={{ fontSize: 17, fontWeight: 500, marginTop: 2, color: CO.a3 }}>{fmtCorr(average[i1])}</div>
          </div>
          <span className="note">{corrWin}d window · {src.note}</span>
        </div>
      </div>
    </>
  );
}

const pctLabel = (v) => (nn(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + (Math.abs(v) * 100).toFixed(2) + '%' : '—');

/* One panel for both return distributions. Every number comes from the
   backend's distributions block — no binning or moments are computed here.
   `sources` mirrors CorrPanel: one entry hides the toggle. */
export function HistPanel({ sources, windows, width, chartW, note }) {
  const [srcKey, setSrcKey] = useState(sources[0].key);
  const [win, setWin] = useState(windows.includes('3M') ? '3M' : windows[0]);

  const src = sources.find((s) => s.key === srcKey) || sources[0];
  const d = src.dist[win] || { counts: [], centres: [], n: 0 };

  const tiles = [
    { k: 'Bars', v: String(d.n ?? 0) },
    { k: 'Mean', v: pctLabel(d.mean) },
    { k: 'Daily σ', v: nn(d.sd) ? (d.sd * 100).toFixed(2) + '%' : '—' },
    { k: 'Annualised σ', v: f.pct(d.annualised_sd, 1) },
    { k: 'Skew', v: f.sgn(d.skew, 2) },
    { k: 'Excess kurtosis', v: f.sgn(d.excess_kurtosis, 2) },
    { k: '5th pct', v: pctLabel(d.p05) },
    { k: '95th pct', v: pctLabel(d.p95) },
    { k: 'Win rate', v: f.pct(d.win_rate, 0) },
  ];

  return (
    <div className="panel" style={{ width }}>
      <div className="panel-head">
        <span className="title">Return distribution</span>
        <span className="note">{d.counts.length} bins · {note}</span>
        <span className="grow" />
        {sources.length > 1 && (
          <div className="pillbox">
            {sources.map((s) => (
              <button
                key={s.key} title={s.note} onClick={() => setSrcKey(s.key)}
                className={'pill glyph' + (srcKey === s.key ? ' on' : '')}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="pillbox">
          {windows.map((w) => (
            <button key={w} className={'pill' + (win === w ? ' on' : '')} onClick={() => setWin(w)}>{w}</button>
          ))}
        </div>
      </div>
      <BarChart
        width={chartW} height={212} margin={MARGIN}
        data={d.counts.map((count, i) => ({ label: pctLabel(d.centres[i]), count }))}
      >
        <CartesianGrid stroke="rgba(233,233,237,.07)" />
        <XAxis dataKey="label" {...AXIS} interval={3} />
        <YAxis {...AXIS} width={46} allowDecimals={false} />
        <Tooltip {...TOOLTIP} />
        <Bar dataKey="count" fill={CO.a6} isAnimationActive={false} />
      </BarChart>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {tiles.map((t) => (
          <div className="tile" key={t.k}>
            <div className="tile-k">{t.k}</div>
            <div className="tile-v">{t.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

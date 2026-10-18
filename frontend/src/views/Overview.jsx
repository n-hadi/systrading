import { useMemo, useState } from 'react';
import {
  LineChart, AreaChart, BarChart, Line, Area, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

import { CO, nn, f, PANEL_W, windowRange, rows } from '../lib/format.js';
import { AXIS, MARGIN, TOOLTIP, CURVE, shortDate, symDomain, activeIndex } from '../lib/rc.js';
import { CorrPanel, HistPanel } from './panels.jsx';

const Stats = ({ items, cols }) => (
  <div className="stats" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
    {items.map((s) => (
      <div key={s.k}>
        <div className="stat-k">{s.k}</div>
        <div className="stat-v" style={{ color: s.c || CO.text }}>{s.v}</div>
      </div>
    ))}
  </div>
);

/* Diverging fill for the forecast heatmap: the accent ramp for long, the
   neutral ramp for short, both capped dark enough for one light ink. */
function fcCell(v) {
  if (!nn(v)) return { bg: 'rgba(233,233,237,.03)', edge: 'rgba(233,233,237,.06)', dir: '—' };
  const c = Math.max(-20, Math.min(20, v)), m = Math.abs(c) / 20;
  const stops = c >= 0
    ? [[30, 32, 51], [38, 41, 66], [51, 46, 94], [67, 57, 140], [99, 80, 184]]
    : [[30, 32, 51], [38, 42, 55], [52, 58, 72], [70, 78, 95], [86, 94, 113]];
  const x = m * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), fr = x - i;
  const rgb = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * fr));
  return {
    bg: 'rgb(' + rgb.join(',') + ')',
    edge: c >= 0 ? 'rgba(145,132,217,' + (0.2 + m * 0.45).toFixed(2) + ')' : 'rgba(147,151,171,.22)',
    dir: Math.abs(c) < 0.5 ? 'flat' : (c > 0 ? 'long' : 'short'),
  };
}

/* Shared date axis for several instruments at once. Instrument frames are
   different lengths and their dates diverge, so index i means a different day
   in each — the axis is the union of the selected series' own dates, and a
   series yields null on a day it has no bar. The chart breaks the line there.
   Nothing is shifted, filled or interpolated. */
function alignByDate(series) {
  const dates = [...new Set(series.flatMap((s) => s.dates))].sort();
  return {
    dates,
    values: series.map((s) => {
      const byDate = new Map(s.dates.map((d, i) => [d, s.values[i]]));
      return dates.map((d) => (byDate.has(d) ? byDate.get(d) : null));
    }),
  };
}

export default function Overview({ data, win }) {
  const [hover, setHover] = useState(null);
  const [fcDate, setFcDate] = useState(null);
  const [fcOpen, setFcOpen] = useState(false);
  const [fcWhich, setFcWhich] = useState('cfc');
  const [fcSel, setFcSel] = useState(null);
  const [pnlPick, setPnlPick] = useState('Total');

  const tickers = Object.keys(data.instruments);
  const pf = data.portfolio.dataframe;
  const params = data.portfolio.parameters;
  const stats = data.portfolio.stats[win];
  const volCol = 'return_vol_' + params.volatility_window;

  // Rule handles come from the backend, so a new rule needs no change here.
  const ruleNames = Object.keys(params.trading_rules);

  const [i0, i1] = windowRange(pf.Date.length, params.windows[win]);

  const frame = (t) => data.instruments[t].dataframe;
  const last = (t, col) => { const d = frame(t); return d[col] ? d[col][d.Date.length - 1] : null; };

  /* ── forecast heatmap: one bar, picked on the simulated date axis ────── */
  const fcIdx = fcDate ? Math.max(i0, pf.Date.findLastIndex((d, i) => i <= i1 && d <= fcDate)) : i1;
  const fcOn = pf.Date[fcIdx];
  const valueOn = (t, col) => {
    const d = frame(t);
    const j = d.Date.indexOf(fcOn);
    return j >= 0 && d[col] ? d[col][j] : null;
  };
  const fcCols = [
    ...ruleNames.map((r) => ({ label: r, weight: 'w ' + f.n(params.fc_weights[r], 2), col: 'fc_' + r })),
    { label: 'cfc', weight: '× ' + f.n(params.fc_div_mp, 2) + ' FDM', col: 'cfc' },
  ];
  const cellH = fcOpen ? 92 : 46;
  const stepFc = (n) => setFcDate(pf.Date[Math.max(i0, Math.min(i1, fcIdx + n))]);

  /* ── forecast history: several instruments on one date axis ─────────── */
  const fcInk = (k) => [CO.a3, CO.a4, CO.a6, CO.n6][k % 4];
  const sel = fcSel || tickers;
  const picked = tickers.map((t, k) => ({ t, k })).filter(({ t }) => sel.includes(t));
  const aligned = useMemo(
    () => alignByDate(picked.map(({ t }) => ({ dates: frame(t).Date, values: frame(t)[fcWhich] }))),
    [data, fcWhich, sel.join()],
  );
  const [a0, a1] = windowRange(aligned.dates.length, params.windows[win]);

  /* Share of total exposure — one division of two numbers already on screen. */
  const totalExposure = tickers.reduce((acc, t) => acc + Math.abs(last(t, 'exposure') || 0), 0);

  const pnlSeries = pnlPick === 'Total' ? pf.pf_pnl : pf['pnl_' + pnlPick];
  const cumRows = Object.entries(stats.pnl_by_instrument)
    .map(([ticker, value]) => ({ ticker, value }))
    .sort((a, b) => b.value - a.value);
  const cumMax = Math.max(...cumRows.map((r) => Math.abs(r.value)), 1);
  const anyNeg = cumRows.some((r) => r.value < 0);
  // trades are sent newest first; keep the ones inside the selected window
  const trades = data.trades.filter((t) => t.date >= pf.Date[i0]);
  const util = (pf.realized_vol[i1] || 0) / params.volatility_target;

  /* Recharts reports the hovered bar as an index into the sliced rows, so it is
     offset by i0 to address the full series. syncMethod 'value' matches the
     other charts on the Date itself rather than on position. */
  const ev = useMemo(() => ({
    syncId: 'pf',
    syncMethod: 'value',
    onMouseMove: (st) => { const k = activeIndex(st); if (k !== null) setHover(i0 + k); },
    onMouseLeave: () => setHover(null),
  }), [i0]);

  const chartRows = useMemo(() => ({
    capital: rows(pf.Date, { capital: pf.capital }, i0, i1),
    exposure: rows(pf.Date, { pf_exposure: pf.pf_exposure }, i0, i1),
    drawdown: rows(pf.Date, { drawdown_pct: pf.drawdown_pct }, i0, i1),
    pvol: rows(pf.Date, { realized_vol: pf.realized_vol }, i0, i1),
  }), [pf, i0, i1]);
  const pnlRows = useMemo(() => rows(pf.Date, { pnl: pnlSeries }, i0, i1), [pf, pnlSeries, i0, i1]);
  const fcRows = useMemo(
    () => rows(aligned.dates, Object.fromEntries(picked.map((p, k) => [p.t, aligned.values[k]])), a0, a1),
    [aligned, a0, a1, sel.join()],
  );

  /* The charts do not read `hover` — Recharts syncs its own crosshair through
     syncId — so each is memoised and skips re-rendering while the mouse moves. */
  const fcChart = useMemo(() => (
    <LineChart width={PANEL_W.fchist - 26} height={248} margin={MARGIN} data={fcRows}>
      <CartesianGrid stroke="rgba(233,233,237,.07)" />
      <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
      <YAxis {...AXIS} width={30} domain={symDomain} tickFormatter={(v) => f.n(v, 0)} />
      <Tooltip {...TOOLTIP} formatter={(v) => f.sgn(v, 1)} />
      <ReferenceLine y={10} stroke={CO.n7} strokeDasharray="2 3" />
      <ReferenceLine y={-10} stroke={CO.n7} strokeDasharray="2 3" />
      {picked.map((p) => (
        <Line key={p.t} dataKey={p.t} stroke={fcInk(p.k)} strokeWidth={fcWhich === 'cfc' ? 1.2 : 1} {...CURVE} />
      ))}
    </LineChart>
  ), [fcRows, picked, fcWhich]);

  const capitalChart = useMemo(() => (
    <LineChart width={PANEL_W.capital - 26} height={236} margin={MARGIN} {...ev} data={chartRows.capital}>
      <CartesianGrid stroke="rgba(233,233,237,.07)" />
      <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
      <YAxis {...AXIS} width={54} tickFormatter={f.cash} />
      <Tooltip {...TOOLTIP} formatter={(v) => f.money(v)} />
      <Line dataKey="capital" stroke={CO.a3} strokeWidth={1.4} {...CURVE} />
    </LineChart>
  ), [chartRows, ev]);

  const exposureChart = useMemo(() => (
    <AreaChart width={PANEL_W.exposure - 26} height={212} margin={MARGIN} {...ev} data={chartRows.exposure}>
      <CartesianGrid stroke="rgba(233,233,237,.07)" />
      <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
      <YAxis {...AXIS} width={52} tickFormatter={f.cash} />
      <Tooltip {...TOOLTIP} formatter={(v) => f.cash(v, true)} />
      <Area dataKey="pf_exposure" stroke={CO.a5} strokeWidth={1.2} fill="rgba(93,82,148,.2)" {...CURVE} />
    </AreaChart>
  ), [chartRows, ev]);

  const pnlChart = useMemo(() => (
    <BarChart width={PANEL_W.pnl - 26} height={232} margin={MARGIN} {...ev} data={pnlRows}>
      <CartesianGrid stroke="rgba(233,233,237,.07)" />
      <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
      <YAxis {...AXIS} width={62} domain={symDomain} tickFormatter={f.cash} />
      <Tooltip {...TOOLTIP} formatter={(v) => f.cash(v, true)} />
      <Bar name={pnlPick} dataKey="pnl" isAnimationActive={false}>
        {pnlRows.map((r, k) => <Cell key={k} fill={(r.pnl || 0) >= 0 ? CO.a4 : CO.a7} />)}
      </Bar>
    </BarChart>
  ), [pnlRows, pnlPick, ev]);

  const drawdownChart = useMemo(() => (
    <AreaChart width={PANEL_W.dd - 26} height={226} margin={MARGIN} {...ev} data={chartRows.drawdown}>
      <CartesianGrid stroke="rgba(233,233,237,.07)" />
      <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
      <YAxis {...AXIS} width={44} domain={['dataMin', 0]} tickFormatter={(v) => (v * 100).toFixed(1) + '%'} />
      <Tooltip {...TOOLTIP} formatter={(v) => f.pct(v, 1)} />
      <Area dataKey="drawdown_pct" stroke={CO.a3} strokeWidth={1.6} fill="rgba(145,132,217,.12)" {...CURVE} />
    </AreaChart>
  ), [chartRows, ev]);

  const pvolChart = useMemo(() => (
    <AreaChart width={PANEL_W.pvol - 26} height={226} margin={MARGIN} {...ev} data={chartRows.pvol}>
      <CartesianGrid stroke="rgba(233,233,237,.07)" />
      <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
      <YAxis
        {...AXIS} width={42} tickFormatter={(v) => (v * 100).toFixed(0) + '%'}
        domain={[0, Math.max(params.volatility_target, ...pf.realized_vol.slice(i0, i1 + 1).filter(nn)) * 1.1]}
      />
      <Tooltip {...TOOLTIP} formatter={(v) => f.pct(v, 1)} />
      <ReferenceLine
        y={params.volatility_target} stroke={CO.a3} strokeDasharray="4 3"
        label={{ value: 'target ' + f.pct(params.volatility_target, 0), position: 'insideTopRight', fill: CO.a3, fontSize: 8 }}
      />
      <Area dataKey="realized_vol" stroke={CO.a4} strokeWidth={1.3} fill="rgba(93,82,148,.16)" {...CURVE} />
    </AreaChart>
  ), [chartRows, params, ev]);

  return (
    <div>
      {/* ── metric cards ───────────────────────────────────────────── */}
      <div className="cards">
        <div className="card">
          <div className="card-label">Capital</div>
          <div className="card-value">{f.money(pf.capital[i1])}</div>
        </div>

        <div className="card">
          <div className="card-label">Portfolio P&L</div>
          <div className="card-value">{f.cash(stats.pnl, true)}</div>
          <div className="card-sub">last bar {f.cash(pf.pf_pnl[i1], true)}</div>
        </div>

        <div className="card">
          <div className="card-label">Portfolio&nbsp;exposure</div>
          <div className="card-value">{f.cash(pf.pf_exposure[i1], true)}</div>
          <div className="card-sub">{pf.pf_exposure[i1] >= 0 ? 'long' : 'short'}</div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 11, height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-label">Realised vs vol target</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                <span className="card-value" style={{ marginTop: 0, color: CO.a3 }}>{f.pct(pf.realized_vol[i1], 1)}</span>
                <span style={{ fontSize: 12, color: CO.n7 }}>/</span>
                <span style={{ fontSize: 13, color: CO.dim }}>{f.pct(params.volatility_target, 0)}</span>
              </div>
              <div className="grow" />
              <div className="note">252d annualised</div>
            </div>
            <div className="grow" />
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
              <div style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                fontSize: 7.5, letterSpacing: '.06em', color: CO.n7, textAlign: 'right',
              }}>
                <span>{f.pct(params.volatility_target * 2, 0)}</span>
                <span style={{ color: CO.dim }}>{f.pct(params.volatility_target, 0)}</span>
                <span>0</span>
              </div>
              <div className="bullet-track">
                <div
                  className="bullet-fill"
                  style={{ background: util > 1 ? CO.a4 : CO.a7, height: Math.min(100, (util / 2) * 100).toFixed(1) + '%' }}
                />
                <div className="bullet-mark" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-label">Daily cash vol tgt</div>
          <div className="card-value">{f.money(pf.daily_cash_vol_target[i1])}</div>
          <div className="card-sub">cash × τ ÷ √252</div>
        </div>

        <div className="card">
          <div className="card-label">Trading fees</div>
          <div className="card-value">{f.cash(-stats.cost)}</div>
          <div className="card-sub">{stats.trades} trades @ ${params.fee_per_trade.toFixed(2)}</div>
        </div>
      </div>

      {/* ── forecast state · forecast history · correlation ─────────── */}
      <div className="row">
        {fcOpen && <div className="backdrop" onClick={() => setFcOpen(false)} />}
        <div className={'panel' + (fcOpen ? ' open' : '')} style={fcOpen ? undefined : { width: PANEL_W.fc }}>
          <div className="panel-head inset">
            <span className="title">Forecast state</span>
            <span className="note">capped ±20</span>
            <span className="grow" />
            <div className="stepper">
              <button className="step-btn" onClick={() => stepFc(-1)} disabled={fcIdx <= i0} aria-label="Previous bar">‹</button>
              <input
                className="date-input" type="date" aria-label="Forecast date" value={fcOn || ''}
                min={pf.Date[i0]} max={pf.Date[i1]} onChange={(e) => setFcDate(e.target.value || null)}
              />
              <button className="step-btn" onClick={() => stepFc(1)} disabled={fcIdx >= i1} aria-label="Next bar">›</button>
            </div>
            <button className="expand-btn" title="Expand" onClick={() => setFcOpen(!fcOpen)}>
              {fcOpen ? '⤡' : '⤢'}
            </button>
          </div>
          <div
            className="matrix"
            style={{
              gridTemplateColumns: (fcOpen ? 'minmax(120px,200px)' : '96px')
                + ` repeat(${fcCols.length}, minmax(0,1fr))`,
            }}
          >
            <div />
            {fcCols.map((c) => (
              <div key={c.label} style={{ textAlign: 'center', paddingBottom: 3 }}>
                <div className="matrix-col">{c.label}</div>
                <div style={{ fontSize: 8, letterSpacing: '.06em', color: CO.n7, marginTop: 1 }}>{c.weight}</div>
              </div>
            ))}
            {tickers.map((t) => [
              <div className="heat-name" key={t} style={{ height: cellH }}>
                <div>
                  <div className="ticker sm">{t}</div>
                  <div className="subname sm">{data.instruments[t].name}</div>
                </div>
              </div>,
              ...fcCols.map((c, k) => {
                const v = valueOn(t, c.col);
                const s = fcCell(v);
                return (
                  <div
                    className="heat-cell" key={t + c.label}
                    style={{
                      height: cellH, background: s.bg, boxShadow: 'inset 0 0 0 1px ' + s.edge,
                      outline: k === fcCols.length - 1 ? '1px solid rgba(210,206,253,.35)' : undefined,
                      outlineOffset: -1,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <span className="heat-v">{nn(v) ? (v > 0 ? '+' : '') + v.toFixed(1) : '—'}</span>
                      <span className="heat-dir">{s.dir}</span>
                    </div>
                  </div>
                );
              }),
            ])}
          </div>
        </div>

        <div className="panel" style={{ width: PANEL_W.fchist }}>
          <div className="panel-head">
            <span className="title">Forecast history</span>
            <span className="note">aligned on dates · capped ±20</span>
            <span className="grow" />
            <div className="pillbox">
              {[...ruleNames.map((r) => ['fc_' + r, r]), ['cfc', 'cfc']].map(([col, label]) => (
                <button key={col} className={'pill' + (fcWhich === col ? ' on' : '')} onClick={() => setFcWhich(col)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {fcChart}
          <div className="stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span className="readout-label" style={{ marginBottom: 0, marginRight: 2 }}>Instruments</span>
            {tickers.map((t, k) => {
              const on = sel.includes(t);
              return (
                <button
                  key={t} className={'swatch' + (on ? ' on' : '')}
                  onClick={() => setFcSel(on ? sel.filter((x) => x !== t) : [...sel, t])}
                >
                  <span className="swatch-dot narrow" style={{ background: on ? fcInk(k) : CO.n8 }} />
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <CorrPanel
          width={PANEL_W.corr} chartW={PANEL_W.corr - 26} bars={params.windows[win]} keys={tickers} expandable
          sources={[
            { key: 'returns', label: '%', title: 'Correlation', note: 'close returns', corr: data.portfolio.returns_corr_histories },
            { key: 'cfc', label: 'CFC', title: 'Correlation', note: 'combined forecasts', corr: data.portfolio.cfc_corr_histories },
          ]}
        />
      </div>

      {/* ── summary · last trades ──────────────────────────────────── */}
      <div className="row">
        <div className="panel" style={{ width: PANEL_W.summary }}>
          <div className="panel-head baseline" style={{ marginBottom: 8 }}>
            <span className="title">Summary</span>
            <span className="note">latest bar · contracts held</span>
            <span className="grow" />
            <span className="note">share = % of total exposure</span>
          </div>
          <div className="summary-grid thead">
            <span>Instrument</span>
            <span className="r">Close</span>
            <span className="r">Chg</span>
            <span className="r">Vol 1d</span>
            <span className="r">cfc</span>
            <span className="r">Sub pos</span>
            <span className="r">Sub w</span>
            <span className="r">
              Position<br />
              <span style={{ fontSize: 7.5, letterSpacing: '.05em', color: CO.n7, textTransform: 'none' }}>
                × {f.n(params.ssp_div_mp, 2)} SDM
              </span>
            </span>
            <span className="r">P&L</span>
            <span className="r">Exposure</span>
            <span className="r">Share</span>
          </div>
          {tickers.map((t) => {
            const chg = last(t, 'returns');
            const pnl = last(t, 'pnl');
            const pos = last(t, 'portfolio_pos');
            const exposure = last(t, 'exposure');
            return (
              <div className="summary-grid trow" key={t}>
                <div>
                  <div className="ticker">{t}</div>
                  <div className="subname">{data.instruments[t].name}</div>
                </div>
                <span className="r nowrap">
                  <span style={{ fontSize: 11.5 }}>{f.n(last(t, 'Close'), 2)}</span>
                  <span className="subname"> ×{data.instruments[t].multiplier}</span>
                </span>
                <span className="r" style={{ fontSize: 10.5, color: nn(chg) && chg > 0 ? CO.a3 : CO.dim }}>
                  {nn(chg) ? (chg > 0 ? '+' : '') + (chg * 100).toFixed(2) + '%' : '—'}
                </span>
                <span className="r" style={{ fontSize: 10.5, color: CO.dim }}>{f.pct(last(t, volCol), 2)}</span>
                <span className="r" style={{ fontSize: 11, color: CO.a4 }}>{f.sgn(last(t, 'cfc'), 1)}</span>
                <span className="r" style={{ fontSize: 10.5, color: CO.dim }}>{f.n(last(t, 'subsystem_pos'), 1)}</span>
                <span className="r" style={{ fontSize: 10.5, color: CO.dim }}>{f.n(params.ssp_weight, 3)}</span>
                <span className="r nowrap" style={{ fontSize: 13, fontWeight: 500, color: CO.a3 }}>
                  {nn(pos) ? String(pos) : '—'}
                </span>
                <span className="r" style={{ fontSize: 11.5, color: nn(pnl) && pnl > 0 ? CO.a3 : CO.dim }}>
                  {f.cash(pnl, true)}
                </span>
                <span className="r" style={{ fontSize: 11.5 }}>{f.cash(exposure)}</span>
                <span className="r" style={{ fontSize: 10.5, color: CO.dim }}>
                  {f.pct(Math.abs(exposure || 0) / (totalExposure || 1), 1)}
                </span>
              </div>
            );
          })}
          <div className="summary-grid" style={{ alignItems: 'center', padding: '8px 0 0' }}>
            <span className="stat-k">Portfolio</span>
            <span style={{ gridColumn: '2 / 10' }} />
            <span className="r" style={{ fontSize: 12, color: CO.a3 }}>{f.cash(pf.pf_exposure[i1], true)}</span>
            <span className="r note">100%</span>
          </div>
        </div>

        <div style={{ width: PANEL_W.trades, flexShrink: 0, position: 'relative' }}>
          <div className="panel" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-head" style={{ flexShrink: 0 }}>
              <span className="title">Last trades</span>
              <span className="note">{trades.length} in window · newest first</span>
            </div>
            <div className="trades-grid thead" style={{ flexShrink: 0 }}>
              <span>Date</span><span>Instr</span>
              <span className="r">Close</span>
              <span className="r">Trade</span>
              <span className="r">Fee</span>
              <span className="r">Position</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {trades.map((tr, i) => (
                <div className="trades-grid trow compact" key={i}>
                  <span style={{ fontSize: 10, color: CO.dim }}>{tr.date.slice(2)}</span>
                  <span className="ticker sm">{tr.instrument}</span>
                  <span className="r" style={{ fontSize: 10.5 }}>{f.n(tr.close, 2)}</span>
                  <span className="r" style={{ fontSize: 10.5, color: tr.trade > 0 ? CO.a3 : CO.dim }}>
                    {(tr.trade > 0 ? '+' : '−') + Math.abs(tr.trade)}
                  </span>
                  <span className="r" style={{ fontSize: 10, color: CO.mute }}>{'−$' + tr.cost.toFixed(2)}</span>
                  <span className="r" style={{ fontSize: 11, color: CO.a3 }}>{tr.portfolio_pos}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingTop: 8, flexShrink: 0 }}>
              <span className="stat-k">Window fees</span>
              <span className="grow" />
              <span style={{ fontSize: 12 }}>{f.cash(-stats.cost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── capital · exposure · return distribution ────────────────── */}
      <div className="row">
        <div className="panel" style={{ width: PANEL_W.capital }}>
          <div className="panel-head baseline">
            <span className="title">Capital</span>
            <span className="legend"><i style={{ background: CO.a3 }} />equity</span>
          </div>
          {capitalChart}
          <Stats cols={4} items={[
            { k: 'Equity', v: f.money(pf.capital[i1]), c: CO.a3 },
            { k: 'Window P&L', v: f.cash(stats.pnl, true) },
            { k: 'Peak equity', v: f.cash(stats.peak_capital) },
            { k: 'Trough', v: f.pct(stats.max_drawdown_pct, 1), c: CO.dim },
          ]} />
        </div>

        <div className="panel" style={{ width: PANEL_W.exposure }}>
          <div className="panel-head">
            <span className="title">Exposure</span>
            <span className="note">notional over time</span>
            <span className="grow" />
            <span className="legend"><i style={{ background: CO.a5 }} />pf_exposure</span>
          </div>
          {exposureChart}
          <Stats cols={2} items={[
            { k: 'Exposure', v: f.cash(pf.pf_exposure[i1], true), c: CO.a3 },
            { k: 'Capital', v: f.money(pf.capital[i1]) },
          ]} />
        </div>

        <HistPanel
          width={PANEL_W.hist} chartW={PANEL_W.hist - 26}
          windows={['1M', '3M', '1Y', 'ALL']} note="daily return on capital"
          sources={[{ key: 'returns', label: '%', note: 'daily return on capital', dist: data.distributions.portfolio }]}
        />
      </div>

      {/* ── daily P&L · cumulative P&L ──────────────────────────────── */}
      <div className="row">
        <div className="panel" style={{ width: PANEL_W.pnl }}>
          <div className="panel-head">
            <span className="title">Daily P&L</span>
            <span className="note">
              per bar · {pnlPick === 'Total' ? 'pf_pnl' : pnlPick + ' · window ' + f.cash(stats.pnl_by_instrument[pnlPick], true)}
            </span>
            <div className="pillbox">
              {['Total', ...tickers].map((k) => (
                <button key={k} className={'pill' + (pnlPick === k ? ' on' : '')} onClick={() => setPnlPick(k)}>{k}</button>
              ))}
            </div>
            <span className="grow" />
            <span className="note nowrap" style={{ color: CO.dim }}>
              {nn(hover) ? pf.Date[hover] + '  ·  ' + f.cash(pnlSeries[hover], true) : 'hover a bar for its date and value'}
            </span>
          </div>
          {pnlChart}
          <div className="stats" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {[
              { k: 'Window total', v: f.cash(stats.pnl, true) },
              { k: 'Best bar', v: f.cash(stats.best_bar, true) },
              { k: 'Worst bar', v: f.cash(stats.worst_bar, true) },
              { k: 'Up bars', v: f.pct(stats.up_bars, 0) },
              { k: 'Avg bar', v: f.cash(stats.avg_bar, true) },
            ].map((s) => (
              <div key={s.k}>
                <div className="stat-k">{s.k}</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>{s.v}</div>
              </div>
            ))}
            <span className="grow" />
            <span className="note">portfolio</span>
          </div>
        </div>

        <div className="panel" style={{ width: PANEL_W.cum }}>
          <div className="panel-head">
            <span className="title">Cumulative P&L</span>
            <span className="note">by instrument · {win} window</span>
          </div>
          {cumRows.map((r) => {
            const half = anyNeg ? 50 : 100;
            const wp = (Math.abs(r.value) / cumMax) * half;
            const pos = r.value >= 0;
            const zero = anyNeg ? 50 : 0;
            return (
              <div key={r.ticker} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                <div style={{ width: 88, flexShrink: 0 }}>
                  <div className="ticker sm">{r.ticker}</div>
                  <div className="subname sm">{data.instruments[r.ticker].name}</div>
                </div>
                <div className="bar-track">
                  <div className="bar-zero" style={{ left: zero + '%' }} />
                  <div
                    className="bar-fill"
                    style={{
                      left: (pos ? zero : zero - wp).toFixed(2) + '%',
                      width: Math.max(0.8, wp).toFixed(2) + '%',
                      background: pos ? 'rgba(145,132,217,.5)' : 'rgba(117,121,140,.35)',
                      boxShadow: 'inset 0 0 0 1px ' + (pos ? 'rgba(181,171,252,.55)' : 'rgba(147,151,171,.4)'),
                    }}
                  />
                </div>
                <span style={{ fontSize: 11.5, width: 80, textAlign: 'right', color: pos ? CO.a3 : CO.dim }}>
                  {f.cash(r.value, true)}
                </span>
              </div>
            );
          })}
          <div className="stats" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
            <span className="stat-k">Total</span>
            <span style={{ fontSize: 12.5, color: CO.a3 }}>{f.cash(stats.pnl, true)}</span>
          </div>
        </div>
      </div>

      {/* ── drawdown · portfolio volatility ─────────────────────────── */}
      <div className="row">
        <div className="panel" style={{ width: PANEL_W.dd }}>
          <div className="panel-head">
            <span className="title">Drawdown</span>
            <span className="note">portfolio, from its all-time peak · % of capital</span>
          </div>
          {drawdownChart}
          <Stats cols={4} items={[
            { k: 'Now', v: f.pct(pf.drawdown_pct[i1], 1), c: CO.a3 },
            { k: 'Trough', v: f.pct(stats.max_drawdown_pct, 1) },
            { k: 'Now, cash', v: f.cash(pf.drawdown[i1]) },
            { k: 'Bars', v: String(stats.bars), c: CO.dim },
          ]} />
        </div>

        <div className="panel" style={{ width: PANEL_W.pvol }}>
          <div className="panel-head">
            <span className="title">Portfolio volatility</span>
            <span className="note">realized_vol vs target</span>
            <span className="grow" />
            <span className="legend"><i style={{ background: CO.a4 }} />realised</span>
            <span className="legend"><i className="dashed" />target</span>
          </div>
          {pvolChart}
          <Stats cols={4} items={[
            { k: 'Current', v: f.pct(pf.realized_vol[i1], 1), c: CO.a3 },
            { k: 'Mean', v: f.pct(stats.vol_mean, 1) },
            { k: 'Range', v: f.pct(stats.vol_min, 1) + ' – ' + f.pct(stats.vol_max, 1) },
            { k: 'Bars over target', v: f.pct(stats.bars_over_target, 0), c: CO.dim },
          ]} />
        </div>
      </div>
    </div>
  );
}

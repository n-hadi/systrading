import { useCallback, useMemo, useState } from 'react';
import {
  ComposedChart, LineChart, AreaChart, BarChart, Area, Line, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

import { CO, nn, f, windowRange, rows } from '../lib/format.js';
import { AXIS, MARGIN, TOOLTIP, CURVE, shortDate, symDomain, activeIndex } from '../lib/rc.js';
import { CorrPanel, HistPanel } from './panels.jsx';

const CHART_W = 974;

/* Cash-ish columns print without decimals; the rest as plain numbers. */
function fmtCell(col, v) {
  if (col === 'Date') return v;
  if (!nn(v)) return '—';
  if (col === 'portfolio_pos' || col === 'trade') return String(v);
  if (col === 'Volume') return f.i(v);
  if (col === 'returns' || col.startsWith('return_') || col.startsWith('drawdown_pct')) return f.pct(v, 2);
  if (col.startsWith('drawdown_') || ['exposure', 'contract_value', 'instr_value_vol', 'pnl', 'cum_pnl'].includes(col)) {
    return f.n(v, 0);
  }
  return f.n(v, 2);
}

/* One readout field. At module scope so it is not redefined every render. */
const ReadoutCell = ({ r }) => (
  <div className="readout-cell">
    <div className="readout-k">{r.lbl}</div>
    <div className="readout-v">
      <span style={{ color: r.c }}>{r.v}</span>
      <span className="readout-delta">
        <span>{r.d1 || ''}</span>
        <span>{r.d2 || ''}</span>
      </span>
    </div>
  </div>
);

export default function Instruments({ data, win, setWin }) {
  const tickers = Object.keys(data.instruments);
  const [ticker, setTicker] = useState(tickers[0]);
  const [scrub, setScrub] = useState({ hover: null, lock: null });
  const [ov, setOv] = useState({});
  const [fcSel, setFcSel] = useState(null);
  const [sspOn, setSspOn] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const t = data.instruments[ticker] ? ticker : tickers[0];
  const inst = data.instruments[t];
  const df = inst.dataframe;
  const params = data.portfolio.parameters;
  const rules = params.trading_rules;
  const ruleNames = Object.keys(rules);
  const volCol = 'return_vol_' + params.volatility_window;

  const [i0, i1] = windowRange(df.Date.length, params.windows[win]);
  const { hover, lock } = scrub;
  const hv = nn(lock) && lock >= i0 && lock <= i1
    ? lock
    : (nn(hover) && hover >= i0 && hover <= i1 ? hover : i1);

  /* Functional updates, so these two keep the same identity for the life of the
     component. That is what lets the memoised charts below skip re-rendering. */
  const onHover = useCallback((i) => setScrub((sc) => (sc.lock !== null ? sc : { ...sc, hover: i })), []);
  const onPick = useCallback(
    (i) => setScrub((sc) => (sc.lock !== null ? { hover: i, lock: null } : { hover: null, lock: i })),
    [],
  );

  const ev = useMemo(() => ({
    syncId: 'inst',
    syncMethod: 'value',
    onMouseMove: (st) => { const k = activeIndex(st); if (k !== null) onHover(i0 + k); },
    onMouseLeave: () => onHover(null),
    onClick: (st) => { const k = activeIndex(st); if (k !== null) onPick(i0 + k); },
  }), [i0, onHover, onPick]);

  const V = (col) => (df[col] ? df[col][hv] : null);
  const prev = (col) => (hv > 0 && df[col] ? df[col][hv - 1] : null);

  /* Bar-over-bar change — one subtraction of adjacent values. */
  const delta = (col, dp) => {
    const a = V(col), b = prev(col);
    if (!nn(a) || !nn(b)) return '';
    const d = a - b;
    return (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(dp);
  };
  const closeDelta = () => {
    const a = V('Close'), b = prev('Close');
    if (!nn(a) || !nn(b) || b === 0) return ['', ''];
    const d = a - b, s = d > 0 ? '+' : d < 0 ? '−' : '';
    return [s + Math.abs((d / b) * 100).toFixed(2) + '%', s + f.n(Math.abs(d), 2)];
  };

  /* Everything rule-shaped is derived from trading_rules, so adding a rule in
     settings.py flows through here with no edit. */
  const fcDefs = [
    ...ruleNames.map((r, k) => ({ k: 'fc_' + r, c: [CO.a4, CO.a6, CO.n6, CO.a7][k % 4], width: 1 })),
    { k: 'cfc', c: CO.text, width: 1.4 },
  ];
  const fcShown = fcSel || ['cfc'];

  // rules that cross two moving averages expose their spans as fast/slow
  const spanRules = ruleNames.filter((r) => rules[r].fast && rules[r].slow);
  const overlays = [
    ...spanRules.flatMap((r) => [
      { key: 'ewma_' + rules[r].slow, label: 'EWMA ' + rules[r].slow, c: CO.a7 },
      { key: 'ewma_' + rules[r].fast, label: 'EWMA ' + rules[r].fast, c: CO.a4 },
    ]),
    ...(df.bb_upper_20 ? [{ key: 'bb', label: 'Bollinger 20', c: CO.a8 }] : []),
  ];
  const isOn = (key) => ov[key] ?? (key === 'bb');

  const indicatorCols = [
    ...spanRules.flatMap((r) => ['ewma_' + rules[r].fast, 'ewma_' + rules[r].slow]),
    ...(df.rsi ? ['rsi'] : []),
  ];

  const cd = closeDelta();
  const readout = {
    Date: { lbl: 'Date', v: df.Date[hv], c: CO.a3 },
    Close: { lbl: 'Close (×' + inst.multiplier + ')', v: f.n(V('Close'), 2), c: CO.text, d1: cd[0], d2: cd[1] },
    vol: { lbl: volCol, v: f.pct(V(volCol), 2), c: CO.dim },
    cfc: { lbl: 'cfc', v: f.sgn(V('cfc'), 2), c: CO.a3, d1: delta('cfc', 2) },
    ...Object.fromEntries(indicatorCols.map((col) => [col, { lbl: col, v: f.n(V(col), 2), c: CO.a4 }])),
    ...Object.fromEntries(ruleNames.flatMap((r, k) => [
      ['fc_' + r, { lbl: 'fc_' + r, v: f.sgn(V('fc_' + r), 2), c: [CO.a4, CO.a6, CO.n6, CO.a7][k % 4], d1: delta('fc_' + r, 2) }],
      ['s_' + r, { lbl: 's_' + r, v: f.sgn(V('s_' + r), 2), c: CO.dim, d1: delta('s_' + r, 2) }],
    ])),
    ivv: { lbl: 'instr_value_vol', v: f.cash(V('instr_value_vol')), c: CO.dim },
    vol_scalar: { lbl: 'vol_scalar', v: f.n(V('vol_scalar'), 2), c: CO.text },
    ssp: { lbl: 'subsystem_pos', v: f.n(V('subsystem_pos'), 2), c: CO.dim },
    pp: { lbl: 'portfolio_pos', v: nn(V('portfolio_pos')) ? String(V('portfolio_pos')) : '—', c: CO.a3, d1: delta('portfolio_pos', 0) },
    cv: { lbl: 'contract_value', v: f.cash(V('contract_value')), c: CO.dim },
    exp: { lbl: 'exposure', v: f.cash(V('exposure'), true), c: CO.text },
    pnl: { lbl: 'pnl', v: f.cash(V('pnl'), true), c: CO.a4 },
  };
  const groups = [
    { label: 'Bar', cols: 2, items: ['Date', 'Close'], side: ['cfc'] },
    // one column per rule, so each scaled forecast sits above its raw signal
    { label: 'Forecasts', cols: ruleNames.length, items: [...ruleNames.map((r) => 'fc_' + r), ...ruleNames.map((r) => 's_' + r)] },
    { label: 'Indicators', cols: Math.max(1, indicatorCols.length), items: indicatorCols, side: ['vol'] },
    { label: 'Sizing', cols: 4, items: ['ivv', 'vol_scalar', 'ssp', 'pp'] },
    { label: 'Position & P&L', cols: 3, items: ['cv', 'exp', 'pnl'] },
  ];

  const curated = ['Date', 'Close', 'returns', volCol, 'rsi',
    ...ruleNames.flatMap((r) => ['s_' + r, 'fc_' + r]),
    'cfc', 'vol_scalar', 'subsystem_pos', 'portfolio_pos', 'contract_value',
    'exposure', 'trade', 'cost', 'pnl', 'cum_pnl',
  ].filter((c) => c === 'Date' || df[c]);
  const allCols = ['Date', ...Object.keys(df).filter((c) => c !== 'Date')];
  const cols = showAll ? allCols : curated;
  const tableRows = [];
  for (let i = i1; i >= Math.max(i0, i1 - 39); i--) tableRows.push(i);

  const sigCorr = inst.signal_corr;
  const sigPairs = sigCorr.pairs[Object.keys(sigCorr.pairs)[0]] || {};
  const sigKeys = [...new Set(Object.keys(sigPairs).flatMap((p) => p.split(' / ')))];

  const chartRows = useMemo(() => ({
    price: rows(df.Date, {
      Close: df.Close,
      ...Object.fromEntries(overlays.filter((o) => o.key !== 'bb').map((o) => [o.key, df[o.key]])),
      bb_lower_20: df.bb_lower_20,
      bb_upper_20: df.bb_upper_20,
    }, i0, i1),
    fc: rows(df.Date, Object.fromEntries(fcDefs.map((d) => [d.k, df[d.k]])), i0, i1),
    exposure: rows(df.Date, { exposure: df.exposure }, i0, i1),
    position: rows(df.Date, { portfolio_pos: df.portfolio_pos, subsystem_pos: df.subsystem_pos }, i0, i1),
    cum: rows(df.Date, { cum_pnl: df.cum_pnl }, i0, i1),
    pnl: rows(df.Date, { pnl: df.pnl }, i0, i1),
    vol: rows(df.Date, { vol: df[volCol] }, i0, i1),
  }), [df, i0, i1, volCol]);

  const leftCharts = useMemo(() => (
    <div style={{ width: 1000, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel">
        <div className="panel-head baseline" style={{ marginBottom: 4 }}>
          <span className="title">Price</span>
          <span className="note">{inst.name} · multiplier {inst.multiplier} · {inst.block_currency[0]}</span>
          <span className="grow" />
          <span className="legend" style={{ padding: '0 4px' }}>
            <i style={{ width: 14, background: CO.text }} />Close
          </span>
          {overlays.map((o) => (
            <button
              key={o.key} className={'swatch small' + (isOn(o.key) ? ' on' : '')}
              onClick={() => setOv({ ...ov, [o.key]: !isOn(o.key) })}
            >
              <span className="swatch-dot" style={{ background: isOn(o.key) ? o.c : CO.n8 }} />
              {o.label}
            </button>
          ))}
        </div>
        <ComposedChart width={CHART_W} height={244} margin={MARGIN} {...ev} data={chartRows.price}>
          <CartesianGrid stroke="rgba(233,233,237,.07)" />
          <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
          <YAxis {...AXIS} width={52} tickFormatter={(v) => f.n(v, 0)} domain={['auto', 'auto']} />
          <Tooltip {...TOOLTIP} formatter={(v) => f.n(v, 2)} />
          {isOn('bb') && df.bb_upper_20 && (
            <Area
              name="Bollinger 20" dataKey={(d) => [d.bb_lower_20, d.bb_upper_20]}
              stroke={CO.a8} fill="rgba(145,132,217,.10)" {...CURVE}
            />
          )}
          {overlays.filter((o) => o.key !== 'bb' && isOn(o.key)).map((o) => (
            <Line key={o.key} name={o.label} dataKey={o.key} stroke={o.c} strokeWidth={1.2} {...CURVE} />
          ))}
          <Line name="Close" dataKey="Close" stroke={CO.text} strokeWidth={1.3} {...CURVE} />
        </ComposedChart>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="title">Forecast history</span>
          <span className="note">scaled forecasts · capped ±20</span>
        </div>
        <LineChart width={CHART_W} height={176} margin={MARGIN} {...ev} data={chartRows.fc}>
          <CartesianGrid stroke="rgba(233,233,237,.07)" />
          <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
          <YAxis {...AXIS} width={36} domain={symDomain} tickFormatter={(v) => f.n(v, 0)} />
          <Tooltip {...TOOLTIP} formatter={(v) => f.sgn(v, 2)} />
          <ReferenceLine y={10} stroke={CO.n7} strokeDasharray="2 3" />
          <ReferenceLine y={-10} stroke={CO.n7} strokeDasharray="2 3" />
          <ReferenceLine y={20} stroke={CO.n7} />
          <ReferenceLine y={-20} stroke={CO.n7} />
          {fcDefs.filter((d) => fcShown.includes(d.k)).map((d) => (
            <Line key={d.k} dataKey={d.k} stroke={d.c} strokeWidth={d.width} {...CURVE} />
          ))}
        </LineChart>
        <div className="stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span className="readout-label" style={{ marginBottom: 0, marginRight: 2 }}>Series</span>
          {fcDefs.map((d) => {
            const on = fcShown.includes(d.k);
            return (
              <button
                key={d.k} className={'swatch' + (on ? ' on' : '')}
                onClick={() => setFcSel(on ? fcShown.filter((x) => x !== d.k) : [...fcShown, d.k])}
              >
                <span className="swatch-dot narrow" style={{ background: on ? d.c : CO.n8 }} />
                {d.k}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel tight">
        <div className="panel-head baseline">
          <span className="title">Exposure</span>
          <span className="note">portfolio_pos × contract_value</span>
        </div>
        <AreaChart width={CHART_W} height={150} margin={MARGIN} {...ev} data={chartRows.exposure}>
          <CartesianGrid stroke="rgba(233,233,237,.07)" />
          <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
          <YAxis {...AXIS} width={52} tickFormatter={f.cash} />
          <Tooltip {...TOOLTIP} formatter={(v) => f.cash(v, true)} />
          <Area dataKey="exposure" stroke={CO.a4} strokeWidth={1.2} fill="rgba(145,132,217,.14)" {...CURVE} />
        </AreaChart>
      </div>

      <div className="panel tight">
        <div className="panel-head baseline">
          <span className="title">Position</span>
          <span className="note">subsystem (continuous) vs portfolio (rounded contracts)</span>
          <span className="grow" />
          <button className={'swatch small' + (sspOn ? ' on' : '')} onClick={() => setSspOn(!sspOn)}>
            <span className="swatch-dot" style={{ background: sspOn ? CO.a6 : CO.n8 }} />
            subsystem_pos
          </button>
        </div>
        <LineChart width={CHART_W} height={150} margin={MARGIN} {...ev} data={chartRows.position}>
          <CartesianGrid stroke="rgba(233,233,237,.07)" />
          <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
          <YAxis {...AXIS} width={44} domain={symDomain} tickFormatter={(v) => f.n(v, 0)} />
          <Tooltip {...TOOLTIP} formatter={(v) => f.n(v, 2)} />
          {sspOn && <Line dataKey="subsystem_pos" stroke={CO.a6} strokeWidth={1} strokeDasharray="3 2" {...CURVE} />}
          <Line type="stepAfter" dataKey="portfolio_pos" stroke={CO.a3} strokeWidth={1.3} {...CURVE} />
        </LineChart>
      </div>

      <div className="panel tight">
        <div className="panel-head baseline">
          <span className="title">P&L</span>
          <span className="note">daily bars and cumulative, both from the backend</span>
        </div>
        <AreaChart width={CHART_W} height={116} margin={MARGIN} {...ev} data={chartRows.cum}>
          <CartesianGrid stroke="rgba(233,233,237,.07)" />
          <XAxis dataKey="Date" hide />
          <YAxis {...AXIS} width={60} tickFormatter={f.cash} />
          <Tooltip {...TOOLTIP} formatter={(v) => f.cash(v, true)} />
          <Area name="cum_pnl" dataKey="cum_pnl" stroke={CO.a3} strokeWidth={1.4} fill="rgba(145,132,217,.13)" {...CURVE} />
        </AreaChart>
        <BarChart width={CHART_W} height={86} margin={MARGIN} {...ev} data={chartRows.pnl}>
          <CartesianGrid stroke="rgba(233,233,237,.07)" />
          <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
          <YAxis {...AXIS} width={60} domain={symDomain} tickFormatter={f.cash} />
          <Tooltip {...TOOLTIP} formatter={(v) => f.cash(v, true)} />
          <Bar name="pnl" dataKey="pnl" isAnimationActive={false}>
            {chartRows.pnl.map((r, k) => <Cell key={k} fill={(r.pnl || 0) >= 0 ? CO.a4 : CO.a7} />)}
          </Bar>
        </BarChart>
      </div>
    </div>
  ), [chartRows, inst, overlays, ov, fcShown, sspOn, ev]);

  const volChart = useMemo(() => (
    <div className="panel tight">
      <div className="panel-head baseline">
        <span className="title">Volatility</span>
        <span className="note">{volCol} · daily</span>
      </div>
      <LineChart width={602} height={104} margin={MARGIN} {...ev} data={chartRows.vol}>
        <CartesianGrid stroke="rgba(233,233,237,.07)" />
        <XAxis dataKey="Date" hide />
        <YAxis {...AXIS} width={40} domain={[0, 'auto']} tickFormatter={(v) => (v * 100).toFixed(1) + '%'} />
        <Tooltip {...TOOLTIP} formatter={(v) => f.pct(v, 2)} />
        <Line name={volCol} dataKey="vol" stroke={CO.a4} strokeWidth={1.3} {...CURVE} />
      </LineChart>
    </div>
  ), [chartRows, volCol, ev]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, padding: '12px 0 0' }}>
        {tickers.map((x) => {
          const d = data.instruments[x].dataframe;
          const n = d.Date.length - 1;
          return (
            <button
              key={x} className={'inst-tab' + (x === t ? ' on' : '')}
              onClick={() => { setTicker(x); setScrub({ hover: null, lock: null }); }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.03em' }}>{x}</span>
                <span className="subname nowrap">{data.instruments[x].name}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
                <span className="note">pos</span>
                <span style={{ fontSize: 11, color: CO.a3 }}>
                  {nn(d.portfolio_pos[n]) ? String(d.portfolio_pos[n]) : '—'}
                </span>
                <span className="note">cfc</span>
                <span style={{ fontSize: 11 }}>{f.sgn(d.cfc[n], 2)}</span>
              </span>
            </button>
          );
        })}
        <div className="grow" />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="pillbox">
            {Object.keys(params.windows).map((k) => (
              <button
                key={k} className={'pill' + (win === k ? ' on' : '')}
                onClick={() => { setWin(k); setScrub({ hover: null, lock: null }); }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        {leftCharts}

        <div style={{ width: 628, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel">
            <div className="panel-head baseline" style={{ marginBottom: 8 }}>
              <span className="title">Readout</span>
              <span className={'readout-date' + (nn(lock) ? ' locked' : '')}>{df.Date[hv]}</span>
              <span className="note">
                {nn(lock) ? 'locked — click any chart to release' : 'hover to scrub, click to lock'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {groups.map((g) => (
                <div key={g.label} style={{ minWidth: 0 }}>
                  <div className="readout-label">{g.label}</div>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 7 }}>
                    <div className="readout-grid" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0,1fr))` }}>
                      {g.items.map((k) => <ReadoutCell key={k} r={readout[k]} />)}
                    </div>
                    {g.side && (
                      <div className="readout-side">
                        {g.side.map((k) => <ReadoutCell key={k} r={readout[k]} />)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {volChart}

          <CorrPanel
            width={628} chartW={602} bars={params.windows[win]} keys={sigKeys}
            sources={[{ key: 'signals', label: 'signals', title: 'Signal correlation', note: 'raw rule signals', corr: sigCorr }]}
          />

          <HistPanel
            width={628} chartW={602} windows={Object.keys(params.windows)} note={t}
            sources={[
              { key: 'pnl', label: 'P&L', note: 'strategy P&L on capital', dist: data.distributions.instruments[t].pnl },
              { key: 'returns', label: '%', note: 'close returns', dist: data.distributions.instruments[t].returns },
            ]}
          />
        </div>
      </div>

      {/* ── dataframe ──────────────────────────────────────────── */}
      <div className="panel tight" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <span className="title">Dataframe</span>
          <span className="note">
            {cols.length} of {allCols.length} columns · last {tableRows.length} bars, newest first
          </span>
          <span className="grow" />
          <button className={'pill' + (showAll ? ' on' : '')} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Curated columns' : 'All columns'}
          </button>
        </div>
        <div className="df-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(64px, 1fr))`, minWidth: '100%' }}>
            {cols.map((c) => <div className="df-head" key={c}>{c}</div>)}
            {tableRows.map((i, ri) => cols.map((c) => (
              <div
                className={'df-cell' + (i === hv ? ' hot' : (ri % 2 ? ' alt' : ''))} key={c + i}
                style={{ color: c === 'Date' ? CO.dim : (c === 'cfc' || c === 'portfolio_pos' ? CO.a3 : CO.text) }}
              >
                {fmtCell(c, df[c] ? df[c][i] : null)}
              </div>
            )))}
          </div>
        </div>
      </div>
    </div>
  );
}

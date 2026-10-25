import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

import { CO, nn, f, PANEL_W, windowRange, rows } from '../lib/format.js';
import { AXIS, MARGIN, TOOLTIP, CURVE, shortDate } from '../lib/rc.js';
import { HistPanel } from './panels.jsx';

/* The portfolios added up. Nothing here feeds back into any of them -- they
   run independently and do not know this view exists. */
export default function Meta({ data, win }) {
  const meta = data.meta;
  const pf = meta.dataframe;
  const params = meta.parameters;
  const stats = meta.stats[win];

  const [i0, i1] = windowRange(pf.Date.length, params.windows[win]);
  const netPnl = stats.pnl - stats.cost;

  const chartRows = rows(pf.Date, { capital: pf.capital, drawdown_pct: pf.drawdown_pct }, i0, i1);
  const names = Object.keys(params.portfolios);

  return (
    <div>
      <div className="cards">
        <div className="card">
          <div className="card-label">Total capital</div>
          <div className="card-value">{f.money(pf.capital[i1])}</div>
          <div className="card-sub">{names.length} portfolios · started {f.money(params.start_capital.value)}</div>
        </div>

        <div className="card">
          <div className="card-label">Net P&L</div>
          <div className="card-value">{f.cash(netPnl, true)}</div>
          <div className="card-sub">{f.cash(stats.pnl, true)} gross</div>
        </div>

        <div className="card">
          <div className="card-label">Costs</div>
          <div className="card-value">{f.cash(-stats.cost)}</div>
          <div className="card-sub">{stats.trades} trades</div>
        </div>

        <div className="card">
          <div className="card-label">Trough</div>
          <div className="card-value">{f.pct(stats.max_drawdown_pct, 1)}</div>
          <div className="card-sub">now {f.pct(pf.drawdown_pct[i1], 1)}</div>
        </div>
      </div>

      <div className="row">
        <div className="panel" style={{ width: PANEL_W.costs }}>
          <div className="panel-head baseline">
            <span className="title">By portfolio</span>
            <span className="note">{win} window · each runs on its own capital</span>
            <span className="grow" />
            <span className="note">no diversification multiplier across portfolios</span>
          </div>
          <div className="costs-grid thead">
            <span>Portfolio</span>
            <span className="r">Start capital</span>
            <span className="r">Vol target τ</span>
            <span className="r">Instruments</span>
            <span className="r">Net P&L</span>
            <span className="r">Share of P&L</span>
            <span className="r" />
            <span className="r" />
          </div>
          {names.map((name) => {
            const p = params.portfolios[name];
            const pnl = stats.pnl_by_instrument[name];
            return (
              <div className="costs-grid trow" key={name}>
                <div>
                  <div className="ticker">{p.label}</div>
                  <div className="subname">{name}</div>
                </div>
                <span className="r">{f.money(p.start_capital)}</span>
                <span className="r" style={{ color: CO.dim }}>{f.pct(p.volatility_target, 0)}</span>
                <span className="r" style={{ color: CO.dim }}>{p.amount_instruments}</span>
                <span className="r" style={{ color: nn(pnl) && pnl > 0 ? CO.a3 : CO.dim }}>
                  {f.cash(pnl, true)}
                </span>
                <span className="r" style={{ color: CO.dim }}>
                  {f.pct(Math.abs(pnl || 0) / (Math.abs(netPnl) || 1), 1)}
                </span>
                <span className="r" />
                <span className="r" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="row">
        <div className="panel" style={{ width: PANEL_W.dd }}>
          <div className="panel-head baseline">
            <span className="title">Total equity</span>
            <span className="note">every portfolio's capital, summed</span>
          </div>
          <AreaChart width={PANEL_W.dd - 26} height={226} margin={MARGIN} data={chartRows}>
            <CartesianGrid stroke="rgba(233,233,237,.07)" />
            <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
            <YAxis {...AXIS} width={60} tickFormatter={f.cash} domain={['auto', 'auto']} />
            <Tooltip {...TOOLTIP} formatter={(v) => f.money(v)} />
            <Area dataKey="capital" stroke={CO.a3} strokeWidth={1.4} fill="rgba(145,132,217,.13)" {...CURVE} />
          </AreaChart>
        </div>

        <div className="panel" style={{ width: PANEL_W.pvol }}>
          <div className="panel-head baseline">
            <span className="title">Drawdown</span>
            <span className="note">combined, from its all-time peak</span>
          </div>
          <AreaChart width={PANEL_W.pvol - 26} height={226} margin={MARGIN} data={chartRows}>
            <CartesianGrid stroke="rgba(233,233,237,.07)" />
            <XAxis dataKey="Date" {...AXIS} tickFormatter={shortDate} minTickGap={44} />
            <YAxis {...AXIS} width={44} tickFormatter={(v) => f.pct(v, 0)} />
            <Tooltip {...TOOLTIP} formatter={(v) => f.pct(v, 2)} />
            <Area dataKey="drawdown_pct" stroke={CO.a6} strokeWidth={1.2} fill="rgba(145,132,217,.12)" {...CURVE} />
          </AreaChart>
        </div>
      </div>

      <div className="row">
        <HistPanel
          width={PANEL_W.hist} chartW={PANEL_W.hist - 26} windows={Object.keys(params.windows)}
          note="combined daily return on total capital"
          sources={[{ key: 'returns', label: '%', note: 'combined returns', dist: meta.distributions }]}
        />
      </div>
    </div>
  );
}

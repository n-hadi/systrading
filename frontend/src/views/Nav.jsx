import { useState } from 'react';

import { f, windowRange } from '../lib/format.js';

/* Top bar: tabs, base currency, bar count and the calibration popover.
   The rule rows are built from parameters.trading_rules, so adding a rule in
   settings.py makes it appear here with no frontend change. */
export default function Nav({ data, win, tab, setTab }) {
  const [calibOpen, setCalibOpen] = useState(false);

  const params = data?.portfolio?.parameters;
  const pf = data?.portfolio?.dataframe;
  const currency = params?.start_capital?.currency?.[0] ?? '—';

  let bars = '—';
  if (pf) {
    const [i0, i1] = windowRange(pf.Date.length, params.windows[win]);
    bars = String(i1 - i0 + 1);
  }

  const ruleNames = params ? Object.keys(params.trading_rules) : [];

  const rows = params ? [
    ['Capital', f.money(params.start_capital.value)],
    ['Volatility target τ', f.pct(params.volatility_target, 0)],
    ['Volatility window', params.volatility_window + ' d'],
    ['Daily cash vol target', f.money(pf.daily_cash_vol_target[pf.Date.length - 1])],
    ...ruleNames.map((r) => [
      'Rule · ' + r,
      Object.entries(params.trading_rules[r])
        .filter(([k]) => k !== 'price_scaled')
        .map(([k, v]) => k + ' ' + v)
        .join(' · '),
    ]),
    ...ruleNames.map((r) => ['Forecast scalar · ' + r, f.n(params.fc_scalars[r], 4)]),
    ['Forecast weights', ruleNames.map((r) => r + ' ' + params.fc_weights[r]).join(' · ')],
    ['Forecast div. multiplier', f.n(params.fc_div_mp, 2)],
    ['Subsystem weight', f.n(params.ssp_weight, 3)],
    ['Subsystem div. multiplier', f.n(params.ssp_div_mp, 2)],
    ['Fee per trade', '$' + params.fee_per_trade.toFixed(2)],
    ['Instruments', String(params.amount_instruments)],
    ['Simulated', params.start_date + ' → ' + params.end_date],
  ] : [];

  return (
    <div className="nav">
      <span className="nav-brand">Systrading</span>

      <div className="pillbox">
        <button className={'tab' + (tab === 'overview' ? ' on' : '')} onClick={() => setTab('overview')}>Overview</button>
        <button className={'tab' + (tab === 'instruments' ? ' on' : '')} onClick={() => setTab('instruments')}>Instruments</button>
      </div>

      <div className="grow" />

      <div className="nav-meta">
        <span>Base&nbsp;<b>{currency}</b></span>
        <span>Bars&nbsp;<b>{bars}</b></span>

        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button className={'calib-btn' + (calibOpen ? ' on' : '')} onClick={() => setCalibOpen(!calibOpen)}>
            Calibration
          </button>
          {calibOpen && (
            <div className="popover">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="title">Calibration</span>
                <span className="grow" />
                <button className="icon-btn" onClick={() => setCalibOpen(false)} aria-label="Close calibration">×</button>
              </div>
              {rows.map(([k, v]) => (
                <div className="popover-row" key={k}>
                  <span>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              <div className="popover-foot">
                Forecast scalars are placeholder values calibrated on one instrument and shared across the
                portfolio, per calibration.py. Costs are a flat placeholder charge per position change and
                do not reduce capital.
              </div>
            </div>
          )}
        </span>
      </div>
    </div>
  );
}

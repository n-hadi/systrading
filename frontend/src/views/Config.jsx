import { useState } from 'react';

const clone = (o) => JSON.parse(JSON.stringify(o));

const Num = ({ value, onChange, step = 'any', width }) => (
  <input
    className="cfg-input" type="number" step={step} style={width ? { width } : undefined}
    value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
  />
);

const Txt = ({ value, onChange, width, placeholder }) => (
  <input
    className="cfg-input" type="text" style={width ? { width } : undefined}
    placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
  />
);

const Field = ({ label, hint, children }) => (
  <label className="cfg-field">
    <span className="cfg-label">{label}</span>
    {children}
    {hint && <span className="cfg-hint">{hint}</span>}
  </label>
);

/* One form, two uses: the first-run wizard (no config.json yet) and the
   settings dialog. The backend owns the file, the validation and the rebuild —
   this only collects values and shows whatever errors come back. */
export default function Config({ meta, onSave, onClose, portfolio }) {
  const saved = Object.keys(meta.config.portfolios);

  const [which, setWhich] = useState(saved.includes(portfolio) ? portfolio : saved[0]);
  const [cfg, setCfg] = useState(() => clone(meta.config));
  // instruments live in a list per portfolio rather than in cfg's object, so a
  // half-typed ticker can't collide with another row's key while you are typing
  const [instruments, setInstruments] = useState(() => Object.fromEntries(saved.map((n) => [
    n, Object.entries(meta.config.portfolios[n].instruments)
      .map(([ticker, spec]) => ({ ticker, ...clone(spec) })),
  ])));
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  // live, so a portfolio added below shows up straight away
  const names = Object.keys(cfg.portfolios);
  const p = cfg.portfolios[which];
  const rows = instruments[which];

  /* Mutate a copy of the portfolio being edited. Cheaper to read than nested
     spreads, and the config is small. */
  const edit = (fn) => setCfg((prev) => { const next = clone(prev); fn(next.portfolios[which]); return next; });
  const setRows = (next) => setInstruments((prev) => ({ ...prev, [which]: next }));
  const editRow = (i, fn) => setRows(rows.map((row, j) => (j === i ? { ...row, ...fn(row) } : row)));

  function addPortfolio() {
    const label = (window.prompt('Name for the new portfolio') || '').trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!key || cfg.portfolios[key]) return;

    const seed = clone(meta.portfolio_defaults);
    setCfg({ ...cfg, portfolios: { ...cfg.portfolios, [key]: { ...seed, label, instruments: {} } } });
    setInstruments({
      ...instruments,
      [key]: Object.entries(seed.instruments).map(([ticker, spec]) => ({ ticker, ...spec })),
    });
    setWhich(key);
  }

  function removePortfolio() {
    const { [which]: _dropped, ...keptCfg } = cfg.portfolios;
    const { [which]: _alsoDropped, ...keptRows } = instruments;
    setCfg({ ...cfg, portfolios: keptCfg });
    setInstruments(keptRows);
    setWhich(Object.keys(keptCfg)[0]);
  }

  /* A rule's weights must stay one-per-enabled-rule and sum to 1, so toggling
     one redistributes them evenly rather than leaving an invalid form. */
  function toggleRule(name) {
    edit((c) => {
      if (c.rules[name]) delete c.rules[name];
      else c.rules[name] = { ...meta.rule_spec[name].params };

      const names = Object.keys(c.rules);
      const each = Math.floor(1000 / (names.length || 1)) / 1000;
      c.fc_weights = Object.fromEntries(names.map((n) => [n, each]));
      if (names.length) c.fc_weights[names[0]] = Math.round((1 - each * (names.length - 1)) * 1000) / 1000;
    });
  }

  /* onSave does the PUT and returns the backend's complaints, or null when
     it saved and the rebuild succeeded. */
  async function save() {
    setSaving(true);
    setErrors([]);

    // two rows with the same ticker would silently collapse into one key, so
    // this is caught here rather than after the backend has stopped seeing it
    const tickers = rows.map((r) => r.ticker.trim());
    const dupes = tickers.filter((t, i) => tickers.indexOf(t) !== i);
    if (dupes.length) {
      setErrors(['instruments: ' + [...new Set(dupes)].join(', ') + ' listed more than once']);
      setSaving(false);
      return;
    }

    const payload = clone(cfg);
    for (const name of names) {
      payload.portfolios[name].instruments = Object.fromEntries(
        instruments[name].map(({ ticker, ...spec }) => [ticker.trim(), spec]));
    }

    const problems = await onSave(payload);
    if (problems) setErrors(problems);
    setSaving(false);
  }

  const ruleNames = Object.keys(meta.rule_spec);
  const weightSum = Object.values(p.fc_weights ?? {})
    .reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div className={meta.configured ? 'cfg-modal' : 'cfg-page'}>
      <div className="panel cfg">
        <div className="panel-head">
          <span className="title">{meta.configured ? 'Settings' : 'Set up the framework'}</span>
          <span className="grow" />
          <select className="select" value={which} onChange={(e) => setWhich(e.target.value)}>
            {names.map((n) => <option key={n} value={n}>{cfg.portfolios[n].label}</option>)}
          </select>
          <button className="calib-btn" onClick={addPortfolio}>+ Portfolio</button>
          {names.length > 1 && (
            <button className="calib-btn" onClick={removePortfolio}>Remove</button>
          )}
          <span className="cfg-hint">every portfolio is saved together</span>
          <span className="grow" />
          {meta.configured && <button className="icon-btn" onClick={onClose} aria-label="Close settings">×</button>}
        </div>

        <p className="cfg-intro">
          {meta.configured
            ? 'Saved to framework/config.json. Saving re-runs the whole simulation, which takes a moment.'
            : 'Nothing is configured yet. These are the values the framework shipped with — accept or change them, and they are written to framework/config.json.'}
        </p>

        <div className="cfg-section">Capital and risk</div>
        <div className="cfg-grid">
          <Field label="Name">
            <Txt value={p.label} onChange={(v) => edit((c) => { c.label = v; })} />
          </Field>

          <Field label="Calendar" hint="sets the date index and bars per year">
            <select
              className="cfg-input" value={p.calendar}
              onChange={(e) => edit((c) => { c.calendar = e.target.value; })}
            >
              <option value="B">Business days — 252</option>
              <option value="D">Every day — 365</option>
            </select>
          </Field>

          <Field label="Start capital">
            <span className="cfg-row">
              <Txt width={54} value={p.start_capital.currency[0]}
                   onChange={(v) => edit((c) => { c.start_capital.currency[0] = v; })} />
              <Txt width={38} value={p.start_capital.currency[1]}
                   onChange={(v) => edit((c) => { c.start_capital.currency[1] = v; })} />
              <Num value={p.start_capital.value}
                   onChange={(v) => edit((c) => { c.start_capital.value = v; })} />
            </span>
          </Field>

          <Field label="Start date" hint="first simulated business day">
            <input className="cfg-input" type="date" value={p.start_date}
                   onChange={(e) => edit((c) => { c.start_date = e.target.value; })} />
          </Field>

          <Field label="Volatility target τ" hint="annualised — 0.5 is 50%">
            <Num step="0.05" value={p.volatility_target}
                 onChange={(v) => edit((c) => { c.volatility_target = v; })} />
          </Field>

          <Field label="Volatility window" hint="days used to estimate σ">
            <Num step="1" value={p.volatility_window}
                 onChange={(v) => edit((c) => { c.volatility_window = v; })} />
          </Field>

          <Field label="Forecast div. multiplier">
            <Num step="0.05" value={p.fc_div_mp} onChange={(v) => edit((c) => { c.fc_div_mp = v; })} />
          </Field>

          <Field label="Subsystem div. multiplier">
            <Num step="0.05" value={p.ssp_div_mp} onChange={(v) => edit((c) => { c.ssp_div_mp = v; })} />
          </Field>
        </div>

        <div className="cfg-section">Instruments</div>
        <div className="cfg-table">
          <div className="cfg-trow cfg-thead">
            <span>Ticker</span><span>Name</span><span>Multiplier</span><span>Step</span><span>Currency</span>
            <span>Spread</span><span>Ticket</span><span>Per unit</span><span>% fee</span><span />
          </div>
          {rows.map((row, i) => (
            <div className="cfg-trow" key={i}>
              <Txt value={row.ticker} placeholder="ES=F" onChange={(v) => editRow(i, () => ({ ticker: v }))} />
              <Txt value={row.name} placeholder="E-Mini S&P 500" onChange={(v) => editRow(i, () => ({ name: v }))} />
              <Num value={row.multiplier} onChange={(v) => editRow(i, () => ({ multiplier: v }))} />
              <Num value={row.step} onChange={(v) => editRow(i, () => ({ step: v }))} />
              <span className="cfg-row">
                <Txt width={54} value={row.block_currency[0]}
                     onChange={(v) => editRow(i, (r) => ({ block_currency: [v, r.block_currency[1]] }))} />
                <Txt width={38} value={row.block_currency[1]}
                     onChange={(v) => editRow(i, (r) => ({ block_currency: [r.block_currency[0], v] }))} />
              </span>
              <Num value={row.spread} onChange={(v) => editRow(i, () => ({ spread: v }))} />
              <Num value={row.fee_per_ticket} onChange={(v) => editRow(i, () => ({ fee_per_ticket: v }))} />
              <Num value={row.fee_per_unit} onChange={(v) => editRow(i, () => ({ fee_per_unit: v }))} />
              <Num value={row.fee_percent} onChange={(v) => editRow(i, () => ({ fee_percent: v }))} />
              <button className="icon-btn" aria-label={'Remove ' + row.ticker}
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button
            className="cfg-add"
            onClick={() => setRows([...rows, { ticker: '', ...clone(meta.instrument_defaults) }])}
          >
            + Add instrument
          </button>
          <div className="cfg-hint">
            Tickers are downloaded from Yahoo Finance, so they must be spelled as Yahoo spells them.
            Spread is a static estimate in price points — you pay half of it per trade.
            Step is the smallest tradeable amount: 1 contract, or a fraction of a coin.
          </div>
        </div>

        <div className="cfg-section">Trading rules</div>
        <div className="cfg-rules">
          {ruleNames.map((name) => {
            const on = Boolean(p.rules[name]);
            return (
              <div className="cfg-rule" key={name}>
                <label className="cfg-row">
                  <input type="checkbox" checked={on} onChange={() => toggleRule(name)} />
                  <b>{meta.rule_spec[name].label}</b>
                  <span className="cfg-hint">{name}</span>
                </label>
                {on && (
                  <span className="cfg-row">
                    {Object.keys(meta.rule_spec[name].params).map((param) => (
                      <span className="cfg-row" key={param}>
                        <span className="cfg-hint">{param}</span>
                        <Num width={74} step="1" value={p.rules[name][param]}
                             onChange={(v) => edit((c) => { c.rules[name][param] = v; })} />
                      </span>
                    ))}
                    <span className="cfg-hint">weight</span>
                    <Num width={74} step="0.05" value={p.fc_weights[name] ?? 0}
                         onChange={(v) => edit((c) => { c.fc_weights[name] = v; })} />
                  </span>
                )}
              </div>
            );
          })}
          <div className="cfg-hint">Forecast weights sum to {weightSum.toFixed(3)} — they must sum to 1.</div>
        </div>

        {errors.length > 0 && (
          <ul className="cfg-errors">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}

        <div className="cfg-foot">
          {meta.configured && <button className="calib-btn" onClick={onClose} disabled={saving}>Cancel</button>}
          <button className="calib-btn on" onClick={save} disabled={saving}>
            {saving ? 'Rebuilding…' : meta.configured ? 'Save and rebuild' : 'Save and run'}
          </button>
        </div>
      </div>
    </div>
  );
}

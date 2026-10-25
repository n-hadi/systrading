/* Palette, formatters, layout constants and SVG path builders — the parts of
 * the design's logic that carry no component state. Ported from
 * "Carver Terminal.dc.html". */

export const CO = {
  text: '#e9e9ed', mute: '#75798c', dim: '#9397ab', grid: 'rgba(233,233,237,0.07)',
  axis: 'rgba(233,233,237,0.22)', panel: '#1b1d2c', a: '#9184d9', a3: '#d2cefd', a4: '#b5abfc',
  a5: '#968ae0', a6: '#796cbf', a7: '#5d5294', a8: '#423a6a', n6: '#75798c', n7: '#595d6c', n8: '#3f424d',
};

/** Finite-number guard. Every series in the payload may hold nulls. */
export const nn = (v) => v !== null && v !== undefined && Number.isFinite(v);

/* Authored outer width of each panel — charts inside derive from this via
   innerW(), so a panel resize can't leave a chart at a stale literal.
   A panel's content box measures outer − 25, so innerW sits 1px inside. */
export const PANEL_W = {
  fc: 520, corr: 496, dd: 1000, pvol: 604, summary: 1100, trades: 528,
  capital: 508, pnl: 1000, cum: 612, hist: 600, fchist: 600, exposure: 508,
  costs: 1616,
};

/** [i0, i1] — the trailing `bars` rows of `n`. The backend sends the window
    list in parameters.windows, where null means the whole history. */
export function windowRange(n, bars) {
  return [bars == null ? 0 : Math.max(0, n - bars), n - 1];
}

export const f = {
  n: (v, d = 2) => (nn(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'),
  i: (v) => (nn(v) ? Math.round(v).toLocaleString('en-US') : '—'),
  pct: (v, d = 1) => (nn(v) ? (v * 100).toFixed(d) + '%' : '—'),
  sgn: (v, d = 2) => (nn(v) ? (v > 0 ? '+' : '') + v.toFixed(d) : '—'),
  cash: (v, sign) => {
    if (!nn(v)) return '—';
    if (Math.round(v) === 0) return '$0';
    const s = v < 0 ? '−' : (sign ? '+' : ''), a = Math.abs(v);
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'k';
    return s + '$' + a.toFixed(0);
  },
  money: (v) => (nn(v) ? (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'),
};

/** Columnar API data -> the row objects Recharts wants, sliced to the window. */
export function rows(dates, cols, i0, i1) {
  const out = [];
  for (let i = i0; i <= i1; i++) {
    const row = { Date: dates[i] };
    for (const k in cols) row[k] = cols[k][i];
    out.push(row);
  }
  return out;
}

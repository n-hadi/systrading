/* Shared Recharts props. Constants, not wrappers — each chart is written out
   in full where it is used, and spreads these so the axes and tooltips match. */

export const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: '#75798c', fontSize: 8.5 },
};

export const MARGIN = { top: 7, right: 8, bottom: 2, left: 0 };

export const TOOLTIP = {
  isAnimationActive: false,
  cursor: { stroke: '#9184d9', strokeWidth: 1, strokeDasharray: '2 2' },
  contentStyle: {
    background: '#20223a',
    border: '1px solid rgba(145,132,217,.5)',
    borderRadius: 6,
    fontSize: 10.5,
    padding: '7px 9px',
  },
  labelStyle: { color: '#9397ab', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' },
  itemStyle: { padding: 0 },
};

/** Every line and area: no dots, no animation, break on null. */
export const CURVE = { dot: false, isAnimationActive: false, connectNulls: false };

export const shortDate = (d) => (typeof d === 'string' ? d.slice(2, 7) : d);

/** Symmetric y-domain around zero, for forecast and position charts. */
export const symDomain = ([min, max]) => {
  const m = Math.max(Math.abs(min), Math.abs(max)) || 1;
  return [-m, m];
};

/* Recharts 3 reports the active bar as a STRING (its TooltipIndex is
   `string | null`), so it must be converted before any arithmetic — `i0 + idx`
   would otherwise concatenate into a garbage index. Returns null when no bar
   is active. */
export function activeIndex(state) {
  const raw = state?.activeTooltipIndex;
  if (raw == null) return null;
  const k = Number(raw);
  return Number.isFinite(k) ? k : null;
}

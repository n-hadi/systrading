# Carver Terminal — React frontend

A React app for the systematic trading framework in `../framework`. It reads the
`results` dictionary the framework publishes over Flask and renders the
"Carver Terminal" dashboard designed in Claude Design.

## Running it

Start the framework first — it serves the feed:

```bash
python run.py
```

That prints `http://127.0.0.1:8765/api/results`. Then, from this folder:

```bash
npm install
```

```bash
npm run dev
```

The terminal opens at http://localhost:5173 and polls the feed every 20 seconds.
The indicator in the top bar reads **Live** with the time of the last successful
poll, **Stale** if a later poll failed while data is still on screen, or
**No feed** before the first success. Clicking it forces a refresh.

If the framework isn't running you get an error panel rather than a blank page —
there is no offline data in the app.

## Configuration

Copy `.env.example` to `.env` to change anything:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | `http://127.0.0.1:8765` | Flask origin. Empty string routes through the Vite dev proxy instead. |
| `VITE_POLL_SECONDS` | `20` | Poll interval; `0` disables polling. |
| `VITE_START_TAB` | `overview` | `overview` or `instruments`. |
| `VITE_DEFAULT_WINDOW` | `1Y` | `3M`, `1Y`, `5Y` or `ALL`. |
| `VITE_FEE_PER_CONTRACT` | `2.25` | Used to estimate fees — see "Not from the framework". |

The framework already sends `Access-Control-Allow-Origin: *`, so the browser can
call port 8765 directly. The proxy in `vite.config.js` is only needed if you
prefer same-origin requests.

## How it is put together

```
src/
  api.js              feed adapter — fetch /api/results, reshape to the UI's contract
  config.js           env-var configuration
  Terminal.jsx        the component: state, polling, and all derived values
  lib/
    chart.jsx         the SVG chart engine
    format.js         palette, formatters, panel widths, path builders
    css.js            CSS-declaration-string -> React style object
  views/
    Nav.jsx           top bar, feed indicator, calibration popover
    Overview.jsx      portfolio tab
    Instruments.jsx   per-instrument tab
    Status.jsx        loading strip and feed-error panel
  styles/
    nocturne.css      the design system's tokens and classes
    terminal.css      the artboard's own page styles
```

Two things are worth knowing before changing it.

**This is a port, not a reimplementation.** The design was a Design Component:
markup with `{{ holes }}` plus a `DCLogic` class whose `renderVals()` computed
every hole. Its charts were already built with `React.createElement`. So
`Terminal.jsx` keeps that class structure and `renderVals()` almost verbatim,
and the views are the artboard's markup turned into JSX that reads the resulting
`v` object. Keeping the shapes identical makes the two diffable; changing the
architecture would have meant re-deriving a few thousand lines of chart maths.
`api.js` is the design project's own adapter, copied unchanged.

**Styles stay as CSS strings.** The design builds styles conditionally as CSS
declaration strings (`pillStyle`, `panelStyle`, `fcCell`), and `lib/css.js`
parses them into React style objects. That's why the logic reads the same as the
design's. One consequence: never set a CSS shorthand and one of its longhands in
the same string (`border` plus `border-color`, `font` plus `font-size`) — React
drops one of the pair across rerenders. Write the whole shorthand instead.

The layout is a fixed 1680px artboard, as designed. The page centres it and
scrolls rather than reflowing panels that were never drawn for other widths.

## Not from the framework

Some things on screen aren't in the payload and are derived or stood in for
here. They were part of the design and are kept, but they are not model output:

- **Trading fees and the trades list.** The framework records no fills or costs.
  A "trade" is any bar where `portfolio_pos` changed, and the fee is
  `|Δ portfolio_pos| × VITE_FEE_PER_CONTRACT`.
- **The "breakout" forecast column** and the `s_mock` signal in the per-instrument
  signal-correlation matrix are placeholders derived from 63-day range position,
  so the panels carry a third rule. There is no breakout rule in the framework.
- **`sma_*`, `high_*`, `low_*`, `range_position_*`** are computed in `api.js`
  from `Close`; the framework doesn't publish them.
- **Gross exposure** is summed from per-instrument `|exposure|`; only net
  (`pf_exposure`) comes from the framework.
- **Correlations** are recomputed in the browser from aligned close returns or
  combined forecasts. The payload's `signal_corr` and `*_corr_histories` are
  carried through but not what the panels draw.

## One fix made during the port

The design assumed instrument frames and the portfolio frame share a row index.
They don't: instrument frames hold the full price history (2,515 bars from 2016)
while the portfolio frame only covers the simulated range (449 bars from 2025).
Reading an instrument series at a portfolio index therefore returned 2017 data
under 2026 labels, and made the trades list and fee total come out empty.

Instrument series are now aligned onto the portfolio's date axis before being
drawn against it (`alignCol`), and fees and trades walk each instrument's own
rows filtered to the window (`windowRows`). If you add a panel that mixes the
two frames, align by date — never by index.

## Known gaps

- The **Range** date pickers in the top bar seed from the active window but do
  not filter it; the window tabs on the Instruments tab do the filtering. This
  was the design's behaviour and is unchanged.
- The **Portfolio** dropdown in the top bar (Futures / Stocks / …) is decorative.

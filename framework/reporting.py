import numpy as np

from settings import WINDOWS, VOLATILITY_TARGET, FEE_PER_TRADE


BINS = 25


def add_costs_and_cumulative(df):
    """Per-bar trade size, its cost, and the running P&L, on one instrument."""
    pos = df["portfolio_pos"]

    # portfolio_pos is NaN outside the simulated range; the bar before the
    # first simulated one counts as flat, so entering a position is a trade.
    previous = pos.shift()
    previous = previous.where(previous.notna() | pos.isna(), 0.0)

    df["trade"] = (pos - previous).where(pos.notna())
    df["cost"] = ((df["trade"].fillna(0) != 0) * FEE_PER_TRADE).where(pos.notna())
    df["cum_pnl"] = df["pnl"].cumsum()
    return df


def get_trades(instruments_data):
    """Every bar on which the portfolio position changed, newest first."""
    trades = []
    for ticker, instrument in instruments_data.items():
        df = instrument["dataframe"]
        changed = df[df["trade"].fillna(0) != 0]

        for date, row in changed.iterrows():
            trades.append({
                "date": date,
                "instrument": ticker,
                "close": row["Close"],
                "trade": row["trade"],
                "portfolio_pos": row["portfolio_pos"],
                "cost": row["cost"],
            })

    trades.sort(key=lambda t: t["date"], reverse=True)
    return trades


def tail(series, bars):
    """The trailing `bars` rows, or all of them when bars is None.

    Slice first, drop missing values second. The other order would take the
    last `bars` *present* values, which reaches back a different distance for
    every series -- a window would then cover a different span per instrument.
    """
    if bars is not None:
        series = series.iloc[-bars:]
    return series.dropna()


def get_stats(portfolio, bars):
    pnl = tail(portfolio["pf_pnl"], bars)
    capital = tail(portfolio["capital"], bars)
    drawdown = tail(portfolio["drawdown_pct"], bars)
    vol = tail(portfolio["realized_vol"], bars)
    cost = tail(portfolio["pf_cost"], bars)
    trades = tail(portfolio["pf_trades"], bars)

    return {
        "bars": len(pnl),
        "pnl": pnl.sum(),
        "best_bar": pnl.max(),
        "worst_bar": pnl.min(),
        "avg_bar": pnl.mean(),
        "up_bars": (pnl > 0).mean(),
        "peak_capital": capital.max(),
        "end_capital": capital.iloc[-1] if len(capital) else None,
        "max_drawdown_pct": drawdown.min(),
        "vol_mean": vol.mean(),
        "vol_min": vol.min(),
        "vol_max": vol.max(),
        "bars_over_target": (vol > VOLATILITY_TARGET).mean(),
        "cost": cost.sum(),
        "trades": int(trades.sum()),

        # each instrument's contribution over the same window, so the frontend
        # never sums across instruments
        "pnl_by_instrument": {
            column[len("pnl_"):]: tail(portfolio[column], bars).sum()
            for column in portfolio.columns
            if column.startswith("pnl_")
        },
    }


def get_distribution(series, bars):
    """Binned counts plus moments. The domain is set by the 99th percentile so
    a single outlier cannot squash every other observation into one bin;
    values beyond it are counted in the outer bins rather than dropped."""
    values = tail(series, bars)

    if len(values) < 2:
        return {"n": len(values), "centres": [], "counts": []}

    edge = max(np.percentile(values.abs(), 99) * 1.15, 1e-9)
    edges = np.linspace(-edge, edge, BINS + 1)
    counts, _ = np.histogram(values.clip(-edge, edge), bins=edges)
    sd = values.std()

    return {
        "n": len(values),
        "centres": ((edges[:-1] + edges[1:]) / 2).tolist(),
        "counts": counts.tolist(),
        "mean": values.mean(),
        "sd": sd,
        "annualised_sd": sd * np.sqrt(252),
        "skew": values.skew(),
        "excess_kurtosis": values.kurtosis(),
        "p05": values.quantile(0.05),
        "p95": values.quantile(0.95),
        "win_rate": (values > 0).mean(),
    }


def get_reporting(instruments_data, portfolio, start_capital):
    """Everything the dashboard displays but does not compute itself."""
    stats = {name: get_stats(portfolio, bars) for name, bars in WINDOWS.items()}

    distributions = {
        "portfolio": {
            name: get_distribution(portfolio["returns"], bars)
            for name, bars in WINDOWS.items()
        },
        "instruments": {
            ticker: {
                # how the market moves, and how our position on it pays
                "returns": {
                    name: get_distribution(instrument["dataframe"]["returns"], bars)
                    for name, bars in WINDOWS.items()
                },
                "pnl": {
                    name: get_distribution(instrument["dataframe"]["pnl"] / start_capital, bars)
                    for name, bars in WINDOWS.items()
                },
            }
            for ticker, instrument in instruments_data.items()
        },
    }

    return stats, distributions

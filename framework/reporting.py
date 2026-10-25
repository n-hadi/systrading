import numpy as np
import pandas as pd

from settings import WINDOWS, VOLATILITY_TARGET, INSTRUMENTS, ANNUALISATION
from calibration import ssp_weight, ssp_div_mp


BINS = 25

# The most of its Sharpe ratio Carver is willing to hand over in costs each
# year, for a staunch systems trader. Reported against, never enforced.
SPEED_LIMIT = 0.13

# Below this many blocks the forecast can swing a long way without the rounded
# position moving, so the instrument barely responds to the system.
MIN_BLOCKS = 4


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


def last(series):
    """The most recent value that exists, or None."""
    series = series.dropna()
    return series.iloc[-1] if len(series) else None


def get_turnover(df, bars):
    """Round trips per year: blocks traded over twice the average holding.

    Volatility standardised by construction -- a round trip is a buy and sell
    of an average sized position -- so it is comparable across instruments.
    """
    held = tail(df["portfolio_pos"].abs(), bars)
    traded = tail(df["trade"].abs(), bars)

    if not len(traded) or not held.mean():
        return None
    return (traded.sum() * ANNUALISATION / len(traded)) / (2 * held.mean())


def get_costs(df, ticker):
    """Carver's speed-and-size numbers for one instrument.

    Standardised cost is what one round trip costs in Sharpe ratio units:
    twice the cost of a one-block trade, over the annualised cash volatility
    of one block. Dividing by risk is what makes a cheap instrument needing a
    large position comparable with an expensive one needing a small position.
    Multiplied by turnover it gives the Sharpe ratio paid away in costs each
    year, which Carver keeps under SPEED_LIMIT.

    None of this feeds back into the simulation -- it is read-only, and says
    whether the system is too fast or the account too small for an instrument.
    """
    spec = INSTRUMENTS[ticker]

    # Carver's C. A single-block trade pays the ticket fee as well.
    cost_per_trade = df["cost_per_block"] + spec["fee_per_ticket"]
    standardised = 2 * cost_per_trade / (df["instr_value_vol"] * np.sqrt(ANNUALISATION))

    vol_scalar = last(df["vol_scalar"])

    costs = {
        "cost_per_block": last(df["cost_per_block"]),
        "cost_per_trade": last(cost_per_trade),
        "instr_value_vol": last(df["instr_value_vol"]),
        "speed_limit": SPEED_LIMIT,
        "min_blocks": MIN_BLOCKS,

        # The biggest position the system could ever ask for. The combined
        # forecast is capped at 20 and the subsystem position is cfc/10 scaled,
        # so the maximum is twice the rest of the chain. Under ~4 blocks the
        # forecast can swing a long way without the rounded position moving.
        "max_position": None if vol_scalar is None else 2 * vol_scalar * ssp_weight * ssp_div_mp,
        "step": spec["step"],

        "standardised_cost": {},
        "turnover": {},
        "cost_sr": {},
    }

    for name, bars in WINDOWS.items():
        sc = tail(standardised, bars).mean()
        turnover = get_turnover(df, bars)
        costs["standardised_cost"][name] = sc
        costs["turnover"][name] = turnover
        costs["cost_sr"][name] = None if turnover is None or np.isnan(sc) else turnover * sc

    return costs


def get_stats(portfolio, bars, vol_target=VOLATILITY_TARGET):
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
        "bars_over_target": (vol > vol_target).mean(),
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


def get_meta(portfolios):
    """The portfolios added together. Reporting only: no sizing decision
    anywhere reads this, and no portfolio knows the others exist.

    Days a portfolio does not trade contribute no P&L but keep their capital,
    which is why P&L is zero filled and capital is carried forward.
    """
    index = pd.DatetimeIndex(sorted(set().union(
        *(p["portfolio"]["dataframe"].index for p in portfolios.values()))))

    meta = pd.DataFrame(index=index)
    meta["pf_pnl"] = 0.0
    meta["pf_cost"] = 0.0
    meta["pf_trades"] = 0
    meta["capital"] = 0.0

    start_capital = 0.0
    weighted_target = 0.0

    for name, portfolio in portfolios.items():
        df = portfolio["portfolio"]["dataframe"]
        params = portfolio["portfolio"]["parameters"]
        net = (df["pf_pnl"] - df["pf_cost"]).reindex(index).fillna(0)

        meta[f"pnl_{name}"] = net
        meta["pf_pnl"] += df["pf_pnl"].reindex(index).fillna(0)
        meta["pf_cost"] += df["pf_cost"].reindex(index).fillna(0)
        meta["pf_trades"] += df["pf_trades"].reindex(index).fillna(0).astype(int)
        meta["capital"] += df["capital"].reindex(index).ffill().bfill()

        start_capital += params["start_capital"]["value"]
        weighted_target += params["volatility_target"] * params["start_capital"]["value"]

    # the union index is daily as soon as one portfolio trades every day
    annualisation = max(p["portfolio"]["parameters"]["annualisation"] for p in portfolios.values())
    vol_target = weighted_target / start_capital

    meta["cum_pnl"] = meta["pf_pnl"].cumsum()
    meta["cum_cost"] = meta["pf_cost"].cumsum()
    meta["returns"] = (meta["pf_pnl"] - meta["pf_cost"]) / meta["capital"].shift(1)
    meta["realized_vol"] = meta["returns"].rolling(annualisation).std() * np.sqrt(annualisation)

    high = meta["capital"].cummax()
    meta["drawdown"] = meta["capital"] - high
    meta["drawdown_pct"] = meta["capital"] / high - 1

    return {
        "dataframe": meta,
        "parameters": {
            "label": "Meta",
            "windows": WINDOWS,
            "annualisation": annualisation,
            "volatility_target": vol_target,
            "start_capital": {"currency": ["USD", "$"], "value": start_capital},
            "portfolios": {
                name: {
                    "label": p["label"],
                    "start_capital": p["portfolio"]["parameters"]["start_capital"]["value"],
                    "volatility_target": p["portfolio"]["parameters"]["volatility_target"],
                    "amount_instruments": p["portfolio"]["parameters"]["amount_instruments"],
                }
                for name, p in portfolios.items()
            },
        },
        "stats": {name: get_stats(meta, bars, vol_target) for name, bars in WINDOWS.items()},
        "distributions": {name: get_distribution(meta["returns"], bars)
                          for name, bars in WINDOWS.items()},
    }

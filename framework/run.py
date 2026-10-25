import importlib
import os
import sys

import pandas as pd
import numpy as np

import settings
from webserver import open_dashboard


# Every one of these binds something from settings at import time — module
# constants, a default argument in add_volatility, calibration's ssp_weight,
# the fc_scalars cache in forecasts. A configuration change therefore only
# takes effect if they are re-imported, in dependency order.
STATEFUL_MODULES = (
    "settings",
    "calibration",
    "indicators",
    "rules",
    "forecasts",
    "utils",
    "position_sizing",
    "reporting",
)


def build_results():
    """Every portfolio, plus the meta view that adds them up."""
    cfg = settings.load() or settings.DEFAULTS

    portfolios = {name: build_portfolio(name) for name in cfg["portfolios"]}

    from reporting import get_meta
    return {"portfolios": portfolios, "meta": get_meta(portfolios)}


def build_portfolio(name):
    """Run one portfolio's simulation against the saved configuration.

    Imports live inside the function so each build picks up the freshly
    reloaded modules rather than references captured when run.py was first
    imported.
    """
    os.environ["CARVER_PORTFOLIO"] = name

    for module in STATEFUL_MODULES:
        if module in sys.modules:
            importlib.reload(sys.modules[module])

    import settings
    from download import download_update_data
    from indicators import add_indicators
    from rules import add_rules
    from forecasts import add_forecasts
    from correlations import get_corr_histories, get_signal_corr_histories
    from position_sizing import (add_contract_value, add_cost_per_block, calc_vol_scalar,
                                 calc_ssp, calc_pp, calc_exposure, calc_cost, calc_pnl)
    from reporting import get_costs, get_trades, get_reporting
    from utils import get_parameters

    instrument_tickers = list(settings.INSTRUMENTS.keys())

    download_update_data(instrument_tickers)

    instruments_data = {}

    # ---------------------------------------------------------
    # Instrument preprocessing
    # ---------------------------------------------------------

    for instrument in instrument_tickers:
        df = pd.read_csv(f"historical_data/{instrument}.csv", parse_dates=["Date"], index_col="Date")

        df = df[~df.index.duplicated(keep="last")]
        df = df.sort_index()

        df = add_indicators(df)
        df = add_rules(df)
        df = add_forecasts(df)

        df = add_contract_value(df, instrument)
        df = add_cost_per_block(df, instrument)

        ### from here instruments cannot be calculated independently due to interdependece of capital ###
        ### loop date wise ; date - instruments ###

        instruments_data[instrument] = {
            **settings.INSTRUMENTS[instrument],
            "dataframe": df,
            "signal_corr": get_signal_corr_histories(df)
        }

    # ---------------------------------------------------------
    # Portfolio simulation
    # ---------------------------------------------------------

    date_range = settings.DATE_RANGE
    capital = settings.START_CAPITAL["value"]

    portfolio = pd.DataFrame(index=date_range)

    portfolio["pf_pnl"] = 0.0
    portfolio["pf_cost"] = 0.0
    portfolio["pf_exposure"] = 0.0
    portfolio["capital"] = 0.0
    portfolio["daily_cash_vol_target"] = 0.0

    for date in date_range:

        daily_cash_vol_target = (capital*settings.VOLATILITY_TARGET)/np.sqrt(settings.ANNUALISATION)

        daily_portfolio_pnl = 0
        daily_portfolio_cost = 0
        daily_portfolio_exposure = 0

        for instrument in instrument_tickers:

            df = instruments_data[instrument]["dataframe"]

            if date not in df.index:
                continue

            vol_scalar, instr_value_vol = calc_vol_scalar(df, instrument, date, daily_cash_vol_target)
            df.loc[date, "vol_scalar"] = vol_scalar
            df.loc[date, "instr_value_vol"] = instr_value_vol

            subsystem_pos = calc_ssp(df, date, vol_scalar)
            df.loc[date, "subsystem_pos"] = subsystem_pos

            portfolio_pos_raw, portfolio_pos = calc_pp(
                df, date, subsystem_pos, settings.INSTRUMENTS[instrument]["step"])
            df.loc[date, "portfolio_pos_raw"] = portfolio_pos_raw
            df.loc[date, "portfolio_pos"] = portfolio_pos

            exposure = calc_exposure(df, date, portfolio_pos)
            df.loc[date, "exposure"] = exposure
            daily_portfolio_exposure += exposure

            trade, cost = calc_cost(df, instrument, date, portfolio_pos)
            df.loc[date, "trade"] = trade
            df.loc[date, "cost"] = cost
            daily_portfolio_cost += cost

            pnl = calc_pnl(df, instrument, date)
            df.loc[date, "pnl"] = pnl
            daily_portfolio_pnl += pnl

        # costs come out of capital, so they feed back into the next bar's
        # cash volatility target and therefore into every position after it
        capital += daily_portfolio_pnl - daily_portfolio_cost

        portfolio.loc[date, "pf_exposure"] = daily_portfolio_exposure
        portfolio.loc[date, "pf_pnl"] = daily_portfolio_pnl
        portfolio.loc[date, "pf_cost"] = daily_portfolio_cost

        portfolio.loc[date, "daily_cash_vol_target"] = daily_cash_vol_target
        portfolio.loc[date, "capital"] = capital

    # ---------------------------------------------------------
    # Reporting
    # ---------------------------------------------------------

    portfolio["cum_pnl"] = portfolio["pf_pnl"].cumsum()
    portfolio["pf_trades"] = 0

    for instrument in instrument_tickers:
        df = instruments_data[instrument]["dataframe"]
        df["cum_pnl"] = df["pnl"].cumsum()
        instruments_data[instrument]["costs"] = get_costs(df, instrument)

        # each instrument's P&L on the portfolio's own date index, so the frontend
        # never has to align two frames of different lengths
        portfolio[f"pnl_{instrument}"] = df["pnl"].reindex(portfolio.index)

        # several instruments can trade on the same day, so trades are counted
        # per instrument rather than inferred from the daily cost
        portfolio["pf_trades"] += (df["trade"].reindex(portfolio.index).fillna(0) != 0).astype(int)

    portfolio["cum_cost"] = portfolio["pf_cost"].cumsum()

    portfolio["returns"] = (portfolio["pf_pnl"] - portfolio["pf_cost"]) / portfolio["capital"].shift(1)
    portfolio["realized_vol"] = (portfolio["returns"].rolling(settings.ANNUALISATION).std()
                                 * np.sqrt(settings.ANNUALISATION))

    high = portfolio["capital"].cummax()
    portfolio["drawdown"] = portfolio["capital"] - high
    portfolio["drawdown_pct"] = portfolio["capital"] / high - 1

    stats, distributions = get_reporting(
        instruments_data, portfolio, settings.START_CAPITAL["value"]
    )

    return {
        "label": settings.LABEL,
        "instruments": instruments_data,
        "portfolio": {
            "dataframe": portfolio,
            "parameters": get_parameters(fc_scalar_calc_basis=instruments_data[instrument_tickers[0]]["dataframe"]),
            "returns_corr_histories": get_corr_histories(instruments_data, "returns"),
            "cfc_corr_histories": get_corr_histories(instruments_data, "cfc"),
            "stats": stats,
        },
        "trades": get_trades(instruments_data),
        "distributions": distributions,
    }


if __name__ == "__main__":
    # An unconfigured framework still serves, so the frontend can run its
    # first-time setup against /api/config.
    open_dashboard(build_results, configured=settings.exists())

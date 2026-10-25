from settings import INSTRUMENTS, VOLATILITY_WINDOW, START_CAPITAL
from utils import calc_exchange_rate
from calibration import ssp_weight, ssp_div_mp
import numpy as np

def add_contract_value(df, instrument_ticker):
    multiplier = INSTRUMENTS[instrument_ticker]["multiplier"]
    df["contract_value"] = df["Close"] * multiplier
    return df

def add_cost_per_block(df, instrument_ticker):
    """What one block costs to trade: half the spread plus the fees that scale
    with size. The ticket fee is per trade, not per block, so it is added in
    calc_cost instead."""
    spec = INSTRUMENTS[instrument_ticker]
    df["cost_per_block"] = (
        spec["spread"] / 2 * spec["multiplier"]
        + spec["fee_per_unit"]
        + spec["fee_percent"] / 100 * df["contract_value"]
    )
    return df

def calc_vol_scalar(df, instrument_ticker, date, daily_cash_vol_target):
    instrument = INSTRUMENTS[instrument_ticker]

    xc_rate = calc_exchange_rate(
        START_CAPITAL["currency"][0],
        instrument["block_currency"][0]
    )

    daily_price_vol = df.loc[date, f"return_vol_{VOLATILITY_WINDOW}"]

    block_value = df.loc[date, "contract_value"]

    instr_value_vol = daily_price_vol * block_value * xc_rate

    vol_scalar = daily_cash_vol_target / instr_value_vol

    return vol_scalar, instr_value_vol

def calc_ssp(df, date, vol_scalar):
    return df.loc[date, "cfc"] * vol_scalar / 10


def calc_pp(df, date, subsystem_pos, step=1):
    """Round to the smallest tradeable amount. One contract for futures, a
    fraction of a coin or a micro lot elsewhere -- without this a perp
    position would round to zero at any sane account size."""
    portfolio_pos_raw = subsystem_pos * ssp_weight * ssp_div_mp

    if np.isnan(portfolio_pos_raw):
        return portfolio_pos_raw, portfolio_pos_raw

    return portfolio_pos_raw, round(round(portfolio_pos_raw / step) * step, 8)

def calc_exposure(df, date, portfolio_pos):
    return portfolio_pos * df.loc[date, "contract_value"]

def calc_cost(df, instrument_ticker, date, portfolio_pos):
    """The trade on this bar and what it cost. Charged to capital on the same
    bar, so the next bar's cash vol target already reflects it."""
    previous_date = df.index[df.index < date][-1]
    previous_position = df.loc[previous_date, "portfolio_pos"]

    if np.isnan(previous_position):
        previous_position = 0

    trade = portfolio_pos - previous_position

    if np.isnan(trade) or trade == 0:
        return trade, 0.0

    ticket = INSTRUMENTS[instrument_ticker]["fee_per_ticket"]
    return trade, ticket + abs(trade) * df.loc[date, "cost_per_block"]

def calc_pnl(df, instrument_ticker, date):
    multiplier = INSTRUMENTS[instrument_ticker]["multiplier"]

    previous_date = df.index[df.index < date][-1]

    previous_position = df.loc[previous_date, "portfolio_pos"]

    if np.isnan(previous_position):
        previous_position = 0

    price_change = (
        df.loc[date, "Close"]
        - df.loc[previous_date, "Close"]
    )

    return previous_position * multiplier * price_change

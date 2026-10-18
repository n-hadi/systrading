import numpy as np
import pandas as pd
from settings import VOLATILITY_WINDOW, INDICATORS

indicators = INDICATORS


def add_returns(df):
    df["returns"] = df["Close"].pct_change()
    return df


def add_ewma(df, windows=None):
    if windows is None:
        windows = [5, 10, 20, 63, 126, 252]

    price = df["Close"]

    for n in windows:
        df[f"ewma_{n}"] = price.ewm(span=n, adjust=False).mean()

    return df


def add_volatility(df, window=VOLATILITY_WINDOW):
    returns = df["returns"]

    df[f"return_vol_{window}"] = returns.ewm(span=window, adjust=False, min_periods=window).std()

    upside_returns = returns.where(returns > 0, 0)
    downside_returns = returns.where(returns < 0, 0)

    df[f"return_upside_vol_{window}"] = upside_returns.ewm(span=window, adjust=False, min_periods=window).std()
    
    df[f"return_downside_vol_{window}"] = downside_returns.ewm(span=window, adjust=False, min_periods=window).std()
    
    df[f"return_updown_vol_ratio_{window}"] = df[f"return_upside_vol_{window}"] / df[f"return_downside_vol_{window}"]
        

    
    price_diff = df["Close"].diff()
    df[f"price_vol_{window}"] = price_diff.ewm(span=window, adjust=False, min_periods=window).std()
    
    return df


def add_drawdown(df, windows=None):
    if windows is None:
        windows = [20, 63, 126, 252]

    price = df["Close"]

    for n in windows:
        high = price.rolling(n).max()
        drawdown_pct = price / high - 1

        df[f"drawdown_{n}"] = price - high
        df[f"drawdown_pct_{n}"] = drawdown_pct
    return df

def add_bollinger_bands(df, windows=None, num_std=2):
    if windows is None:
        windows = [20, 63]

    price = df["Close"]

    for n in windows:
        sma = price.rolling(n).mean()
        std = price.rolling(n).std()

        df[f"bb_mid_{n}"] = sma
        df[f"bb_upper_{n}"] = sma + num_std * std
        df[f"bb_lower_{n}"] = sma - num_std * std

    return df

def add_rsi(df, window=14):
    delta = df["Close"].diff()

    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(
        alpha=1 / window,
        adjust=False,
        min_periods=window
    ).mean()

    avg_loss = loss.ewm(
        alpha=1 / window,
        adjust=False,
        min_periods=window
    ).mean()

    rs = avg_gain / avg_loss

    df["rsi"] = 100 - (100 / (1 + rs))

    return df



def add_indicators(df):

    if "returns" in indicators:
        df = add_returns(df)

    if "ewma" in indicators:
        df = add_ewma(df, indicators["ewma"]["windows"])

    if "volatility" in indicators:
        df = add_volatility(df, indicators["volatility"]["window"])

    if "drawdown" in indicators:
        df = add_drawdown(df, indicators["drawdown"]["windows"])

    if "bollinger" in indicators:
        df = add_bollinger_bands(
            df,
            indicators["bollinger"]["windows"],
            indicators["bollinger"]["num_std"])

    if "rsi" in indicators:
        df = add_rsi(df, indicators["rsi"]["window"])
    return df
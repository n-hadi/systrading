import numpy as np
import pandas as pd

VOLATILITY_TARGET = 0.5
VOLATILITY_WINDOW = 25

# Placeholder cost: a flat charge every time the portfolio position changes,
# regardless of how many contracts moved. Reporting only - it does not reduce
# capital, so position sizing is unaffected.
FEE_PER_TRADE = 1.5

# Reporting windows, in trading days. These are display/aggregation ranges
# ("how much history am I summarising"), NOT estimation lookbacks - the
# correlation and volatility windows are model parameters and live elsewhere.
# The backend computes every window; each frontend panel offers a subset.
WINDOWS = {
    "1M": 21,
    "3M": 63,
    "6M": 126,
    "1Y": 252,
    "2Y": 504,
    "5Y": 1260,
    "ALL": None,
}
START_CAPITAL = {
    "currency": ("USD","$"),
    "value": 1000000
    }

START_DATE = pd.Timestamp("2025-01-01")
END_DATE = pd.Timestamp.now()
DATE_RANGE = pd.date_range(
    START_DATE,
    END_DATE,
    freq="B"
) 

INSTRUMENTS = {
    "ES=F": {
        "name": "E-Mini S&P 500",
        "multiplier": 50,
        "block_currency": ("USD","$"),
        "type": ("FUT", "Future")
    },

    "YM=F": {
        "name": "Mini Dow Jones Industrial",
        "multiplier": 5,
        "block_currency": ("USD","$"),
        "type": ("FUT", "Future")
    },
    "CC=F": {
        "name": "Cocoa",
        "multiplier": 10,
        "block_currency": ("USD","$"),
        "type": ("FUT", "Future")
    },
    "GC=F": {
        "name": "Gold",
        "multiplier": 100,
        "block_currency": ("USD","$"),
        "type": ("FUT", "Future")
    },
}
RULES = {
       # price_scaled: the raw signal is denominated in price units, so it carries
       # the instrument's price scale and must be divided by price volatility
       # before one shared forecast scalar can apply across instruments.
       # A dimensionless signal is already comparable and must not be divided,
       # or the price scale gets re-injected.
       "ewmac": {
              "slow": 63,
              "fast": 10,
              "price_scaled": True,
       },
       "rsi_mr": {
              "window": 14,
              "price_scaled": False,
       },
}
INDICATORS  = {
    "returns": {},
    "ewma": {
        "windows": [10, 20, 63, 126]
    },
    "volatility": {
        "window": VOLATILITY_WINDOW
    },
    "drawdown": {
        "windows": None
    },
    "bollinger": {
        "windows": [20, 63],
        "num_std": 2
    },
    "rsi": {
        "window" : RULES["rsi_mr"]["window"]
    },
}
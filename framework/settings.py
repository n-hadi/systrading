"""Configuration: the file on disk, and the projection of one portfolio into
the module-level names every compute module imports.

The file lives next to the code as config.json. The frontend never touches it
— it goes through /api/config. Nothing is validated: a bad configuration fails
the rebuild, which rolls back to the previous one. If you manage to save
something that breaks this module at import time, delete config.json and the
setup form comes back.
"""

import json
import os

import pandas as pd


CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


# The rules the framework knows how to compute. A rule can only be enabled if
# it appears here. `price_scaled` says whether the raw signal carries the
# instrument's price scale and so must be divided by price volatility — that is
# a property of the signal's maths, not a user choice, so it is read from here
# rather than trusted from the saved file.
RULE_SPEC = {
    "ewmac": {
        "label": "EWMA crossover",
        "params": {"fast": 10, "slow": 63},
        "price_scaled": True,
    },
    "rsi_mr": {
        "label": "RSI mean reversion",
        "params": {"window": 14},
        "price_scaled": False,
    },
}


# What a newly added instrument starts as, so the frontend does not have to
# know the shape. Costs start at zero: a made-up estimate would be worse than
# an obvious one.
INSTRUMENT_DEFAULTS = {
    "name": "",
    "multiplier": 1,
    "block_currency": ["USD", "$"],
    "type": ["FUT", "Future"],
    "spread": 0,
    "fee_per_ticket": 0,
    "fee_per_unit": 0,
    "fee_percent": 0,
    # smallest tradeable amount. 1 contract for futures, a fraction of a coin
    # or a micro lot elsewhere.
    "step": 1,
}


# The values the framework shipped with, so accepting the defaults reproduces
# the previous behaviour exactly.
# The seed for a framework that has not been configured yet: the smallest
# complete shape that still imports and builds. Not meant to be useful -- the
# setup form is where you turn it into a real portfolio. Both multipliers are
# 1 because with one instrument and one rule there is nothing to diversify.
#
# calendar "B" is business days (futures, forex), "D" is every day (perps);
# it sets the date index and the annualisation factor. spread is a static
# estimate in price points -- we pay half of it on each trade.
DEFAULTS = {
    "portfolios": {
        "futures": {
            "label": "Futures",
            "calendar": "B",
            "volatility_target": 0.5,
            "volatility_window": 25,
            "start_capital": {"currency": ["USD", "$"], "value": 100000},
            "start_date": "2025-01-01",
            "instruments": {
                "ES=F": {"name": "E-Mini S&P 500", "multiplier": 50, "step": 1,
                         "block_currency": ["USD", "$"], "type": ["FUT", "Future"],
                         "spread": 0.25, "fee_per_ticket": 0, "fee_per_unit": 2.0,
                         "fee_percent": 0},
            },
            "rules": {"ewmac": {"fast": 10, "slow": 63}},
            "fc_weights": {"ewmac": 1.0},
            "fc_div_mp": 1.0,
            "ssp_div_mp": 1.0,
        },
    },
}


# What a newly added portfolio starts as, so the frontend does not have to
# know the shape. It comes with one instrument because a portfolio with none
# cannot be built.
PORTFOLIO_DEFAULTS = next(iter(DEFAULTS["portfolios"].values()))


def exists():
    return os.path.exists(CONFIG_PATH)


def load():
    """The saved configuration, or None when the framework is unconfigured."""
    if not exists():
        return None
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def save(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)


# ---------------------------------------------------------------------------
# The active portfolio, projected
# ---------------------------------------------------------------------------

# Which portfolio to project. It lives in the environment rather than in a
# module global because run.py reloads this module once per portfolio, and a
# global would be reset by the reload it is meant to survive.
ACTIVE = os.environ.get("CARVER_PORTFOLIO")

_all = load() or DEFAULTS
_cfg = _all["portfolios"].get(ACTIVE) or next(iter(_all["portfolios"].values()))


VOLATILITY_TARGET = _cfg["volatility_target"]
VOLATILITY_WINDOW = _cfg["volatility_window"]

START_CAPITAL = {
    "currency": tuple(_cfg["start_capital"]["currency"]),
    "value": _cfg["start_capital"]["value"],
}

LABEL = _cfg["label"]

# "B" business days, "D" every day. Sets both the date index and how many
# bars a year there are to annualise over.
CALENDAR = _cfg["calendar"]
ANNUALISATION = 252 if CALENDAR == "B" else 365

START_DATE = pd.Timestamp(_cfg["start_date"])
END_DATE = pd.Timestamp.now()
DATE_RANGE = pd.date_range(START_DATE, END_DATE, freq=CALENDAR)

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

INSTRUMENTS = {
    ticker: {
        "name": spec["name"],
        "multiplier": spec["multiplier"],
        "step": spec["step"],
        "block_currency": tuple(spec["block_currency"]),
        "type": tuple(spec["type"]),
        # Carver's cost decomposition. Costs are reported only - they do not
        # reduce capital, so position sizing is unaffected by them.
        "spread": spec["spread"],
        "fee_per_ticket": spec["fee_per_ticket"],
        "fee_per_unit": spec["fee_per_unit"],
        "fee_percent": spec["fee_percent"],
    }
    for ticker, spec in _cfg["instruments"].items()
}

# price_scaled comes from the rule spec, not the saved file: whether a signal
# carries the instrument's price scale is a fact about its maths, not a choice.
RULES = {
    name: {**params, "price_scaled": RULE_SPEC[name]["price_scaled"]}
    for name, params in _cfg["rules"].items()
}

FC_WEIGHTS = _cfg["fc_weights"]
FC_DIV_MP = _cfg["fc_div_mp"]
SSP_DIV_MP = _cfg["ssp_div_mp"]

# The EWMA spans have to cover whatever the crossover rules ask for, or a rule
# would reference a column that was never computed.
_rule_spans = {
    span
    for params in _cfg["rules"].values()
    for key, span in params.items()
    if key in ("fast", "slow")
}

INDICATORS = {
    "returns": {},
    "ewma": {
        "windows": sorted({10, 20, 63, 126} | _rule_spans)
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
        "window": _cfg["rules"].get("rsi_mr", {}).get("window", 14)
    },
}

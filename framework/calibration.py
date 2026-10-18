import pandas as pd
from settings import VOLATILITY_WINDOW, RULES, INSTRUMENTS


### Forecast scalars ###

# placeholder with fixed ranges to always have the same scalars
# scalars should be generated through bootstrapping and other research means and static
# scalars should be tied to the rules and subsystems not to the instruments themselves
start = "2021-08-22"
end = "2026-08-22"


def get_placeholder_fc_scalars(df):
    scalars = {}
    for rule in RULES:
        scalars[rule] = calc_placeholder_fc_scalar(df, rule)
    return scalars

def calc_placeholder_fc_scalar(df, rule):

    bounded_df = df[(df.index >= start) & (df.index <= end)]

    # must match add_fc exactly, or the scalar is fitted to a different quantity
    raw_fc = bounded_df[f"s_{rule}"]

    if RULES[rule]["price_scaled"]:
        raw_fc = raw_fc / bounded_df[f"price_vol_{VOLATILITY_WINDOW}"]

    raw_fc = raw_fc.dropna()

    fc_scalar = 10 / raw_fc.abs().mean()
    return fc_scalar


#### forecast weights ### 
fc_weights = {
    "ewmac": 0.6,
    "rsi_mr": 0.4
}

###  Forecast Diversifications multiplier ###
fc_div_mp = 1.1 


### Subsystem position weights ###
ssp_weight = 1/len(INSTRUMENTS)


### Subsystem diversification mulitiplier ###
ssp_div_mp = 1.15
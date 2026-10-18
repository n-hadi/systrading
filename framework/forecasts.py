import settings 
from calibration import fc_weights, fc_div_mp
from calibration import get_placeholder_fc_scalars

rules = settings.RULES
volatility_window= settings.VOLATILITY_WINDOW

fc_scalars = {}

def add_fc(df, rule):
    raw_fc = df[f"s_{rule}"]

    if rules[rule]["price_scaled"]:
        raw_fc = raw_fc / df[f"price_vol_{volatility_window}"]

    df[f"fc_{rule}"] = (raw_fc * fc_scalars[rule]).clip(-20, 20)
    return df

def add_cfc(df):
    cfc = 0
    for rule in rules:
        cfc += df[f"fc_{rule}"]*fc_weights[rule]
    df[f"cfc_raw"] = cfc
    df[f"cfc"] = (cfc*fc_div_mp)
    #df[f"cfc"] = (cfc*fc_div_mp).clip(-20, 20)
    return df

def add_forecasts(df):

    # scalar calculation requires indicators and rules first, hence injected into forecast file
    global fc_scalars 
    if not fc_scalars:  
        fc_scalars = get_placeholder_fc_scalars(df)    
        print("Forecast Scalars")
        for rule, scalar in fc_scalars.items():
            print(f"{rule}: {scalar:.6f}")

    for rule in rules:
        df = add_fc(df, rule)
    df = add_cfc(df)

    return df
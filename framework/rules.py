import numpy as np 
from settings import RULES

rules = RULES

#exponential weighted moving average crossover
def ewmac_rule(df, fast=10, slow=63):
    df["s_ewmac"] = df[f"ewma_{fast}"] - df[f"ewma_{slow}"]
    return df

def rsi_mr_rule(df):
    df["s_rsi_mr"] = 50 - df["rsi"]
    return df

def add_rules(df):

    if "ewmac" in rules:
        df = ewmac_rule(df, fast=rules["ewmac"]["fast"], slow=rules["ewmac"]["slow"])

    if "rsi_mr" in rules:
        df = rsi_mr_rule(df)
    
    return df



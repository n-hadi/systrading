import settings
import calibration
import pandas as pd
import json


def get_parameters(fc_scalar_calc_basis):

    params = {

        ## settings ##
        "label": settings.LABEL,
        "amount_instruments": len(settings.INSTRUMENTS),
        "volatility_target": settings.VOLATILITY_TARGET,
        "volatility_window": settings.VOLATILITY_WINDOW,
        "start_capital": settings.START_CAPITAL,
        "start_date": settings.START_DATE,
        "end_date": settings.END_DATE,
        "trading_rules": settings.RULES,
        "windows": settings.WINDOWS,
        "annualisation": settings.ANNUALISATION,

        ## calibration ##
        "fc_scalars": calibration.get_placeholder_fc_scalars(fc_scalar_calc_basis),

        "fc_weights": calibration.fc_weights,
        "fc_div_mp": calibration.fc_div_mp,

        "ssp_weight": calibration.ssp_weight,
        "ssp_div_mp": calibration.ssp_div_mp,
    }

    return params


def calc_exchange_rate(cash_currency, block_currency):
    if cash_currency == block_currency:
        return 1
    else:
        return 1



def print_json_architecture(obj, indent=0):
    prefix = " " * indent

    if isinstance(obj, dict):
        print(prefix + "{")
        for key, value in obj.items():
            print(prefix + f"  {key}:")
            print_json_architecture(value, indent + 4)
        print(prefix + "}")

    elif isinstance(obj, list):
        print(prefix + "[")
        if obj:
            print_json_architecture(obj[0], indent + 4)
        print(prefix + "]")

    else:
        print(prefix + type(obj).__name__)


    
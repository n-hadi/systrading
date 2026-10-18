from flask import Flask, jsonify
import json, math
import numpy as np
import pandas as pd


def isnull(o):
    """True for None / NaN / NaT / pd.NA, False for anything array-like."""
    try:
        return bool(pd.isna(o))
    except (TypeError, ValueError):
        return False


def clean(o):
    """Make the results dict JSON-legal. NaN/NA/NaT -> null, numpy -> python."""
    if isnull(o):
        return None
    if isinstance(o, pd.DataFrame):
        return {"Date": [str(d)[:10] for d in o.index],
                **{str(c): clean(o[c].tolist()) for c in o.columns}}
    if isinstance(o, pd.Series):
        return clean(o.tolist())
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, np.ndarray)):
        return [clean(v) for v in (o.tolist() if isinstance(o, np.ndarray) else o)]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return str(o)[:10]
    return o


def open_dashboard(results, port=8765):
    app = Flask(__name__)
    payload = clean(results)

    @app.after_request
    def cors(r):
        r.headers["Access-Control-Allow-Origin"] = "*"
        return r

    @app.get("/api/results")
    def all_results():
        return jsonify(payload)

    @app.get("/api/results/<ticker>")
    def one(ticker):
        return jsonify(payload.get(ticker)) if ticker in payload else ("not found", 404)

    print(f"http://127.0.0.1:{port}/api/results")
    app.run(port=port, threaded=True)

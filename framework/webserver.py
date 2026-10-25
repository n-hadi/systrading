from flask import Flask, jsonify, request
import json, math
import threading
import numpy as np
import pandas as pd

import settings


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


def open_dashboard(build, configured=True, port=8765):
    """Serve the dashboard. `build` recomputes the payload from the saved
    configuration and is called again whenever that configuration changes.

    The server starts even when nothing is configured, so the frontend can run
    its first-time setup; /api/results answers 409 until a build exists.
    """
    app = Flask(__name__)
    # keep the configured order of portfolios and instruments
    app.json.sort_keys = False

    state = {"payload": None}
    # rebuilding mutates the imported modules, so only one may run at a time
    lock = threading.Lock()

    def rebuild():
        state["payload"] = clean(build())

    if configured:
        rebuild()

    @app.after_request
    def cors(r):
        r.headers["Access-Control-Allow-Origin"] = "*"
        r.headers["Access-Control-Allow-Headers"] = "Content-Type"
        r.headers["Access-Control-Allow-Methods"] = "GET, PUT, OPTIONS"
        return r

    @app.route("/api/config", methods=["OPTIONS"])
    @app.route("/api/results", methods=["OPTIONS"])
    def preflight():
        return ("", 204)

    @app.get("/api/results")
    def all_results():
        if state["payload"] is None:
            return jsonify({"configured": False}), 409
        return jsonify(state["payload"])

    @app.get("/api/results/<ticker>")
    def one(ticker):
        payload = state["payload"] or {}
        return jsonify(payload.get(ticker)) if ticker in payload else ("not found", 404)

    @app.get("/api/config")
    def get_config():
        return jsonify({
            "configured": settings.exists(),
            "config": settings.load() or settings.DEFAULTS,
            "rule_spec": settings.RULE_SPEC,
            "instrument_defaults": settings.INSTRUMENT_DEFAULTS,
            "portfolio_defaults": settings.PORTFOLIO_DEFAULTS,
        })

    @app.put("/api/config")
    def put_config():
        incoming = request.get_json(silent=True)
        if incoming is None:
            return jsonify({"errors": ["body must be JSON"]}), 400

        if not lock.acquire(blocking=False):
            return jsonify({"errors": ["a rebuild is already running"]}), 409

        previous = settings.load()
        try:
            settings.save(incoming)
            rebuild()
        except Exception as exc:
            # put the working configuration back, so a bad save cannot leave
            # the framework unable to start
            if previous is None:
                import os
                if settings.exists():
                    os.remove(settings.CONFIG_PATH)
            else:
                settings.save(previous)
            return jsonify({"errors": [f"rebuild failed: {exc}"]}), 400
        finally:
            lock.release()

        return jsonify({"configured": True, "config": incoming})

    print(f"http://127.0.0.1:{port}/api/results")
    if not configured:
        print("no config.json yet - open the dashboard to run first-time setup")
    app.run(port=port, threaded=True)

# predict.py
"""
ml-model/predict.py
Inference helper — load saved models and score a single telemetry dict.
Used by Azure Functions to enrich telemetry with ML predictions.
"""
import numpy as np
import joblib
import os

# Paths (relative to this file)
_DIR = os.path.dirname(__file__)

_clf     = None
_reg     = None
_scaler  = None
_le      = None

def _load():
    global _clf, _reg, _scaler, _le
    if _clf is None:
        _clf    = joblib.load(os.path.join(_DIR, "failure_clf.joblib"))
        _reg    = joblib.load(os.path.join(_DIR, "rul_reg.joblib"))
        _scaler = joblib.load(os.path.join(_DIR, "scaler.joblib"))
        _le     = joblib.load(os.path.join(_DIR, "label_encoder.joblib"))

def predict(telemetry: dict) -> dict:
    """
    Given a telemetry dict, return ML-enriched predictions.
    Keys used: machine_type, vibration, temperature, rpm, current, operating_hours
    Returns dict with: failure_probability_ml, rul_hours_ml, will_fail_30d
    """
    _load()

    # Encode machine type (handle unseen types gracefully)
    mtype = telemetry.get("type") or telemetry.get("machine_type") or "motor"
    # Map to lowercase key names in encoder classes
    mtype = mtype.lower()
    
    # Handle matching the encoders' values
    if mtype in _le.classes_:
        mtype_enc = _le.transform([mtype])[0]
    else:
        mtype_enc = 0

    X = np.array([[
        mtype_enc,
        telemetry.get("vibration", 0),
        telemetry.get("temperature", 0),
        telemetry.get("rpm", 0),
        telemetry.get("current", 0),
        telemetry.get("operating_hours", 0),
    ]])

    X_scaled = _scaler.transform(X)

    fail_prob  = float(_clf.predict_proba(X_scaled)[0][1])
    rul_hours  = float(max(0, _reg.predict(X_scaled)[0]))
    will_fail  = bool(_clf.predict(X_scaled)[0])

    return {
        "failure_probability_ml": round(fail_prob, 4),
        "rul_hours_ml": round(rul_hours, 1),
        "will_fail_30d": will_fail,
    }

# generate_data.py
"""
ml-model/generate_data.py
Generates synthetic training data for the ML model.
Run: python generate_data.py
Outputs: training_data.csv
"""
import numpy as np
import pandas as pd
import random
import math

random.seed(42)
np.random.seed(42)

MACHINE_PROFILES = {
    "motor":      {"base_vib": 1.5, "base_temp": 60,  "base_rpm": 1450, "base_amp": 12},
    "pump":       {"base_vib": 1.2, "base_temp": 55,  "base_rpm": 1200, "base_amp": 8},
    "compressor": {"base_vib": 2.0, "base_temp": 75,  "base_rpm": 900,  "base_amp": 20},
    "cnc":        {"base_vib": 0.8, "base_temp": 45,  "base_rpm": 3000, "base_amp": 6},
}

records = []
machine_types = list(MACHINE_PROFILES.keys())

for m_idx in range(100):         # 100 virtual machines
    mtype = machine_types[m_idx % len(machine_types)]
    p = MACHINE_PROFILES[mtype]

    # Each machine runs for 200 hours then may fail
    degradation = 0.0
    hours = 0.0

    for step in range(200):      # 200 hourly readings per machine
        hours += 1.0

        # Random degradation start
        if degradation == 0.0 and random.random() < 0.03:
            degradation = 0.01
        if degradation > 0.0:
            degradation = min(degradation + random.uniform(0.005, 0.015), 1.0)

        vib  = p["base_vib"]  + degradation * 7.0 + np.random.normal(0, 0.2)
        temp = p["base_temp"] + degradation * 50.0 + np.random.normal(0, 1.0)
        rpm  = p["base_rpm"]  * (1 - 0.3 * degradation) + np.random.normal(0, 15)
        amp  = p["base_amp"]  * (1 + 0.5 * degradation) + np.random.normal(0, 0.4)

        failure_prob = round(1 / (1 + math.exp(-10 * (degradation - 0.6))), 4)
        rul_hours    = max(0.0, round((1.0 - degradation) * 200, 1))

        # Label: will fail in next 30 days (720 hours)? Simplified: degradation > 0.5
        will_fail_30d = int(degradation > 0.5)

        records.append({
            "machine_type": mtype,
            "vibration":    round(max(0.1, vib), 3),
            "temperature":  round(max(20.0, temp), 2),
            "rpm":          round(max(0.0, rpm), 1),
            "current":      round(max(0.0, amp), 3),
            "operating_hours": round(hours, 2),
            "degradation":  round(degradation, 4),
            "failure_probability": failure_prob,
            "rul_hours":    rul_hours,
            "will_fail_30d": will_fail_30d,
        })

df = pd.DataFrame(records)
df.to_csv("training_data.csv", index=False)
print(f"Generated {len(df)} rows to training_data.csv")

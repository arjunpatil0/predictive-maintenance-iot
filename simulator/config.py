# config.py

"""
Configuration for the IIoT simulator.
All values can be overridden via environment variables.
"""

import os
from dataclasses import dataclass
from typing import List

# Azure IoT Hub device connection string (shared across all simulated devices for simplicity)
# In a real deployment each device would have its own connection string.
IOT_HUB_CONNECTION_STRING = os.getenv("IOT_HUB_CONNECTION_STRING", "HostName=YOUR_IOT_HUB.azure-devices.net;DeviceId=simulator;SharedAccessKey=YOUR_KEY")

# Number of simulated machines (8‑12 as per requirements)
NUM_MACHINES = int(os.getenv("NUM_MACHINES", "10"))

# Telemetry send interval in seconds (default 5 seconds)
TELEMETRY_INTERVAL = float(os.getenv("TELEMETRY_INTERVAL", "5"))

# Machine types – you can add more or edit these JSON‑like dicts.
MACHINE_PROFILES = [
    {
        "type": "CNC",
        "initial": {"temperature": 60, "vibration": 0.02, "rpm": 1500, "current": 10, "operating_hours": 0},
        "degrade_rate": {"temperature": 0.05, "vibration": 0.0005, "rpm": -0.2, "current": 0.01},
    },
    {
        "type": "Compressor",
        "initial": {"temperature": 70, "vibration": 0.015, "rpm": 1800, "current": 12, "operating_hours": 0},
        "degrade_rate": {"temperature": 0.04, "vibration": 0.0004, "rpm": -0.15, "current": 0.009},
    },
    {
        "type": "Pump",
        "initial": {"temperature": 55, "vibration": 0.01, "rpm": 1200, "current": 8, "operating_hours": 0},
        "degrade_rate": {"temperature": 0.06, "vibration": 0.0006, "rpm": -0.25, "current": 0.012},
    },
]

# Helper to pick a profile based on index
def get_profile(idx: int):
    base_profile = MACHINE_PROFILES[idx % len(MACHINE_PROFILES)].copy()
    
    # Make machines 3 and 7 (indexes 2 and 6) degrade very fast so they trigger alerts
    if idx == 2 or idx == 6:
        # Clone the dictionaries so we don't modify the global base profiles
        base_profile = {
            "type": base_profile["type"],
            "initial": base_profile["initial"].copy(),
            "degrade_rate": {
                "temperature": 2.5,
                "vibration": 0.15,
                "rpm": -5.0,
                "current": 0.2
            }
        }
        
    return base_profile

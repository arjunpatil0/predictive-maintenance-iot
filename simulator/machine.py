# machine.py

"""
Defines a simulated machine with realistic degradation and random failures.
Each machine produces telemetry every TELEMETRY_INTERVAL seconds.
"""

import random
import time
from dataclasses import dataclass, asdict
from typing import Dict, Any

from config import get_profile

@dataclass
class Machine:
    device_id: str
    type: str
    temperature: float
    vibration: float
    rpm: float
    current: float
    operating_hours: float
    health_score: float = 100.0  # 0 = failed, 100 = perfect

    @staticmethod
    def create(idx: int) -> "Machine":
        """Create a machine with a deterministic device_id based on index."""
        profile = get_profile(idx)
        init = profile["initial"]
        return Machine(
            device_id=f"sim-machine-{idx+1:03d}",
            type=profile["type"],
            temperature=init["temperature"],
            vibration=init["vibration"],
            rpm=init["rpm"],
            current=init["current"],
            operating_hours=init["operating_hours"],
        )

    def _apply_degradation(self) -> None:
        """Increase temperature/vibration, slowly decrease RPM, etc., based on profile rates."""
        profile = get_profile(int(self.device_id.split('-')[-1]) - 1)
        rates = profile["degrade_rate"]
        self.temperature += rates["temperature"]
        self.vibration += rates["vibration"]
        self.rpm = max(0, self.rpm + rates["rpm"])
        self.current += rates["current"]
        self.operating_hours += 0.001  # small increment per tick

    def _random_failure(self) -> None:
        """Occasionally inject spikes and drop health_score.
        Failure probability grows as health_score degrades.
        """
        base_chance = 0.005
        chance = base_chance * (1 + (100 - self.health_score) / 100)
        if random.random() < chance:
            self.temperature += random.uniform(5, 15)
            self.vibration += random.uniform(0.01, 0.03)
            self.health_score = max(0, self.health_score - random.uniform(5, 20))
        else:
            self.health_score = max(0, self.health_score - 0.1)

    def tick(self) -> Dict[str, Any]:
        """Advance simulation by one interval and return telemetry dict."""
        self._apply_degradation()
        self._random_failure()
        telemetry = asdict(self)
        telemetry["timestamp"] = int(time.time() * 1000)
        telemetry.pop("health_score")
        return telemetry

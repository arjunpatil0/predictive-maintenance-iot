# run_simulator.py

"""
Entry point to start the IIoT simulator.
Creates NUM_MACHINES instances of :class:`Machine` and streams telemetry
to Azure IoT Hub (or prints to console) every TELEMETRY_INTERVAL seconds.
"""

import asyncio
import logging
from typing import List
from dotenv import load_dotenv

# Load .env variables before importing other modules
load_dotenv()

from config import NUM_MACHINES, TELEMETRY_INTERVAL
from machine import Machine
from telemetry_sender import TelemetrySender

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

async def simulate_machine(machine: Machine, sender: TelemetrySender):
    """Continuously generate telemetry for a single machine.
    The loop runs until the program is stopped.
    """
    while True:
        telemetry = machine.tick()
        sender.send(machine.device_id, telemetry)
        await asyncio.sleep(TELEMETRY_INTERVAL)

async def main():
    logger.info("Starting IIoT simulator with %d machines", NUM_MACHINES)
    sender = TelemetrySender()
    machines: List[Machine] = [Machine.create(i) for i in range(NUM_MACHINES)]
    tasks = [asyncio.create_task(simulate_machine(m, sender)) for m in machines]
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        logger.info("Simulator cancelled – shutting down")
    finally:
        sender.shutdown()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Simulator stopped by user")

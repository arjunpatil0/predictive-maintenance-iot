# telemetry_sender.py

"""
Utility to send telemetry JSON payloads to Azure IoT Hub.
Falls back to console printing if IOT_HUB_CONNECTION_STRING is empty or invalid.
"""

import json
import logging
from typing import Dict, Any

from azure.iot.device import IoTHubDeviceClient, Message
from config import IOT_HUB_CONNECTION_STRING

logger = logging.getLogger(__name__)

class TelemetrySender:
    def __init__(self):
        self.client = None
        if IOT_HUB_CONNECTION_STRING and "HostName" in IOT_HUB_CONNECTION_STRING:
            try:
                self.client = IoTHubDeviceClient.create_from_connection_string(IOT_HUB_CONNECTION_STRING)
                self.client.connect()
                logger.info("Connected to Azure IoT Hub")
            except Exception as exc:
                logger.error(f"Failed to connect to IoT Hub: {exc}")
                self.client = None
        else:
            logger.warning("No valid IoT Hub connection string – running in dry‑run mode")

    def send(self, device_id: str, telemetry: Dict[str, Any]):
        """Send telemetry for a particular device.
        If the client is not configured, prints JSON to stdout for debugging.
        """
        payload = json.dumps(telemetry)
        if self.client:
            try:
                msg = Message(payload)
                msg.content_encoding = "utf-8"
                msg.content_type = "application/json"
                msg.custom_properties["deviceId"] = device_id
                
                self.client.send_message(msg)
                logger.info(f"Sent telemetry for {device_id}: {payload}")
            except Exception as exc:
                logger.error(f"Failed to send telemetry for {device_id}: {exc}")
        else:
            # Dry‑run – just print
            print(f"[Telemetry] {device_id}: {payload}")

    def shutdown(self):
        if self.client:
            self.client.shutdown()
            logger.info("IoT Hub client shut down")

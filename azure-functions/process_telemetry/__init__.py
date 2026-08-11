# process_telemetry/__init__.py
import json
import logging
import os
import time
from azure.cosmos import CosmosClient, PartitionKey

# Get Cosmos DB details from environment
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
DATABASE_NAME = os.getenv("COSMOS_DB_NAME", "TelemetryDB")
CONTAINER_NAME = os.getenv("COSMOS_CONTAINER", "TelemetryContainer")

# Initialize Cosmos client (lazy)
cosmos_client = None
container = None

def init_cosmos():
    global cosmos_client, container
    if cosmos_client is None:
        cosmos_client = CosmosClient(COSMOS_ENDPOINT, COSMOS_KEY)
        db = cosmos_client.create_database_if_not_exists(id=DATABASE_NAME)
        container = db.create_container_if_not_exists(
            id=CONTAINER_NAME,
            partition_key=PartitionKey(path="/deviceId"),
            offer_throughput=400,
        )

# Azure Functions entry point
def main(msg) -> None:
    """IoT Hub trigger – receives a telemetry JSON payload."""
    try:
        # Get raw event data from IoT Hub message trigger
        event_body = msg.get_body().decode('utf-8')
        payload = json.loads(event_body)
        logging.info(f"Received telemetry: {payload}")
        
        # Normalize device_id to deviceId (which is the partition key)
        device_id = payload.get("device_id") or payload.get("deviceId")
        if not device_id:
            logging.error("Missing device_id or deviceId in payload")
            return
            
        payload["deviceId"] = device_id
        # Also ensure unique 'id' field for Cosmos DB
        if "id" not in payload:
            payload["id"] = f"{device_id}-{payload.get('timestamp', int(time.time() * 1000))}"
            
        # Enrich with ML predictions
        try:
            from .predict import predict
            prediction = predict(payload)
            payload.update(prediction)
            logging.info(f"Enriched telemetry with ML predictions: {prediction}")
        except Exception as pred_err:
            logging.error(f"Failed to run ML prediction: {pred_err}")
            
        # Persist to Cosmos DB
        init_cosmos()
        container.upsert_item(payload)
        logging.info("Telemetry stored in Cosmos DB")
    except Exception as e:
        logging.exception(f"Error processing telemetry: {e}")

# api_telemetry/__init__.py
import os
import json
import logging
import azure.functions as func
from azure.cosmos import CosmosClient, PartitionKey

# Environment variables
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DB_NAME = os.getenv("COSMOS_DB_NAME", "TelemetryDB")
COSMOS_CONTAINER_NAME = os.getenv("COSMOS_CONTAINER", "TelemetryContainer")

client = None
container = None

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
}

def init_cosmos():
    global client, container
    if client is None:
        client = CosmosClient(COSMOS_ENDPOINT, COSMOS_KEY)
        db = client.create_database_if_not_exists(id=COSMOS_DB_NAME)
        container = db.create_container_if_not_exists(
            id=COSMOS_CONTAINER_NAME,
            partition_key=PartitionKey(path="/deviceId"),
            offer_throughput=400,
        )

def main(req: func.HttpRequest) -> func.HttpResponse:
    """Entry point for HTTP trigger.
    Returns a JSON response with telemetry records.
    """
    # Handle CORS preflight
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=CORS_HEADERS)

    try:
        logging.info("api_telemetry triggered")
        init_cosmos()
        
        machine_id = req.params.get('machineId') or req.params.get('deviceId')
        query = "SELECT * FROM c"
        parameters = []
        if machine_id:
            query += " WHERE c.deviceId = @machineId"
            parameters.append({"name": "@machineId", "value": machine_id})
            
        items = list(container.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        # Strip internal Cosmos DB fields for a cleaner API response
        for item in items:
            for field in ["_rid", "_self", "_etag", "_attachments", "_ts"]:
                item.pop(field, None)
                
        return func.HttpResponse(
            body=json.dumps(items),
            status_code=200,
            headers=CORS_HEADERS
        )
    except Exception as e:
        logging.exception("Failed to fetch telemetry")
        return func.HttpResponse(
            body=json.dumps({"error": str(e)}),
            status_code=500,
            headers=CORS_HEADERS
        )


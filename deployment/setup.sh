#!/usr/bin/env bash
# setup.sh – provision Azure resources for the Predictive Maintenance demo
# ---------------------------------------------------------------
# Prerequisites: Azure CLI installed and logged in (az login)
#               Azure subscription set (az account set --subscription <id>)
# ---------------------------------------------------------------
set -euo pipefail

# Configurable names – edit as needed
RESOURCE_GROUP="pm-iot-rg"
LOCATION="eastus"
IOT_HUB_NAME="pm-iot-hub"
COSMOS_ACCOUNT="pm-cosmos-db"
COSMOS_DB_NAME="TelemetryDB"
COSMOS_CONTAINER="Readings"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create IoT Hub (free tier S1)
az iot hub create --resource-group $RESOURCE_GROUP --name $IOT_HUB_NAME --sku S1 --partition-count 2

# Retrieve the IoT Hub connection string for the "service" policy (used by the simulator)
IOT_HUB_CONNECTION_STRING=$(az iot hub show-connection-string --hub-name $IOT_HUB_NAME --policy-name iothubowner --resource-group $RESOURCE_GROUP --query 'connectionString' -o tsv)

echo "IoT Hub connection string (export this env var for the simulator):"
echo $IOT_HUB_CONNECTION_STRING

# Create Cosmos DB account (SQL API, free tier if available)
az cosmosdb create --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --locations regionName=$LOCATION failoverPriority=0 isZoneRedundant=False

# Create database and container
az cosmosdb sql database create --account-name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --name $COSMOS_DB_NAME
az cosmosdb sql container create --account-name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --database-name $COSMOS_DB_NAME --name $COSMOS_CONTAINER --partition-key-path "/machineId" --throughput 400

# Output environment variables needed for Azure Functions
COSMOS_ENDPOINT=$(az cosmosdb show --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --query 'documentEndpoint' -o tsv)
COSMOS_KEY=$(az cosmosdb keys list --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --type keys --query 'primaryMasterKey' -o tsv)

echo "Export the following for Azure Functions (or add to local.settings.json):"
echo "COSMOS_ENDPOINT=$COSMOS_ENDPOINT"
echo "COSMOS_KEY=$COSMOS_KEY"

echo "Setup complete. You can now deploy the Functions and run the simulator."

# PowerShell script: setup.ps1
# Provision Azure resources for the Predictive Maintenance demo.
# Requires Azure CLI (az) and PowerShell 5+.

# Configuration – edit as needed
$Prefix = "pm"
$Location = "westus2"
$RG = "${Prefix}-rg"
$IoTHub = "${Prefix}-iothub"
$IoTHubSku = "S1"
$CosmosAccount = "${Prefix}cosmos"
$CosmosDb = "TelemetryDB"
$FunctionApp = "${Prefix}-func"
$Runtime = "python"
$PythonVersion = "3.9"

# Ensure Azure CLI is installed
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI (az) is not installed. Install it from https://aka.ms/azcli"
    exit 1
}

# Log in if needed
az account show > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Logging into Azure..."
    az login
}

# Create Resource Group
az group create --name $RG --location $Location

# Create IoT Hub
az iot hub create `
    --name $IoTHub `
    --resource-group $RG `
    --sku $IoTHubSku `
    --location $Location

# Create a device identity (simulator) and output its connection string
$DeviceId = "simulator"
az iot hub device create --hub-name $IoTHub --device-id $DeviceId --resource-group $RG
$ConnStr = az iot hub device show-connection-string --hub-name $IoTHub --device-id $DeviceId --resource-group $RG --output tsv
Write-Host "Simulator device connection string: $ConnStr"

# Create Cosmos DB account (SQL API)
az cosmosdb create `
    --name $CosmosAccount `
    --resource-group $RG `
    --locations regionName=$Location failoverPriority=0 isZoneRedundant=False `
    --default-consistency-level Session

# Create database & container
az cosmosdb sql database create --account-name $CosmosAccount --resource-group $RG --name $CosmosDb
az cosmosdb sql container create `
    --account-name $CosmosAccount `
    --resource-group $RG `
    --database-name $CosmosDb `
    --name TelemetryContainer `
    --partition-key-path "/deviceId"

# Create a storage account for the Function App (required)
$StorageAccount = "${Prefix}storage"
az storage account create `
    --name $StorageAccount `
    --resource-group $RG `
    --location $Location `
    --sku Standard_LRS `
    --kind StorageV2

# Create Function App (Consumption plan)
az functionapp create `
    --resource-group $RG `
    --consumption-plan-location $Location `
    --runtime $Runtime `
    --functions-version 4 `
    --name $FunctionApp `
    --storage-account $StorageAccount `
    --os-type Linux

Write-Host "All resources created. Use the connection string above in the simulator config."

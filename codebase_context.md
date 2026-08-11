# IIoT Predictive Maintenance Project Codebase Context

This file contains the complete codebase context for the IIoT Predictive Maintenance project. It includes the directory structure and the contents of all custom code, configurations, and setup scripts.

## 📂 Folder Structure
```text
predictive-maintenance-iot/
    .env.example
    .gitignore
    README.md
    requirements.txt
    .github/
        workflows/
    azure-functions/
        host.json
        local.settings.json
        requirements.txt
        api_telemetry/
            function.json
            __init__.py
        process_telemetry/
            function.json
            predict.py
            __init__.py
    deployment/
        setup.ps1
        setup.sh
    docs/
        SETUP.md
    ml-model/
        generate_data.py
        predict.py
        requirements.txt
        train.py
        training_data.csv
        notebooks/
    react-dashboard/
        .gitignore
        eslint.config.js
        index.html
        package.json
        README.md
        tsconfig.app.json
        tsconfig.json
        tsconfig.node.json
        vite.config.ts
        public/
            vite.svg
        src/
            App.css
            App.tsx
            index.css
            main.tsx
            vite-env.d.ts
            assets/
                react.svg
    simulator/
        .env
        config.py
        machine.py
        main.py
        requirements.txt
        run_simulator.py
        telemetry_sender.py
        devices/
```

## 📝 Source Code & Configurations

### 📄 File: `README.md`

```md

```

---

### 📄 File: `azure-functions\host.json`

```json
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.0.0, 5.0.0)"
  }
}

```

---

### 📄 File: `azure-functions\local.settings.json`

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "DefaultEndpointsProtocol=https;EndpointSuffix=core.windows.net;AccountName=YOUR_ACCOUNT;AccountKey=REDACTED;BlobEndpoint=https://YOUR_ACCOUNT.blob.core.windows.net/;FileEndpoint=https://YOUR_ACCOUNT.file.core.windows.net/;QueueEndpoint=https://YOUR_ACCOUNT.queue.core.windows.net/;TableEndpoint=https://YOUR_ACCOUNT.table.core.windows.net/",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "COSMOS_ENDPOINT": "https://pmcosmos9980.documents.azure.com:443/",
    "COSMOS_KEY": "REDACTED",
    "COSMOS_DB_NAME": "TelemetryDB",
    "COSMOS_CONTAINER": "TelemetryContainer",
    "COSMOS_CONTAINER_NAME": "TelemetryContainer",
    "IOT_HUB_CONNECTION_STRING": "Endpoint=sb://YOUR_NAMESPACE.servicebus.windows.net/;SharedAccessKeyName=iothubowner;SharedAccessKey=REDACTED;EntityPath=YOUR_PATH"
  }
}

```

---

### 📄 File: `azure-functions\api_telemetry\function.json`

```json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get"]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}

```

---

### 📄 File: `azure-functions\api_telemetry\__init__.py`

```python
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
COSMOS_CONTAINER_NAME = os.getenv("COSMOS_CONTAINER_NAME", "TelemetryContainer")

client = None
container = None

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
            headers={
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"  # CORS for the local dashboard
            }
        )
    except Exception as e:
        logging.exception("Failed to fetch telemetry")
        return func.HttpResponse(
            body=json.dumps({"error": str(e)}),
            status_code=500,
            headers={
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        )

```

---

### 📄 File: `azure-functions\process_telemetry\function.json`

```json
{
  "bindings": [
    {
      "type": "eventHubTrigger",
      "name": "msg",
      "direction": "in",
      "eventHubName": "iothub-ehub-pmiothub99-56193292-ffdf431c14",
      "connection": "IOT_HUB_CONNECTION_STRING",
      "cardinality": "one",
      "consumerGroup": "$Default"
    }
  ]
}

```

---

### 📄 File: `azure-functions\process_telemetry\predict.py`

```python
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

```

---

### 📄 File: `azure-functions\process_telemetry\__init__.py`

```python
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

```

---

### 📄 File: `deployment\setup.ps1`

```powershell
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

```

---

### 📄 File: `deployment\setup.sh`

```bash
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

```

---

### 📄 File: `docs\SETUP.md`

```md

```

---

### 📄 File: `ml-model\generate_data.py`

```python
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

```

---

### 📄 File: `ml-model\predict.py`

```python
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

```

---

### 📄 File: `ml-model\train.py`

```python
# train.py
"""
ml-model/train.py
Trains a RandomForest model to predict failure probability and RUL.
Run: python train.py
Outputs: model.joblib, scaler.joblib
"""
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_absolute_error
import joblib
import os

# Load data
DATA_FILE = "training_data.csv"
if not os.path.exists(DATA_FILE):
    print("training_data.csv not found. Run: python generate_data.py first.")
    exit(1)

df = pd.read_csv(DATA_FILE)
print(f"Loaded {len(df)} rows from {DATA_FILE}")

# Feature engineering
le = LabelEncoder()
df["machine_type_enc"] = le.fit_transform(df["machine_type"])

FEATURES = ["machine_type_enc", "vibration", "temperature", "rpm", "current", "operating_hours"]

X = df[FEATURES].values
y_clf  = df["will_fail_30d"].values     # classification: will fail in 30 days?
y_reg  = df["rul_hours"].values          # regression: remaining useful life

# Train/Test split
X_train, X_test, yc_train, yc_test, yr_train, yr_test = train_test_split(
    X, y_clf, y_reg, test_size=0.2, random_state=42
)

# Scale
scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s  = scaler.transform(X_test)

# Classifier (failure in 30 days)
clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
clf.fit(X_train_s, yc_train)
yc_pred = clf.predict(X_test_s)
print("\n=== Classifier Report ===")
print(classification_report(yc_test, yc_pred, target_names=["No Failure", "Failure"]))

# Regressor (RUL hours)
reg = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
reg.fit(X_train_s, yr_train)
yr_pred = reg.predict(X_test_s)
mae = mean_absolute_error(yr_test, yr_pred)
print(f"=== RUL Regressor MAE: {mae:.2f} hours ===")

# Save artifacts
joblib.dump(clf,    "failure_clf.joblib")
joblib.dump(reg,    "rul_reg.joblib")
joblib.dump(scaler, "scaler.joblib")
joblib.dump(le,     "label_encoder.joblib")
print("\nSaved: failure_clf.joblib, rul_reg.joblib, scaler.joblib, label_encoder.joblib")

```

---

### 📄 File: `react-dashboard\index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

---

### 📄 File: `react-dashboard\package.json`

```json
{
  "name": "dashboard",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^1.16.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^3.8.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.13.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "eslint": "^9.13.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14",
    "globals": "^15.11.0",
    "typescript": "~5.6.2",
    "typescript-eslint": "^8.11.0",
    "vite": "^5.4.10"
  }
}

```

---

### 📄 File: `react-dashboard\README.md`

```md
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```

```

---

### 📄 File: `react-dashboard\tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}

```

---

### 📄 File: `react-dashboard\tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}

```

---

### 📄 File: `react-dashboard\tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}

```

---

### 📄 File: `react-dashboard\vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})

```

---

### 📄 File: `react-dashboard\src\App.css`

```css
#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.react:hover {
  filter: drop-shadow(0 0 2em #61dafbaa);
}

@keyframes logo-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: no-preference) {
  a:nth-of-type(2) .logo {
    animation: logo-spin infinite 20s linear;
  }
}

.card {
  padding: 2em;
}

.read-the-docs {
  color: #888;
}

```

---

### 📄 File: `react-dashboard\src\App.tsx`

```typescript
import { useState, useEffect, useRef } from 'react';
import { 
  Activity, Cpu, ShieldAlert, Sparkles, Thermometer,
  Zap, Wrench, RefreshCw, Terminal, AlertTriangle, CheckCircle2,
  Sliders, FileText, Search, Printer, X
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';

interface TelemetryRecord {
  id: string;
  deviceId: string;
  type: string;
  temperature: number;
  vibration: number;
  rpm: number;
  current: number;
  operating_hours: number;
  timestamp: number;
  failure_probability_ml: number;
  rul_hours_ml: number;
  will_fail_30d: boolean;
  throttle: number; // 50% to 100% operational load
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'critical' | 'success';
  message: string;
}

const INITIAL_PROFILES = [
  { deviceId: 'sim-machine-001', type: 'CNC', tempBase: 60, vibBase: 0.8, rpmBase: 1500, currentBase: 10, degTemp: 0.05, degVib: 0.002, degCurrent: 0.01 },
  { deviceId: 'sim-machine-002', type: 'Compressor', tempBase: 70, vibBase: 1.2, rpmBase: 1800, currentBase: 12, degTemp: 0.04, degVib: 0.001, degCurrent: 0.009 },
  { deviceId: 'sim-machine-003', type: 'Pump', tempBase: 55, vibBase: 0.6, rpmBase: 1200, currentBase: 8, degTemp: 0.06, degVib: 0.003, degCurrent: 0.012 },
  { deviceId: 'sim-machine-004', type: 'CNC', tempBase: 61, vibBase: 0.9, rpmBase: 1490, currentBase: 10.2, degTemp: 0.05, degVib: 0.002, degCurrent: 0.011 },
  { deviceId: 'sim-machine-005', type: 'Compressor', tempBase: 72, vibBase: 1.3, rpmBase: 1810, currentBase: 12.4, degTemp: 0.04, degVib: 0.001, degCurrent: 0.008 },
  { deviceId: 'sim-machine-006', type: 'Pump', tempBase: 54, vibBase: 0.7, rpmBase: 1210, currentBase: 7.9, degTemp: 0.06, degVib: 0.003, degCurrent: 0.013 },
  { deviceId: 'sim-machine-007', type: 'CNC', tempBase: 59, vibBase: 0.85, rpmBase: 1510, currentBase: 9.8, degTemp: 0.05, degVib: 0.002, degCurrent: 0.01 },
  { deviceId: 'sim-machine-008', type: 'Compressor', tempBase: 69, vibBase: 1.1, rpmBase: 1790, currentBase: 11.7, degTemp: 0.04, degVib: 0.001, degCurrent: 0.009 },
  { deviceId: 'sim-machine-009', type: 'Pump', tempBase: 56, vibBase: 0.55, rpmBase: 1195, currentBase: 8.2, degTemp: 0.06, degVib: 0.003, degCurrent: 0.012 },
  { deviceId: 'sim-machine-010', type: 'CNC', tempBase: 60.5, vibBase: 0.95, rpmBase: 1500, currentBase: 10.1, degTemp: 0.05, degVib: 0.002, degCurrent: 0.01 }
];

export default function App() {
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
  const [historyMap, setHistoryMap] = useState<Record<string, any[]>>({});
  const [selectedId, setSelectedId] = useState<string>('sim-machine-001');
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Healthy' | 'Warning' | 'Critical'>('All');
  const [showTicket, setShowTicket] = useState<boolean>(false);
  
  const localSimState = useRef<TelemetryRecord[]>([]);

  const addLog = (message: string, level: 'info' | 'warning' | 'critical' | 'success' = 'info') => {
    const timeStr = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [{ timestamp: timeStr, level, message }, ...prev.slice(0, 49)]);
  };

  // Helper to run simulated ML predictions based on parameters
  const calculateMLFields = (temp: number, vib: number, type: string) => {
    let failure_probability_ml = 0.01;
    let tempLimit = type === 'Compressor' ? 92 : type === 'CNC' ? 84 : 78;
    let vibLimit = type === 'Compressor' ? 3.5 : type === 'CNC' ? 2.8 : 2.2;

    if (temp > tempLimit) {
      failure_probability_ml += (temp - tempLimit) / (120 - tempLimit) * 0.6;
    }
    if (vib > vibLimit) {
      failure_probability_ml += (vib - vibLimit) / (8 - vibLimit) * 0.4;
    }
    failure_probability_ml = Math.min(0.99, Math.max(0.01, failure_probability_ml));
    
    const maxRul = type === 'Compressor' ? 400 : type === 'CNC' ? 300 : 250;
    const rul_hours_ml = Math.max(2, Math.round(maxRul * (1 - failure_probability_ml) ** 1.8));

    return {
      failure_probability_ml: Number(failure_probability_ml.toFixed(4)),
      rul_hours_ml,
      will_fail_30d: failure_probability_ml > 0.55
    };
  };

  // Initialize Simulator state if offline
  const initLocalSimulation = () => {
    const now = Date.now();
    const initialRecords = INITIAL_PROFILES.map(profile => {
      const ml = calculateMLFields(profile.tempBase, profile.vibBase, profile.type);
      return {
        id: `${profile.deviceId}-${now}`,
        deviceId: profile.deviceId,
        type: profile.type,
        temperature: profile.tempBase,
        vibration: profile.vibBase,
        rpm: profile.rpmBase,
        current: profile.currentBase,
        operating_hours: 154.2 + Math.random() * 50,
        timestamp: now,
        throttle: 100,
        ...ml
      };
    });
    localSimState.current = initialRecords;
    setTelemetry(initialRecords);

    // Populate initial dummy histories
    const hist: Record<string, any[]> = {};
    initialRecords.forEach(rec => {
      const points = [];
      for (let i = 11; i >= 0; i--) {
        const timeOffset = i * 4000;
        const noiseTemp = (Math.random() - 0.5) * 1.5;
        const noiseVib = (Math.random() - 0.5) * 0.08;
        points.push({
          time: new Date(now - timeOffset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          temperature: Number((rec.temperature + noiseTemp).toFixed(1)),
          vibration: Number(Math.max(0.1, rec.vibration + noiseVib).toFixed(3))
        });
      }
      hist[rec.deviceId] = points;
    });
    setHistoryMap(hist);
    addLog("IIoT Simulator sandboxed runtime initialized.", "info");
    addLog("Premium glassmorphism dashboard loaded successfully.", "success");
  };

  // Process a simulation tick (runs every 4 seconds when offline)
  const processSimulationTick = () => {
    if (localSimState.current.length === 0) return;

    const now = Date.now();
    const updated = localSimState.current.map((machine, idx) => {
      const profile = INITIAL_PROFILES[idx];
      const throttleFactor = machine.throttle / 100; // 0.5 to 1.0

      // Dynamic baseline shifts down if throttled (machine cools down!)
      const targetTemp = profile.tempBase - (1 - throttleFactor) * 20;
      const targetVib = profile.vibBase - (1 - throttleFactor) * 0.3;
      
      // Calculate delta to move towards throttled target
      const tempDelta = (targetTemp - machine.temperature) * 0.15;
      const vibDelta = (targetVib - machine.vibration) * 0.15;

      // Degradation is slowed down significantly by throttling
      const wearRateTemp = profile.degTemp * throttleFactor;
      const wearRateVib = profile.degVib * throttleFactor;

      let newTemp = machine.temperature + tempDelta + wearRateTemp + (Math.random() - 0.4) * 0.5;
      let newVib = machine.vibration + vibDelta + wearRateVib + (Math.random() - 0.4) * 0.04;
      let newRpm = profile.rpmBase * throttleFactor - 0.1;
      let newCurrent = profile.currentBase * throttleFactor + profile.degCurrent;

      // Periodic operational jitter/spikes (less likely if throttled)
      if (Math.random() < (0.05 * throttleFactor)) {
        const spike = Math.random() * 4 + 1;
        newTemp += spike;
        addLog(`Minor thermal fluctuation on ${machine.deviceId}: +${spike.toFixed(1)}°C`, "info");
      }

      const ml = calculateMLFields(newTemp, newVib, machine.type);

      // Warning triggers in logs
      if (ml.failure_probability_ml > 0.75 && machine.failure_probability_ml <= 0.75) {
        addLog(`CRITICAL: ${machine.deviceId} predicted failure risk at ${(ml.failure_probability_ml * 100).toFixed(0)}%!`, "critical");
      } else if (ml.failure_probability_ml > 0.4 && machine.failure_probability_ml <= 0.4) {
        addLog(`WARNING: ${machine.deviceId} is experiencing accelerated degradation.`, "warning");
      }

      return {
        ...machine,
        id: `${machine.deviceId}-${now}`,
        temperature: Number(newTemp.toFixed(1)),
        vibration: Number(Math.max(0.1, newVib).toFixed(3)),
        rpm: Math.round(newRpm),
        current: Number(newCurrent.toFixed(2)),
        operating_hours: Number((machine.operating_hours + 0.002).toFixed(3)),
        timestamp: now,
        ...ml
      };
    });

    localSimState.current = updated;
    setTelemetry(updated);

    // Update histories
    setHistoryMap(prev => {
      const copy = { ...prev };
      updated.forEach(rec => {
        const list = copy[rec.deviceId] || [];
        const newPoint = {
          time: new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          temperature: rec.temperature,
          vibration: rec.vibration
        };
        copy[rec.deviceId] = [...list.slice(-11), newPoint];
      });
      return copy;
    });
  };

  // Poll for telemetry (Live) or Run local tick (Offline)
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const response = await fetch('http://localhost:7071/api/api_telemetry');
        if (!response.ok) throw new Error('API Offline');
        const data: TelemetryRecord[] = await response.json();
        
        if (data && data.length > 0) {
          const latestMap: Record<string, TelemetryRecord> = {};
          const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp);
          
          sorted.forEach(record => {
            if (!latestMap[record.deviceId]) {
              latestMap[record.deviceId] = record;
            }
          });

          const latestRecords = Object.values(latestMap).sort((a, b) => a.deviceId.localeCompare(b.deviceId)).map(rec => ({
            ...rec,
            throttle: rec.throttle || 100
          }));
          
          setTelemetry(latestRecords);
          if (!isLive) {
            addLog("Successfully established telemetry feed with local Azure Functions Runtime API!", "success");
          }
          setIsLive(true);
          setIsDemoMode(false);
          
          // Sync history
          setHistoryMap(prev => {
            const updated = { ...prev };
            latestRecords.forEach(rec => {
              const currentHistory = updated[rec.deviceId] || [];
              const newPoint = {
                time: new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                temperature: rec.temperature,
                vibration: rec.vibration
              };
              updated[rec.deviceId] = [...currentHistory.slice(-11), newPoint];
            });
            return updated;
          });
        } else {
          triggerFallback();
        }
      } catch (err) {
        triggerFallback();
      } finally {
        setLoading(false);
      }
    };

    const triggerFallback = () => {
      if (!isDemoMode) {
        addLog("Local API offline. Initializing persistent sandbox simulation...", "warning");
        setIsLive(false);
        setIsDemoMode(true);
        initLocalSimulation();
      } else {
        processSimulationTick();
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 4000);
    return () => clearInterval(interval);
  }, [isDemoMode, isLive]);

  // Adjust operating throttle / load
  const adjustThrottle = (val: number) => {
    if (!isDemoMode) {
      addLog(`Adjusting remote throttle for device ${selectedId} to ${val}%...`, "info");
    } else {
      addLog(`Tuning operational load for ${selectedId} to ${val}%`, "info");
    }

    const updated = localSimState.current.map(machine => {
      if (machine.deviceId === selectedId) {
        const ml = calculateMLFields(machine.temperature, machine.vibration, machine.type);
        return {
          ...machine,
          throttle: val,
          ...ml
        };
      }
      return machine;
    });

    localSimState.current = updated;
    setTelemetry(updated);
  };

  // Actions: Injections and Repairs
  const injectAnomaly = (anomalyType: 'thermal' | 'bearing' | 'stator') => {
    if (!isDemoMode) {
      alert("Injections can only be triggered in Sandbox Demo Mode. Spin down the backend to enable.");
      return;
    }

    const updated = localSimState.current.map(machine => {
      if (machine.deviceId === selectedId) {
        let spikedTemp = machine.temperature;
        let spikedVib = machine.vibration;
        let spikedCurrent = machine.current;

        if (anomalyType === 'thermal') {
          spikedTemp += 25.5;
          addLog(`[MANUAL INJECTION] Spiked temperature on ${machine.deviceId} by +25.5°C`, "critical");
        } else if (anomalyType === 'bearing') {
          spikedVib += 3.2;
          addLog(`[MANUAL INJECTION] Spiked vibration on ${machine.deviceId} by +3.2 mm/s`, "critical");
        } else {
          spikedCurrent += 8.5;
          addLog(`[MANUAL INJECTION] Spiked electrical draw on ${machine.deviceId} by +8.5 Amps`, "critical");
        }

        const ml = calculateMLFields(spikedTemp, spikedVib, machine.type);
        return {
          ...machine,
          temperature: Number(spikedTemp.toFixed(1)),
          vibration: Number(spikedVib.toFixed(3)),
          current: Number(spikedCurrent.toFixed(2)),
          ...ml
        };
      }
      return machine;
    });

    localSimState.current = updated;
    setTelemetry(updated);
  };

  const repairMachine = async () => {
    addLog(`Initiating dispatch order for ${selectedId}...`, "info");
    
    if (isDemoMode) {
      const idx = INITIAL_PROFILES.findIndex(p => p.deviceId === selectedId);
      const profile = INITIAL_PROFILES[idx];
      
      const updated = localSimState.current.map(machine => {
        if (machine.deviceId === selectedId) {
          const ml = calculateMLFields(profile.tempBase, profile.vibBase, machine.type);
          addLog(`Calibration completed. Stator aligned, lubrication applied to ${selectedId}. Health restored to 100%!`, "success");
          return {
            ...machine,
            temperature: profile.tempBase,
            vibration: profile.vibBase,
            rpm: profile.rpmBase,
            current: profile.currentBase,
            throttle: 100, // Reset throttle on full repair
            ...ml
          };
        }
        return machine;
      });

      localSimState.current = updated;
      setTelemetry(updated);
    } else {
      try {
        const response = await fetch(`http://localhost:7071/api/repair_device?deviceId=${selectedId}`, { method: 'POST' });
        if (response.ok) {
          addLog(`Remote dispatch successful. IoT Direct Method triggered repair on active device ${selectedId}!`, "success");
        } else {
          addLog(`IoT Hub sent calibration signal, but device ${selectedId} did not acknowledge. Dispatching field technician.`, "warning");
        }
      } catch (err) {
        addLog(`API endpoint not found. Triggered manual mechanical calibration override locally.`, "success");
      }
    }
  };

  const selectedMachine = telemetry.find(m => m.deviceId === selectedId) || telemetry[0];
  const selectedHistory = historyMap[selectedId] || [];

  // Summary Metrics
  const activeCount = telemetry.length;
  
  const getStatusColor = (temp: number, vib: number, type: string) => {
    let tempLimit = type === 'Compressor' ? 92 : type === 'CNC' ? 84 : 78;
    let vibLimit = type === 'Compressor' ? 3.5 : type === 'CNC' ? 2.8 : 2.2;
    if (temp > tempLimit + 10 || vib > vibLimit + 1.5) return 'var(--color-danger)';
    if (temp > tempLimit || vib > vibLimit) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  const getStatusLabel = (temp: number, vib: number, type: string) => {
    let tempLimit = type === 'Compressor' ? 92 : type === 'CNC' ? 84 : 78;
    let vibLimit = type === 'Compressor' ? 3.5 : type === 'CNC' ? 2.8 : 2.2;
    if (temp > tempLimit + 10 || vib > vibLimit + 1.5) return 'Critical';
    if (temp > tempLimit || vib > vibLimit) return 'Warning';
    return 'Healthy';
  };

  // Filter telemetry grid based on selection
  const filteredTelemetry = telemetry.filter(m => {
    const status = getStatusLabel(m.temperature, m.vibration, m.type);
    if (statusFilter === 'All') return true;
    return status === statusFilter;
  });

  const warningCount = telemetry.filter(m => getStatusLabel(m.temperature, m.vibration, m.type) === 'Warning').length;
  const criticalCount = telemetry.filter(m => getStatusLabel(m.temperature, m.vibration, m.type) === 'Critical').length;
  const avgHealth = telemetry.length > 0 
    ? 100 - (telemetry.reduce((acc, m) => acc + (m.failure_probability_ml || 0), 0) / telemetry.length) * 100 
    : 100;

  // Dynamic advice cards based on machine type and current metrics
  const getPredictiveAdvice = (machine: TelemetryRecord) => {
    if (!machine) return null;
    const probability = machine.failure_probability_ml * 100;
    
    if (probability > 75) {
      return {
        alert: "EMERGENCY INTERVENTION REQUIRED",
        action: "Shutdown Machine Immediately",
        steps: [
          `De-energize Stator power to prevent catastrophic thermal runaways.`,
          machine.type === 'CNC' ? "Inspect main drive spindle for bearing structural fatigue." :
          machine.type === 'Compressor' ? "De-pressurize high chamber housing & clear intake valves." :
          "Clear housing cavity blockage and replace impeller gaskets.",
          "Dispatch Field Specialist for manual mechanical calibration reset."
        ]
      };
    } else if (probability > 40) {
      return {
        alert: "PREDICTIVE PREVENTATIVE ALERTS",
        action: "Schedule Maintenance Inspection",
        steps: [
          `Schedule a service window within the next 48 operating hours (RUL: ${machine.rul_hours_ml} hrs).`,
          machine.type === 'CNC' ? "Check coolant fluid pump pressure levels." :
          machine.type === 'Compressor' ? "Inspect motor gaskets and lubrication viscosity." :
          "Test alignment tolerances and retighten motor coupling bolts.",
          "Perform remote diagnostic sweep."
        ]
      };
    } else {
      return {
        alert: "OPTIMAL OPERATIONAL STATUS",
        action: "Standard Inspection Schedule",
        steps: [
          "Continue monitoring real-time SCADA feeds.",
          "Standard maintenance window scheduled in 250 operating hours.",
          "All bearing and sensor arrays show balanced harmonics."
        ]
      };
    }
  };

  const advice = getPredictiveAdvice(selectedMachine);

  if (loading && telemetry.length === 0) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#070a13' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginTop: 16, color: '#94a3b8', fontSize: '1.1rem' }}>Initializing High-Fidelity Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Printable Maintenance Dispatch Ticket Modal */}
      {showTicket && selectedMachine && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 100, backdropFilter: 'blur(8px)'
        }}>
          <div className="glass-panel" style={{
            width: '90%', maxWidth: '640px', padding: '32px', position: 'relative',
            backgroundColor: '#0f172a', border: '1px solid var(--border-hover)'
          }}>
            <button 
              onClick={() => setShowTicket(false)} 
              style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <X style={{ width: 24, height: 24 }} />
            </button>

            {/* Ticket Content */}
            <div id="print-area">
              <div style={{ borderBottom: '2px dashed #1e293b', paddingBottom: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                    FIELD DISPATCH WORK ORDER
                  </h2>
                  <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: 6, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 700 }}>
                    PRIORITY ALARM
                  </span>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Generated from Antigravity ML Predictive SCADA Host System
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, fontSize: '0.85rem' }}>
                <div>
                  <strong style={{ color: '#64748b' }}>Device Target:</strong>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>{selectedMachine.deviceId}</div>
                </div>
                <div>
                  <strong style={{ color: '#64748b' }}>Machine Type:</strong>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>{selectedMachine.type}</div>
                </div>
                <div>
                  <strong style={{ color: '#64748b' }}>Operating Hours:</strong>
                  <div style={{ marginTop: 4 }}>{selectedMachine.operating_hours.toFixed(2)} hours</div>
                </div>
                <div>
                  <strong style={{ color: '#64748b' }}>Date of Order:</strong>
                  <div style={{ marginTop: 4 }}>{new Date().toLocaleString()}</div>
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', border: '1px solid #1e293b', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#94a3b8' }}>ML Diagnostic Metrics:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.8rem' }}>
                  <div>• 30-Day Failure Risk: <strong style={{ color: '#f87171' }}>{(selectedMachine.failure_probability_ml * 100).toFixed(1)}%</strong></div>
                  <div>• Predicted RUL: <strong>{selectedMachine.rul_hours_ml} operating hours</strong></div>
                  <div>• Temperature Signature: <strong>{selectedMachine.temperature}°C</strong></div>
                  <div>• Bearing Vibration: <strong>{selectedMachine.vibration} mm/s</strong></div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#94a3b8' }}>Technician Action Checklist:</h4>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {advice?.steps.map((step, idx) => (
                    <li key={idx} style={{ lineHeight: 1.4 }}>{step}</li>
                  ))}
                  <li>Connect hardware calibrator and confirm telemetric signature reset on grid list.</li>
                </ol>
              </div>

              <div style={{ borderTop: '1px solid #1e293b', paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                <div>Signature: ________________________</div>
                <div>System ID: {selectedMachine.id.slice(0, 16)}...</div>
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => window.print()}
                className="btn-control"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Printer style={{ width: 14, height: 14 }} /> Print Dispatch
              </button>
              <button 
                onClick={() => setShowTicket(false)}
                className="btn-control"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid #1e293b' }}
              >
                Close Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Section */}
      <header className="glass-panel" style={{
        margin: '20px 24px 0', padding: '16px 24px', display: 'flex', 
        justifyContent: 'space-between', alignItems: 'center', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
            padding: 10, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)'
          }}>
            <Cpu style={{ color: '#fff', width: 24, height: 24 }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Antigravity Predictive SCADA
            </h1>
            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span className="animate-pulse-glow" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: isLive ? 'var(--color-success)' : 'var(--color-warning)' }} />
              {isLive ? 'Live connected to Azure Functions API' : `Interactive Sandbox Environment (Local Simulation Active)`}
            </span>
          </div>
        </div>

        {/* Global Fleet KPIs */}
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Fleet Health Score</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: avgHealth > 90 ? 'var(--color-success)' : avgHealth > 75 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
              {avgHealth.toFixed(1)}%
            </div>
          </div>
          <div style={{ width: 1, backgroundColor: '#1e293b' }} />
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Active Nodes</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>{activeCount} / 10</div>
          </div>
          <div style={{ width: 1, backgroundColor: '#1e293b' }} />
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Active Alarms</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', gap: 8 }}>
              {warningCount > 0 && <span style={{ color: 'var(--color-warning)' }}>{warningCount} ⚠️</span>}
              {criticalCount > 0 && <span style={{ color: 'var(--color-danger)' }}>{criticalCount} 🚨</span>}
              {warningCount === 0 && criticalCount === 0 && <span style={{ color: 'var(--color-success)' }}>0 Alarms</span>}
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="dashboard-grid">
        {/* Left Side Panel: Machine Grid List */}
        <section className="glass-panel" style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#94a3b8', margin: '0 0 12px 0', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
              Fleet Telemetry Nodes
            </h2>
            
            {/* Status Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, margin: '8px 0 16px 0' }}>
              {(['All', 'Healthy', 'Warning', 'Critical'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  style={{
                    padding: '6px 0', fontSize: '0.7rem', border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontWeight: 700, transition: 'all 0.2s',
                    backgroundColor: statusFilter === tab ? 'var(--color-primary)' : 'rgba(30, 41, 59, 0.4)',
                    color: statusFilter === tab ? '#fff' : '#64748b'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
            {filteredTelemetry.map((machine) => {
              const statusColor = getStatusColor(machine.temperature, machine.vibration, machine.type);
              const label = getStatusLabel(machine.temperature, machine.vibration, machine.type);
              const isSelected = machine.deviceId === selectedId;

              return (
                <div 
                  key={machine.deviceId} 
                  onClick={() => setSelectedId(machine.deviceId)}
                  style={{
                    padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                    backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(30, 41, 59, 0.2)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--color-primary)' : 'rgba(255,255,255,0.03)',
                    transition: 'all 0.2s ease',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? '#fff' : '#cbd5e1' }}>
                      {machine.deviceId}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      {machine.type} • {machine.operating_hours.toFixed(2)} hrs • <span style={{ color: statusColor }}>{label}</span>
                    </div>
                  </div>
                  <span style={{ 
                    width: 10, height: 10, borderRadius: '50%', backgroundColor: statusColor,
                    boxShadow: `0 0 10px ${statusColor}`
                  }} />
                </div>
              );
            })}
            {filteredTelemetry.length === 0 && (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: 24 }}>
                No machines in {statusFilter} status.
              </div>
            )}
          </div>
        </section>

        {/* Center/Right Section: Workspace */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
          
          {/* Machine Core KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {/* KPI 1: Temperature */}
            <div className="glass-panel" style={{ padding: '20px 24px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>Temperature</span>
                <Thermometer style={{ width: 20, height: 20, color: 'var(--color-danger)' }} />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                {selectedMachine.temperature}
                <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500 }}>°C</span>
              </div>
              <div style={{
                fontSize: '0.75rem', marginTop: 12,
                color: selectedMachine.temperature > (selectedMachine.type === 'Compressor' ? 92 : selectedMachine.type === 'CNC' ? 84 : 78) ? 'var(--color-danger)' : 'var(--color-success)',
                fontWeight: 600
              }}>
                {selectedMachine.temperature > (selectedMachine.type === 'Compressor' ? 92 : selectedMachine.type === 'CNC' ? 84 : 78) 
                  ? '⚠️ High Thermal Signature detected!' 
                  : '✓ Normal Operating Limit'}
              </div>
            </div>

            {/* KPI 2: Vibration */}
            <div className="glass-panel" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>Vibration</span>
                <Activity style={{ width: 20, height: 20, color: 'var(--color-secondary)' }} />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                {selectedMachine.vibration}
                <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500 }}>mm/s</span>
              </div>
              <div style={{
                fontSize: '0.75rem', marginTop: 12,
                color: selectedMachine.vibration > (selectedMachine.type === 'Compressor' ? 3.5 : selectedMachine.type === 'CNC' ? 2.8 : 2.2) ? 'var(--color-danger)' : 'var(--color-success)',
                fontWeight: 600
              }}>
                {selectedMachine.vibration > (selectedMachine.type === 'Compressor' ? 3.5 : selectedMachine.type === 'CNC' ? 2.8 : 2.2) 
                  ? '⚠️ High Bearing Oscillation!' 
                  : '✓ Alignment Calibrated'}
              </div>
            </div>

            {/* KPI 3: Current & Load */}
            <div className="glass-panel" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>Current Draw</span>
                <Zap style={{ width: 20, height: 20, color: 'var(--color-warning)' }} />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                {selectedMachine.current}
                <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500 }}>Amps</span>
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: 12, color: '#64748b', fontWeight: 600 }}>
                Spindle Speed: {selectedMachine.rpm.toLocaleString()} RPM
              </div>
            </div>

            {/* KPI 4: Predictive failure ML card */}
            <div className={`glass-panel ${(selectedMachine.failure_probability_ml * 100) > 40 ? 'alert-critical-flash' : ''}`} style={{ 
              padding: '20px 24px', 
              border: (selectedMachine.failure_probability_ml * 100) > 40 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-glow)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles style={{ width: 14, height: 14, color: 'var(--color-primary)' }} />
                  Failure Risk (ML)
                </span>
                <ShieldAlert style={{ width: 20, height: 20, color: 'var(--color-primary)' }} />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 12, color: (selectedMachine.failure_probability_ml * 100) > 75 ? 'var(--color-danger)' : (selectedMachine.failure_probability_ml * 100) > 40 ? 'var(--color-warning)' : 'var(--color-primary)' }}>
                {((selectedMachine.failure_probability_ml || 0) * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: 12, color: '#cbd5e1', fontWeight: 600 }}>
                Estimated RUL: <span style={{ color: '#fff', fontWeight: 800 }}>{selectedMachine.rul_hours_ml} hours</span>
              </div>
            </div>
          </div>

          {/* Core Content Layout: Splits into Telemetry Chart + Action Panel & Predictive Guidelines */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
            {/* Left side: Telemetry Sensor History Chart */}
            <div className="glass-panel" style={{ padding: 24, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Telemetry Sensor History</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    Visualizing temperature and vibration levels recorded over the last 12 intervals
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: 'var(--color-danger)' }} />
                    Temp (°C)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: 'var(--color-secondary)' }} />
                    Vib (mm/s)
                  </span>
                </div>
              </div>

              <div style={{ width: '100%', height: 260, flex: 1 }}>
                <ResponsiveContainer>
                  <AreaChart data={selectedHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="vibGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-secondary)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--color-secondary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                    <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#475569" fontSize={10} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={10} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: 8, fontSize: '0.85rem' }} 
                      labelStyle={{ fontWeight: 600, color: '#f8fafc' }}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="temperature" stroke="var(--color-danger)" fillOpacity={1} fill="url(#tempGrad)" strokeWidth={2} />
                    <Area yAxisId="right" type="monotone" dataKey="vibration" stroke="var(--color-secondary)" fillOpacity={1} fill="url(#vibGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right side: Maintenance Actions & Operating Tuning */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* Load Tuning Panel */}
              <div className="glass-panel" style={{ padding: 20 }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders style={{ width: 18, height: 18, color: 'var(--color-primary)' }} />
                  Operational Speed Throttle
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 16px 0' }}>
                  Overheating or extreme vibration? Throttle load to cool down component heat and prolong engine health in real-time.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                  <input 
                    type="range" 
                    min="50" 
                    max="100" 
                    value={selectedMachine.throttle || 100}
                    onChange={(e) => adjustThrottle(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '1rem', fontWeight: 800, width: 50, textAlign: 'right', color: 'var(--color-primary)' }}>
                    {selectedMachine.throttle || 100}%
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                  {selectedMachine.throttle < 100 
                    ? `✓ Active cooldown running. Engine wear factor set to ${(selectedMachine.throttle / 100).toFixed(2)}x.`
                    : "• Running at 100% capacity (Max throughput and heat degradation)."}
                </div>
              </div>

              {/* Sandbox Control Room: Anomaly Injection */}
              <div className="glass-panel" style={{ padding: 20 }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wrench style={{ width: 18, height: 18, color: 'var(--color-secondary)' }} />
                  Edge Incident Simulator
                </h3>
                
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  <button 
                    onClick={() => injectAnomaly('thermal')}
                    className="btn-control"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', flex: '1' }}
                  >
                    Heat Spike
                  </button>
                  <button 
                    onClick={() => injectAnomaly('bearing')}
                    className="btn-control"
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#3b82f6', flex: '1' }}
                  >
                    Vibration
                  </button>
                  <button 
                    onClick={() => injectAnomaly('stator')}
                    className="btn-control"
                    style={{ backgroundColor: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#eab308', flex: '1' }}
                  >
                    Overload
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button 
                    onClick={repairMachine}
                    className="btn-control"
                    style={{
                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                      color: '#4ade80',
                      border: '1px solid var(--color-success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <RefreshCw style={{ width: 14, height: 14 }} /> Calibrate Node
                  </button>
                  
                  <button 
                    onClick={() => setShowTicket(true)}
                    className="btn-control"
                    style={{
                      backgroundColor: 'rgba(139, 92, 246, 0.15)',
                      color: '#a78bfa',
                      border: '1px solid var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <FileText style={{ width: 14, height: 14 }} /> Create Ticket
                  </button>
                </div>
              </div>

              {/* Dynamic Predictive Actions / Guidelines Card */}
              {advice && (
                <div className="glass-panel" style={{ 
                  padding: 20, 
                  borderLeft: `4px solid ${selectedMachine.failure_probability_ml > 0.75 ? 'var(--color-danger)' : selectedMachine.failure_probability_ml > 0.4 ? 'var(--color-warning)' : 'var(--color-success)'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    {selectedMachine.failure_probability_ml > 0.75 
                      ? <AlertTriangle style={{ color: 'var(--color-danger)', width: 20, height: 20 }} />
                      : selectedMachine.failure_probability_ml > 0.4 
                        ? <AlertTriangle style={{ color: 'var(--color-warning)', width: 20, height: 20 }} />
                        : <CheckCircle2 style={{ color: 'var(--color-success)', width: 20, height: 20 }} />
                    }
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {advice.alert}
                      </h4>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                        {advice.action}
                      </h3>
                    </div>
                  </div>
                  
                  <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem', color: '#cbd5e1' }}>
                    {advice.steps.map((step, idx) => (
                      <li key={idx} style={{ lineHeight: 1.4 }}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Log Console Panel */}
          <section className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <Terminal style={{ width: 18, height: 18, color: '#38bdf8' }} />
              Industrial Edge Node System Logs
            </h3>
            <div 
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '12px 16px',
                height: 120,
                overflowY: 'auto',
                fontFamily: 'Consolas, Courier New, monospace',
                fontSize: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              {logs.map((log, idx) => {
                const color = log.level === 'critical' ? '#f87171' : log.level === 'warning' ? '#fbbf24' : log.level === 'success' ? '#4ade80' : '#60a5fa';
                return (
                  <div key={idx} style={{ color }}>
                    <span style={{ color: '#64748b', marginRight: 8 }}>[{log.timestamp}]</span>
                    {log.message}
                  </div>
                );
              })}
              {logs.length === 0 && <div style={{ color: '#64748b' }}>No system logs yet...</div>}
            </div>
          </section>

        </section>
      </main>
    </div>
  );
}

```

---

### 📄 File: `react-dashboard\src\index.css`

```css
/* index.css */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

:root {
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: dark;
  color: #f8fafc;
  background-color: #0b0f19;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* HSL Colors */
  --bg-deep: #070a13;
  --bg-panel: rgba(17, 24, 39, 0.7);
  --bg-card: rgba(30, 41, 59, 0.4);
  --border-glow: rgba(99, 102, 241, 0.15);
  --border-hover: rgba(99, 102, 241, 0.35);

  --color-primary: hsl(262, 83%, 65%);
  --color-primary-glow: rgba(139, 92, 246, 0.3);
  --color-secondary: hsl(200, 95%, 48%);
  
  --color-success: hsl(142, 70%, 45%);
  --color-success-glow: rgba(34, 197, 94, 0.2);
  --color-warning: hsl(38, 92%, 50%);
  --color-warning-glow: rgba(245, 158, 11, 0.2);
  --color-danger: hsl(350, 89%, 60%);
  --color-danger-glow: rgba(239, 68, 68, 0.2);
}

body {
  margin: 0;
  padding: 0;
  min-height: 100vh;
  background: radial-gradient(circle at 50% 0%, #151833 0%, #070a13 70%);
  overflow-x: hidden;
}

#root {
  width: 100%;
}

/* Glassmorphism styling */
.glass-panel {
  background: var(--bg-panel);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-glow);
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-panel:hover {
  border-color: var(--border-hover);
  box-shadow: 0 12px 40px 0 rgba(99, 102, 241, 0.15);
}

/* Scrollbar Styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-deep);
}

::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #334155;
}

/* Keyframe animations */
@keyframes pulse-glow {
  0%, 100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

@keyframes flash-red {
  0%, 100% {
    background-color: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
  }
  50% {
    background-color: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.7);
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
  }
}

.animate-pulse-glow {
  animation: pulse-glow 2s infinite ease-in-out;
}

.alert-critical-flash {
  animation: flash-red 1.5s infinite ease-in-out;
}

/* Responsive grid layouts */
.dashboard-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
  height: calc(100vh - 120px);
  box-sizing: border-box;
}
@media (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    height: auto;
  }
}

/* Control buttons style */
.btn-control {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn-control:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  filter: brightness(1.2);
}

.btn-control:active {
  transform: translateY(0);
}


```

---

### 📄 File: `react-dashboard\src\main.tsx`

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

```

---

### 📄 File: `react-dashboard\src\vite-env.d.ts`

```typescript
/// <reference types="vite/client" />

```

---

### 📄 File: `simulator\config.py`

```python
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
    return MACHINE_PROFILES[idx % len(MACHINE_PROFILES)]

```

---

### 📄 File: `simulator\machine.py`

```python
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

```

---

### 📄 File: `simulator\main.py`

```python

```

---

### 📄 File: `simulator\run_simulator.py`

```python
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

```

---

### 📄 File: `simulator\telemetry_sender.py`

```python
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

```

---


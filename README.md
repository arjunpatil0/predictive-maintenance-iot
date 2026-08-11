# Predictive Maintenance IoT 🏭

An event-driven, serverless Industrial IoT (IIoT) application built on Azure. This project simulates industrial machines (CNC, Compressors, Pumps) generating live telemetry, ingests the data via Azure IoT Hub, enriches it with real-time Machine Learning predictions, stores the state in Azure Cosmos DB, and serves the live data to a modern React dashboard.

## 🏗️ Architecture

1. **Python Simulator (`/simulator`)**: Acts as an edge gateway, simulating telemetry (temperature, vibration, RPM) and hardware degradation for 10 virtual machines.
2. **Data Ingestion**: **Azure IoT Hub** receives high-frequency data streams from the simulator.
3. **Real-time ML Inference (`/azure-functions`)**: An Azure Function (`process_telemetry`) is triggered by the IoT Hub. It runs live telemetry through a pre-trained `scikit-learn` model to predict:
   - **Failure Probability** (Imminent breakdown risk)
   - **Remaining Useful Life (RUL)** (Hours left before critical failure)
4. **Hot Storage**: Enriched telemetry is upserted into **Azure Cosmos DB** (NoSQL), partitioned by `deviceId`.
5. **REST API (`/azure-functions`)**: An HTTP-triggered Azure Function (`api_telemetry`) queries Cosmos DB to serve live state.
6. **React Dashboard (`/react-dashboard`)**: A Vite + React application providing a real-time SCADA-style view of the factory floor, featuring predictive alerts and emergency overrides.

## 🚀 How to Run Locally

To run the full stack locally, open three separate terminal windows:

### 1. Start the Cloud Backend API
```bash
cd azure-functions
func start
```
*(Runs on http://localhost:7071)*

### 2. Start the IoT Simulator
```bash
cd simulator
python main.py
```
*(Begins sending telemetry payloads to the cloud)*

### 3. Start the React Dashboard
```bash
cd react-dashboard
npm run dev
```
*(Access the UI at http://localhost:5173)*

## 🤖 Machine Learning Pipeline (`/ml-model`)
The models driving the predictive maintenance were trained offline using synthetic data:
- **`failure_clf.joblib`**: A classification model that predicts the likelihood of failure within 30 days.
- **`rul_reg.joblib`**: A regression model that estimates the exact remaining useful life of the machine.

> **Note on Sandbox Mode**: If the Azure backend is offline, the React Dashboard will automatically fallback to an "Offline Sandbox Mode," using hardcoded heuristics to simulate the ML predictions directly in the browser so you can still demo the UI.

## 🛠️ Tech Stack
* **Cloud**: Azure IoT Hub, Azure Functions (Python), Azure Cosmos DB
* **Machine Learning**: Python, `scikit-learn`, `pandas`
* **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Recharts

# Predictive Maintenance IoT Application

This repository contains an event-driven, serverless Industrial Internet of Things (IIoT) application developed on Microsoft Azure. The primary objective of this system is to ingest high-frequency telemetry data from industrial machinery, apply machine learning models to predict impending equipment failures, and present this data through a real-time monitoring dashboard.

## System Architecture

The application is structured into the following components:

### 1. Edge Simulator (/simulator)
A Python-based simulation engine that acts as an edge gateway. It generates synthetic telemetry (including temperature, vibration, and RPM metrics) for multiple virtual machines, simulating gradual hardware degradation and operating conditions over time.

### 2. Data Ingestion
Azure IoT Hub serves as the primary ingestion point for the system, securely receiving high-frequency telemetry payloads from the edge simulator.

### 3. Real-Time Processing and Inference (/azure-functions)
An Azure Function (`process_telemetry`), triggered by incoming IoT Hub messages, serves as the data processing layer. It routes live telemetry through a pre-trained scikit-learn machine learning model to generate two key predictions:
- **Failure Probability**: The statistical likelihood of an imminent hardware failure.
- **Remaining Useful Life (RUL)**: An estimation of the operational hours remaining before critical failure occurs.

### 4. Data Storage
The enriched telemetry data, complete with machine learning predictions, is persistently stored in Azure Cosmos DB. The NoSQL database is partitioned by device ID to ensure highly efficient read and write operations at scale.

### 5. RESTful API (/azure-functions)
A second Azure Function (`api_telemetry`) provides an HTTP-based REST API. This endpoint queries Azure Cosmos DB to serve the most recent machine states to the client application.

### 6. Client Dashboard (/react-dashboard)
A front-end application built with React and Vite. It polls the REST API to provide operators with a real-time visualization of the factory floor, featuring predictive alerts, status tracking, and emergency override controls.

## Local Development Setup

To run the complete application stack locally, you will need to start the backend API, the simulator, and the frontend dashboard in separate terminal sessions.

### 1. Start the Backend API
Navigate to the azure-functions directory and start the local Azure Functions core tools runtime:
```bash
cd azure-functions
func start
```

### 2. Start the Edge Simulator
Navigate to the simulator directory and execute the main Python script:
```bash
cd simulator
python main.py
```

### 3. Start the Client Dashboard
Navigate to the react-dashboard directory and start the Node development server:
```bash
cd react-dashboard
npm run dev
```

## Machine Learning Pipeline (/ml-model)

The predictive models were trained offline using a synthetic dataset of historical machine behavior. The resulting deployment artifacts include:
- `failure_clf.joblib`: A classification model designed to predict the probability of failure within a 30-day window.
- `rul_reg.joblib`: A regression model that estimates the remaining operational hours of a machine.

*Note: The React dashboard includes an offline fallback mode. If the Azure backend is unreachable, the dashboard will utilize hardcoded heuristics to simulate machine learning predictions locally within the browser. This allows for demonstration of the user interface without requiring active cloud connectivity.*

## Technology Stack

- **Cloud Infrastructure**: Azure IoT Hub, Azure Functions (Serverless Compute), Azure Cosmos DB
- **Machine Learning**: Python, scikit-learn, pandas
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Recharts

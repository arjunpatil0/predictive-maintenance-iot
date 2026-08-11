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

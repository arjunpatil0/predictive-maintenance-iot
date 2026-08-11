import { useState, useEffect, useRef } from 'react';
import { 
  Activity, Cpu, ShieldAlert, Sparkles, Thermometer,
  Zap, Wrench, RefreshCw, Terminal, AlertTriangle, CheckCircle2,
  Sliders, FileText, Printer, X, Power, Hourglass
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
  isShutdown: boolean; // Active E-Stop status
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'critical' | 'success';
  message: string;
}

// Initial baseline profiles for the 10 machines
// Note: Machine 3 & Machine 7 have HIGHLY ACCELERATED degradation rates (degTemp and degVib) for instant demo impact!
const INITIAL_PROFILES = [
  { deviceId: 'sim-machine-001', type: 'CNC', tempBase: 60, vibBase: 0.8, rpmBase: 1500, currentBase: 10, degTemp: 0.05, degVib: 0.002, degCurrent: 0.01 },
  { deviceId: 'sim-machine-002', type: 'Compressor', tempBase: 70, vibBase: 1.2, rpmBase: 1800, currentBase: 12, degTemp: 0.04, degVib: 0.001, degCurrent: 0.009 },
  // Machine 3: High degradation rate (Rapid breakdown!)
  { deviceId: 'sim-machine-003', type: 'Pump', tempBase: 55, vibBase: 0.6, rpmBase: 1200, currentBase: 8, degTemp: 2.5, degVib: 0.14, degCurrent: 0.2 },
  { deviceId: 'sim-machine-004', type: 'CNC', tempBase: 61, vibBase: 0.9, rpmBase: 1490, currentBase: 10.2, degTemp: 0.05, degVib: 0.002, degCurrent: 0.011 },
  { deviceId: 'sim-machine-005', type: 'Compressor', tempBase: 72, vibBase: 1.3, rpmBase: 1810, currentBase: 12.4, degTemp: 0.04, degVib: 0.001, degCurrent: 0.008 },
  { deviceId: 'sim-machine-006', type: 'Pump', tempBase: 54, vibBase: 0.7, rpmBase: 1210, currentBase: 7.9, degTemp: 0.06, degVib: 0.003, degCurrent: 0.013 },
  // Machine 7: Extreme degradation rate (Rapid breakdown!)
  { deviceId: 'sim-machine-007', type: 'CNC', tempBase: 59, vibBase: 0.85, rpmBase: 1510, currentBase: 9.8, degTemp: 3.2, degVib: 0.19, degCurrent: 0.35 },
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
  const [statusFilter, setStatusFilter] = useState<'All' | 'Healthy' | 'Warning' | 'Critical' | 'Shutdown'>('All');
  const [showTicket, setShowTicket] = useState<boolean>(false);
  // Rapid wear demo: list of machine IDs undergoing accelerated degradation
  const [rapidWearMachines, setRapidWearMachines] = useState<string[]>([]);
  
  const localSimState = useRef<TelemetryRecord[]>([]);
  // Refs to avoid useEffect dependency issues (these track the latest state without triggering re-runs)
  const isLiveRef = useRef(false);
  const isDemoModeRef = useRef(false);
  const rapidWearMachinesRef = useRef<string[]>([]);

  const addLog = (message: string, level: 'info' | 'warning' | 'critical' | 'success' = 'info') => {
    const timeStr = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [{ timestamp: timeStr, level, message }, ...prev.slice(0, 49)]);
  };

  // Helper to run simulated ML predictions based on parameters
  const calculateMLFields = (temp: number, vib: number, type: string, isShutdown: boolean) => {
    if (isShutdown) {
      return {
        failure_probability_ml: 0.0,
        rul_hours_ml: 999,
        will_fail_30d: false
      };
    }

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
      const ml = calculateMLFields(profile.tempBase, profile.vibBase, profile.type, false);
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
        isShutdown: false,
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
    addLog("WARNING: sim-machine-003 & 007 configured with accelerated wear-and-tear coefficients.", "warning");
  };

  // Process a simulation tick (runs every 4 seconds when offline)
  const processSimulationTick = () => {
    if (localSimState.current.length === 0) return;

    const now = Date.now();
    const updated = localSimState.current.map((machine, idx) => {
      const profile = INITIAL_PROFILES[idx];

      if (machine.isShutdown) {
        // Cooldown behavior when E-Stopped (temperature decays to ambient room temperature of 25°C)
        const ambientTemp = 25.0;
        const cooledTemp = machine.temperature - (machine.temperature - ambientTemp) * 0.3;
        const cooledVib = Math.max(0.0, machine.vibration - machine.vibration * 0.4);
        
        return {
          ...machine,
          id: `${machine.deviceId}-${now}`,
          temperature: Number(cooledTemp.toFixed(1)),
          vibration: Number(cooledVib.toFixed(3)),
          rpm: 0,
          current: 0.0,
          timestamp: now
        };
      }

      const throttleFactor = machine.throttle / 100; // 0.5 to 1.0

      // Dynamic baseline shifts down if throttled (machine cools down!)
      const targetTemp = profile.tempBase - (1 - throttleFactor) * 20;
      const targetVib = profile.vibBase - (1 - throttleFactor) * 0.3;
      
      const tempDelta = (targetTemp - machine.temperature) * 0.15;
      const vibDelta = (targetVib - machine.vibration) * 0.15;

      const baseWearRateTemp = profile.degTemp * throttleFactor;
      const baseWearRateVib = profile.degVib * throttleFactor;
      // If this machine is part of the rapid wear demo, amplify degradation
      const wearRateTemp = rapidWearMachinesRef.current.includes(machine.deviceId) ? baseWearRateTemp * 3 : baseWearRateTemp;
      const wearRateVib = rapidWearMachinesRef.current.includes(machine.deviceId) ? baseWearRateVib * 3 : baseWearRateVib;

      let newTemp = machine.temperature + tempDelta + wearRateTemp + (Math.random() - 0.4) * 0.5;
      let newVib = machine.vibration + vibDelta + wearRateVib + (Math.random() - 0.4) * 0.04;
      let newRpm = profile.rpmBase * throttleFactor - 0.1;
      let newCurrent = profile.currentBase * throttleFactor + profile.degCurrent;

      // Periodic operational jitter
      if (Math.random() < (0.05 * throttleFactor)) {
        const spike = Math.random() * 4 + 1;
        newTemp += spike;
        addLog(`Minor thermal fluctuation on ${machine.deviceId}: +${spike.toFixed(1)}°C`, "info");
      }

      const ml = calculateMLFields(newTemp, newVib, machine.type, false);

      // Warning triggers in logs
      if (ml.failure_probability_ml > 0.75 && machine.failure_probability_ml <= 0.75) {
        addLog(`CRITICAL: ${machine.deviceId} predicted failure risk at ${(ml.failure_probability_ml * 100).toFixed(0)}%! Shutdown machine to prevent stator damage.`, "critical");
      } else if (ml.failure_probability_ml > 0.4 && machine.failure_probability_ml <= 0.4) {
        addLog(`WARNING: ${machine.deviceId} is experiencing accelerated degradation.`, "warning");
      }

      let isShutdownNext = machine.isShutdown;

      return {
        ...machine,
        id: `${machine.deviceId}-${now}`,
        temperature: Number(newTemp.toFixed(1)),
        isShutdown: isShutdownNext,
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

  // Keep refs in sync with state
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);
  useEffect(() => { isDemoModeRef.current = isDemoMode; }, [isDemoMode]);
  useEffect(() => { rapidWearMachinesRef.current = rapidWearMachines; }, [rapidWearMachines]);

  // Poll for telemetry (Live) or Run local tick (Offline)
  // Empty dependency array — runs once on mount; uses refs to read latest state
  useEffect(() => {
    // Reset refs on mount to handle React StrictMode double-mounting correctly
    isLiveRef.current = false;
    isDemoModeRef.current = false;

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
            throttle: rec.throttle || 100,
            isShutdown: rec.isShutdown || false
          }));
          
          setTelemetry(latestRecords);
          if (!isLiveRef.current) {
            addLog("Successfully established telemetry feed with local Azure Functions Runtime API!", "success");
          }
          setIsLive(true);
          isLiveRef.current = true;
          setIsDemoMode(false);
          isDemoModeRef.current = false;
          
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
      } catch (_err) {
        triggerFallback();
      } finally {
        setLoading(false);
      }
    };

    const triggerFallback = () => {
      if (!isDemoModeRef.current || localSimState.current.length === 0) {
        addLog("Local API offline. Initializing persistent sandbox simulation...", "warning");
        setIsLive(false);
        isLiveRef.current = false;
        setIsDemoMode(true);
        isDemoModeRef.current = true;
        initLocalSimulation();
      } else {
        processSimulationTick();
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adjust operating throttle / load
  const adjustThrottle = (val: number) => {
    if (selectedMachine.isShutdown) return;

    if (!isDemoMode) {
      addLog(`Adjusting remote throttle for device ${selectedId} to ${val}%...`, "info");
    } else {
      addLog(`Tuning operational load for ${selectedId} to ${val}%`, "info");
    }

    const updated = localSimState.current.map(machine => {
      if (machine.deviceId === selectedId) {
        const ml = calculateMLFields(machine.temperature, machine.vibration, machine.type, false);
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
    if (selectedMachine.isShutdown) {
      alert("Cannot inject anomaly on a shutdown machine. Power it back up first!");
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

        const ml = calculateMLFields(spikedTemp, spikedVib, machine.type, false);
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
          const ml = calculateMLFields(profile.tempBase, profile.vibBase, machine.type, false);
          addLog(`Calibration completed. Stator aligned, lubrication applied to ${selectedId}. Health restored to 100%!`, "success");
          return {
            ...machine,
            temperature: profile.tempBase,
            vibration: profile.vibBase,
            rpm: profile.rpmBase,
            current: profile.currentBase,
            throttle: 100, 
            isShutdown: false, // Turn back on after repair
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

  // E-STOP: Emergency Shutdown Toggle
  const toggleEmergencyShutdown = () => {
    const nextStatus = !selectedMachine.isShutdown;
    
    if (nextStatus) {
      addLog(`[E-STOP] CRITICAL EMERGENCY SHUTDOWN SIGNAL SENT TO ${selectedId}! CUTTING POWER IMMEDIATELY.`, "critical");
    } else {
      addLog(`[E-STOP RESTORE] Re-initializing ignition sequence for motor coils on ${selectedId}. Booting RPM.`, "success");
    }

    const updated = localSimState.current.map(machine => {
      if (machine.deviceId === selectedId) {
        const ml = calculateMLFields(machine.temperature, machine.vibration, machine.type, nextStatus);
        return {
          ...machine,
          isShutdown: nextStatus,
          ...ml
        };
      }
      return machine;
    });

    localSimState.current = updated;
    setTelemetry(updated);
  };

  // Rapid wear demo: activate accelerated degradation for machines 3 and 7
  const startRapidWearDemo = () => {
    setRapidWearMachines(['sim-machine-003', 'sim-machine-007']);
    addLog('Rapid wear demo started on machines sim-machine-003 and sim-machine-007.', 'info');
  };

  const selectedMachine = telemetry.find(m => m.deviceId === selectedId) || telemetry[0];
  const selectedHistory = historyMap[selectedId] || [];

  // ── EARLY RETURN: must come before any code that dereferences selectedMachine ──
  if (loading || telemetry.length === 0 || !selectedMachine) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#070a13' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginTop: 16, color: '#94a3b8', fontSize: '1.1rem' }}>Initializing High-Fidelity Dashboard...</p>
        </div>
      </div>
    );
  }

  // Summary Metrics
  const activeCount = telemetry.length;
  
  const getStatusColor = (temp: number, vib: number, type: string, isShutdown: boolean) => {
    if (isShutdown) return 'hsl(210, 80%, 55%)'; // Cool Blue for shutdown
    let tempLimit = type === 'Compressor' ? 92 : type === 'CNC' ? 84 : 78;
    let vibLimit = type === 'Compressor' ? 3.5 : type === 'CNC' ? 2.8 : 2.2;
    if (temp > tempLimit + 10 || vib > vibLimit + 1.5) return 'var(--color-danger)';
    if (temp > tempLimit || vib > vibLimit) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  const getStatusLabel = (temp: number, vib: number, type: string, isShutdown: boolean) => {
    if (isShutdown) return 'Shutdown';
    let tempLimit = type === 'Compressor' ? 92 : type === 'CNC' ? 84 : 78;
    let vibLimit = type === 'Compressor' ? 3.5 : type === 'CNC' ? 2.8 : 2.2;
    if (temp > tempLimit + 10 || vib > vibLimit + 1.5) return 'Critical';
    if (temp > tempLimit || vib > vibLimit) return 'Warning';
    return 'Healthy';
  };

  // Filter telemetry grid based on selection
  const filteredTelemetry = telemetry.filter(m => {
    const status = getStatusLabel(m.temperature, m.vibration, m.type, m.isShutdown);
    if (statusFilter === 'All') return true;
    return status === statusFilter;
  });

  const warningCount = telemetry.filter(m => getStatusLabel(m.temperature, m.vibration, m.type, m.isShutdown) === 'Warning').length;
  const criticalCount = telemetry.filter(m => getStatusLabel(m.temperature, m.vibration, m.type, m.isShutdown) === 'Critical').length;
  const avgHealth = telemetry.length > 0 
    ? 100 - (telemetry.reduce((acc, m) => acc + (m.failure_probability_ml || 0), 0) / telemetry.length) * 100 
    : 100;

  // Dynamic advice cards based on machine type and current metrics
  const getPredictiveAdvice = (machine: TelemetryRecord) => {
    if (!machine) return null;
    if (machine.isShutdown) {
      return {
        alert: "MOTOR INACTIVE (SAFE STATUS)",
        action: "Power Grid Fully Disconnected",
        steps: [
          "Emergency shutdown signal confirmed by IoT core.",
          "Thermodynamic dissipation cooling bearing housing.",
          "Perform planned maintenance calibration before booting RPM."
        ]
      };
    }

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
          "Click the red E-STOP button to disconnect power safely."
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
          "Adjust load throttle downward to cool machine core."
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

  // Time-to-failure calculations for fast demo wear-and-tear
  const getFailureCountdownText = (machine: TelemetryRecord) => {
    if (!machine) return "Initializing...";
    if (machine.isShutdown) return "N/A (Stopped)";
    if (machine.failure_probability_ml < 0.1) return "Stable / Safe Operation";
    
    // In our fast-degradation demo, we calculate seconds until it hits critical breakdown limit
    let idx = INITIAL_PROFILES.findIndex(p => p.deviceId === machine.deviceId);
    let profile = INITIAL_PROFILES[idx];
    
    let tempLimit = machine.type === 'Compressor' ? 92 : machine.type === 'CNC' ? 84 : 78;
    
    if (profile.degTemp > 1.0) {
      // Fast degrading machines (3 & 7)
      const degreesToLimit = Math.max(0, tempLimit - machine.temperature);
      const secondsLeft = Math.round((degreesToLimit / profile.degTemp) * 4); // each tick is 4 seconds
      if (secondsLeft <= 0) return "COLLAPSE IMMINENT (Failed)";
      return `${secondsLeft} real-world seconds (${machine.rul_hours_ml} RUL operating hours)`;
    }
    
    // Slow degrading machines
    return `Approx. ${(machine.rul_hours_ml / 10).toFixed(0)} mins (${machine.rul_hours_ml} RUL operating hours)`;
  };

  const countdownText = getFailureCountdownText(selectedMachine);

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, margin: '8px 0 16px 0' }}>
              {(['All', 'Healthy', 'Warning', 'Critical', 'Shutdown'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  style={{
                    padding: '6px 0', fontSize: '0.62rem', border: 'none', borderRadius: 6, cursor: 'pointer',
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
              const statusColor = getStatusColor(machine.temperature, machine.vibration, machine.type, machine.isShutdown);
              const label = getStatusLabel(machine.temperature, machine.vibration, machine.type, machine.isShutdown);
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
          
          {/* Predictive Time-To-Failure Countdown Widget */}
          {selectedMachine && (
            <div className="glass-panel" style={{ 
              padding: '18px 24px', 
              background: selectedMachine.isShutdown ? 'rgba(30, 41, 59, 0.3)' : selectedMachine.failure_probability_ml > 0.75 ? 'rgba(239, 68, 68, 0.08)' : selectedMachine.failure_probability_ml > 0.4 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.05)',
              borderLeft: `5px solid ${getStatusColor(selectedMachine.temperature, selectedMachine.vibration, selectedMachine.type, selectedMachine.isShutdown)}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  padding: 10, borderRadius: 10
                }}>
                  <Hourglass className={selectedMachine.failure_probability_ml > 0.4 && !selectedMachine.isShutdown ? 'animate-spin' : ''} style={{ 
                    color: getStatusColor(selectedMachine.temperature, selectedMachine.vibration, selectedMachine.type, selectedMachine.isShutdown),
                    width: 24, height: 24,
                    animationDuration: selectedMachine.failure_probability_ml > 0.75 ? '1.5s' : '4s'
                  }} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ML PREDICTIVE RUNTIME REMAINING
                  </h4>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', marginTop: 2 }}>
                    {countdownText}
                  </div>
                </div>
              </div>
              <div style={{ width: '40%', maxWidth: '240px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>
                  <span>Wear Integrity</span>
                  <span>{selectedMachine.isShutdown ? '100%' : `${((1 - selectedMachine.failure_probability_ml) * 100).toFixed(0)}%`}</span>
                </div>
                {/* Visual Progress Bar */}
                <div style={{ width: '100%', height: 6, backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ 
                    width: selectedMachine.isShutdown ? '100%' : `${((1 - selectedMachine.failure_probability_ml) * 100)}%`, 
                    height: '100%', 
                    borderRadius: 3,
                    transition: 'all 0.5s ease',
                    backgroundColor: getStatusColor(selectedMachine.temperature, selectedMachine.vibration, selectedMachine.type, selectedMachine.isShutdown)
                  }} />
                </div>
              </div>
            </div>
          )}

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
                color: selectedMachine.isShutdown ? '#64748b' : selectedMachine.temperature > (selectedMachine.type === 'Compressor' ? 92 : selectedMachine.type === 'CNC' ? 84 : 78) ? 'var(--color-danger)' : 'var(--color-success)',
                fontWeight: 600
              }}>
                {selectedMachine.isShutdown ? '✓ Motor Disengaged (Cooling)' : selectedMachine.temperature > (selectedMachine.type === 'Compressor' ? 92 : selectedMachine.type === 'CNC' ? 84 : 78) 
                  ? '⚠️ High Thermal Signature!' 
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
                color: selectedMachine.isShutdown ? '#64748b' : selectedMachine.vibration > (selectedMachine.type === 'Compressor' ? 3.5 : selectedMachine.type === 'CNC' ? 2.8 : 2.2) ? 'var(--color-danger)' : 'var(--color-success)',
                fontWeight: 600
              }}>
                {selectedMachine.isShutdown ? '✓ Stationary / Locked' : selectedMachine.vibration > (selectedMachine.type === 'Compressor' ? 3.5 : selectedMachine.type === 'CNC' ? 2.8 : 2.2) 
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
            <div className={`glass-panel ${!selectedMachine.isShutdown && (selectedMachine.failure_probability_ml * 100) > 40 ? 'alert-critical-flash' : ''}`} style={{ 
              padding: '20px 24px', 
              border: !selectedMachine.isShutdown && (selectedMachine.failure_probability_ml * 100) > 40 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-glow)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles style={{ width: 14, height: 14, color: 'var(--color-primary)' }} />
                  Failure Risk (ML)
                </span>
                <ShieldAlert style={{ width: 20, height: 20, color: 'var(--color-primary)' }} />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 12, color: selectedMachine.isShutdown ? '#64748b' : (selectedMachine.failure_probability_ml * 100) > 75 ? 'var(--color-danger)' : (selectedMachine.failure_probability_ml * 100) > 40 ? 'var(--color-warning)' : 'var(--color-primary)' }}>
                {selectedMachine.isShutdown ? '0%' : `${((selectedMachine.failure_probability_ml || 0) * 100).toFixed(1)}%`}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: 12, color: '#cbd5e1', fontWeight: 600 }}>
                Estimated RUL: <span style={{ color: '#fff', fontWeight: 800 }}>{selectedMachine.isShutdown ? '∞' : `${selectedMachine.rul_hours_ml} hours`}</span>
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
                    disabled={selectedMachine.isShutdown}
                    value={selectedMachine.throttle || 100}
                    onChange={(e) => adjustThrottle(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--color-primary)', cursor: selectedMachine.isShutdown ? 'not-allowed' : 'pointer' }}
                  />
                  <span style={{ fontSize: '1rem', fontWeight: 800, width: 50, textAlign: 'right', color: selectedMachine.isShutdown ? '#64748b' : 'var(--color-primary)' }}>
                    {selectedMachine.isShutdown ? '0' : selectedMachine.throttle || 100}%
                  </span>
                </div>
                <button
                    onClick={startRapidWearDemo}
                    className="btn-control"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', marginTop: 8 }}
                  >
                    Start Rapid Wear Demo
                  </button>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                  {selectedMachine.isShutdown
                    ? "• E-STOP ACTIVE: Motor is fully powered down."
                    : selectedMachine.throttle < 100 
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
                    disabled={selectedMachine.isShutdown}
                    onClick={() => injectAnomaly('thermal')}
                    className="btn-control"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', flex: '1', opacity: selectedMachine.isShutdown ? 0.4 : 1 }}
                  >
                    Heat Spike
                  </button>
                  <button 
                    disabled={selectedMachine.isShutdown}
                    onClick={() => injectAnomaly('bearing')}
                    className="btn-control"
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#3b82f6', flex: '1', opacity: selectedMachine.isShutdown ? 0.4 : 1 }}
                  >
                    Vibration
                  </button>
                  <button 
                    disabled={selectedMachine.isShutdown}
                    onClick={() => injectAnomaly('stator')}
                    className="btn-control"
                    style={{ backgroundColor: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#eab308', flex: '1', opacity: selectedMachine.isShutdown ? 0.4 : 1 }}
                  >
                    Overload
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button 
                    onClick={repairMachine}
                    className="btn-control"
                    style={{
                      backgroundColor: 'rgba(34, 197, 94, 0.12)',
                      color: '#4ade80',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      fontSize: '0.7rem'
                    }}
                  >
                    <RefreshCw style={{ width: 12, height: 12 }} /> Calibrate
                  </button>
                  
                  <button 
                    onClick={() => setShowTicket(true)}
                    className="btn-control"
                    style={{
                      backgroundColor: 'rgba(139, 92, 246, 0.12)',
                      color: '#a78bfa',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      fontSize: '0.7rem'
                    }}
                  >
                    <FileText style={{ width: 12, height: 12 }} /> Ticket
                  </button>

                  <button 
                    onClick={toggleEmergencyShutdown}
                    className="btn-control"
                    style={{
                      backgroundColor: selectedMachine.isShutdown ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: selectedMachine.isShutdown ? '#60a5fa' : '#f87171',
                      border: selectedMachine.isShutdown ? '1px solid #2563eb' : '1px solid #dc2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      fontSize: '0.7rem',
                      fontWeight: 'bold'
                    }}
                  >
                    <Power style={{ width: 12, height: 12 }} /> 
                    {selectedMachine.isShutdown ? 'Boot Motor' : 'E-STOP'}
                  </button>
                </div>
              </div>

              {/* Dynamic Predictive Actions / Guidelines Card */}
              {advice && (
                <div className="glass-panel" style={{ 
                  padding: 20, 
                  borderLeft: `4px solid ${getStatusColor(selectedMachine.temperature, selectedMachine.vibration, selectedMachine.type, selectedMachine.isShutdown)}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    {selectedMachine.isShutdown ? (
                      <CheckCircle2 style={{ color: 'hsl(210, 80%, 55%)', width: 20, height: 20 }} />
                    ) : selectedMachine.failure_probability_ml > 0.75 ? (
                      <AlertTriangle style={{ color: 'var(--color-danger)', width: 20, height: 20 }} />
                    ) : selectedMachine.failure_probability_ml > 0.4 ? (
                      <AlertTriangle style={{ color: 'var(--color-warning)', width: 20, height: 20 }} />
                    ) : (
                      <CheckCircle2 style={{ color: 'var(--color-success)', width: 20, height: 20 }} />
                    )}
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

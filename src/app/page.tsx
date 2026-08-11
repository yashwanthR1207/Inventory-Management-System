"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Thermometer,
  Droplets,
  Cpu,
  Wifi,
  WifiOff,
  Activity,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, formatDistanceToNow } from "date-fns";

type SensorData = {
  id: string;
  device_id: string;
  temperature: number;
  humidity: number;
  timestamp: string;
};

type MqttStatusResponse = {
  status: "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
  message: string;
  lastReading: string | null;
  secondsAgo: number | null;
};

export default function Dashboard() {
  const [data, setData] = useState<SensorData[]>([]);
  const [latestData, setLatestData] = useState<SensorData | null>(null);
  const [mqttStatus, setMqttStatus] = useState<
    "CONNECTED" | "DISCONNECTED" | "UNKNOWN" | "CHECKING"
  >("CHECKING");
  const [mqttMessage, setMqttMessage] = useState<string>(
    "Checking MQTT status..."
  );
  const [deviceStatus, setDeviceStatus] = useState<"ONLINE" | "OFFLINE">(
    "OFFLINE"
  );
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  const DEVICE_TIMEOUT_SEC = 60;
  const DEVICE_ID = "esp32-01";
  const MQTT_STATUS_POLL_MS = 30_000;

  // ─── MQTT status via API ──────────────────────────────────────────
  const checkMqttStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/mqtt-status");
      if (!res.ok) {
        setMqttStatus("UNKNOWN");
        setMqttMessage("Failed to reach MQTT status endpoint");
        return;
      }
      const json: MqttStatusResponse = await res.json();
      setMqttStatus(json.status);
      setMqttMessage(json.message);
    } catch {
      setMqttStatus("UNKNOWN");
      setMqttMessage("Could not check MQTT status");
    }
  }, []);

  // ─── Tick for relative timestamps ─────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Poll MQTT status ─────────────────────────────────────────────
  useEffect(() => {
    checkMqttStatus();
    const interval = setInterval(checkMqttStatus, MQTT_STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [checkMqttStatus]);

  // ─── Fetch data + realtime subscription ───────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setSupabaseError(null);

      try {
        const { data: sensorData, error } = await supabase
          .from("sensor_data")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);

        if (error) {
          console.error("Error fetching data:", error);
          setSupabaseError(error.message);
          setIsLoading(false);
          return;
        }

        if (sensorData && sensorData.length > 0) {
          setLatestData(sensorData[0]);
          setLastUpdatedTime(new Date(sensorData[0].timestamp));
          setData([...sensorData].reverse());
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        setSupabaseError("Could not connect to database");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    const channel = supabase
      .channel("public:sensor_data")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_data" },
        (payload) => {
          const newRecord = payload.new as SensorData;
          setLatestData(newRecord);
          setLastUpdatedTime(new Date(newRecord.timestamp));
          setData((current) => {
            const updated = [...current, newRecord];
            if (updated.length > 20) return updated.slice(updated.length - 20);
            return updated;
          });
          setMqttStatus("CONNECTED");
          setMqttMessage("MQTT pipeline is active");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Device online/offline ────────────────────────────────────────
  useEffect(() => {
    if (!lastUpdatedTime) return;
    const diffInSeconds = (now.getTime() - lastUpdatedTime.getTime()) / 1000;
    setDeviceStatus(diffInSeconds < DEVICE_TIMEOUT_SEC ? "ONLINE" : "OFFLINE");
  }, [now, lastUpdatedTime]);

  // ─── Helpers ──────────────────────────────────────────────────────
  const formatXAxis = (tickItem: string) => {
    try {
      return format(new Date(tickItem), "HH:mm");
    } catch {
      return "";
    }
  };

  const mqttColor = () => {
    switch (mqttStatus) {
      case "CONNECTED": return "#34d399";
      case "DISCONNECTED": return "#f87171";
      case "CHECKING": return "#fbbf24";
      default: return "#5a6380";
    }
  };

  const mqttTextClass = () => {
    switch (mqttStatus) {
      case "CONNECTED": return "text-emerald-400";
      case "DISCONNECTED": return "text-red-400";
      case "CHECKING": return "text-amber-400";
      default: return "text-gray-500";
    }
  };

  const MqttIcon = () => {
    if (mqttStatus === "CONNECTED") return <Wifi className="w-4 h-4 text-emerald-400" />;
    if (mqttStatus === "DISCONNECTED") return <WifiOff className="w-4 h-4 text-red-400" />;
    if (mqttStatus === "CHECKING") return <RefreshCw className="w-4 h-4 text-amber-400 spin-smooth" />;
    return <AlertCircle className="w-4 h-4 text-gray-500" />;
  };

  // ═══════════════════════════════════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════════════════════════════════
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-14 text-center">
          <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: "rgba(79, 143, 255, 0.1)", border: "1px solid rgba(79, 143, 255, 0.2)" }}>
            <RefreshCw className="w-8 h-8 text-[#4f8fff] spin-smooth" />
          </div>
          <h2 className="text-2xl font-bold text-[#e8ecf5] mb-2">Loading Dashboard</h2>
          <p className="text-[#8892b0]">Connecting to sensor database...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen p-5 md:p-8 lg:p-12 max-w-[1440px] mx-auto">
      {/* ─── HEADER ──────────────────────────────────────────────── */}
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#e8ecf5] tracking-tight">
            Inventory Environment
          </h1>
          <p className="text-[#8892b0] mt-1.5 text-sm font-medium">
            Real-time warehouse storage conditions
          </p>
        </div>

        <div className="flex gap-3 text-xs font-semibold">
          {/* MQTT Badge */}
          <button
            onClick={checkMqttStatus}
            className="glass-badge px-5 py-2.5 flex items-center gap-2.5 cursor-pointer"
            title={mqttMessage}
          >
            <MqttIcon />
            <span className="text-[#8892b0]">MQTT</span>
            <span className={mqttTextClass()} style={{ textShadow: `0 0 12px ${mqttColor()}40` }}>
              ● {mqttStatus}
            </span>
          </button>

          {/* Device Badge */}
          <div className="glass-badge px-5 py-2.5 flex items-center gap-2.5">
            <Cpu className={`w-4 h-4 ${deviceStatus === "ONLINE" ? "text-emerald-400" : "text-gray-500"}`} />
            <span className="text-[#8892b0]">{latestData?.device_id || DEVICE_ID}</span>
            <span className={deviceStatus === "ONLINE" ? "text-emerald-400" : "text-gray-500"}
              style={deviceStatus === "ONLINE" ? { textShadow: "0 0 12px rgba(52,211,153,0.4)" } : {}}>
              ● {deviceStatus}
            </span>
          </div>
        </div>
      </header>

      {/* ─── ERROR BANNERS ───────────────────────────────────────── */}
      {supabaseError && (
        <div className="mb-6 glass-banner p-4 flex items-center gap-3"
          style={{ borderLeft: "3px solid #f87171" }}>
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="font-semibold text-red-400 text-sm">Database Connection Issue</p>
            <p className="text-xs text-[#8892b0] mt-0.5">{supabaseError}</p>
          </div>
        </div>
      )}

      {mqttStatus === "DISCONNECTED" && (
        <div className="mb-6 glass-banner p-4 flex items-center gap-3"
          style={{ borderLeft: "3px solid #fbbf24" }}>
          <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="font-semibold text-amber-400 text-sm">MQTT Pipeline Inactive</p>
            <p className="text-xs text-[#8892b0] mt-0.5">
              {mqttMessage}. Showing last known data — live updates resume when MQTT reconnects.
            </p>
          </div>
        </div>
      )}

      {/* ─── LAST UPDATED ────────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-2 text-xs font-medium text-[#5a6380]">
        <Activity className="w-3.5 h-3.5" />
        <span>Last updated:</span>
        <span className="text-[#8892b0]">
          {lastUpdatedTime
            ? formatDistanceToNow(lastUpdatedTime, { addSuffix: true })
            : "Waiting for data..."}
        </span>
      </div>

      {/* ─── METRIC CARDS ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {/* Temperature */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="icon-glow blue w-10 h-10">
              <Thermometer className="w-5 h-5 text-[#4f8fff]" />
            </div>
            <span className="text-xs font-semibold text-[#5a6380] uppercase tracking-wider">Temperature</span>
          </div>
          <div className="glass-well py-4 px-4 flex items-baseline justify-center gap-1">
            <span className="text-4xl font-bold text-[#e8ecf5] tabular-nums">
              {latestData ? latestData.temperature.toFixed(1) : "--"}
            </span>
            <span className="text-lg font-semibold text-[#4f8fff]">°C</span>
          </div>
        </div>

        {/* Humidity */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="icon-glow emerald w-10 h-10">
              <Droplets className="w-5 h-5 text-[#34d399]" />
            </div>
            <span className="text-xs font-semibold text-[#5a6380] uppercase tracking-wider">Humidity</span>
          </div>
          <div className="glass-well py-4 px-4 flex items-baseline justify-center gap-1">
            <span className="text-4xl font-bold text-[#e8ecf5] tabular-nums">
              {latestData ? latestData.humidity.toFixed(1) : "--"}
            </span>
            <span className="text-lg font-semibold text-[#34d399]">%</span>
          </div>
        </div>

        {/* Device */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="icon-glow purple w-10 h-10">
              <Cpu className="w-5 h-5 text-[#a78bfa]" />
            </div>
            <span className="text-xs font-semibold text-[#5a6380] uppercase tracking-wider">Device</span>
          </div>
          <div className="glass-well py-4 px-4 text-center">
            <div className="text-xl font-bold text-[#e8ecf5]">
              {latestData?.device_id || DEVICE_ID}
            </div>
            <div className="text-xs text-[#5a6380] mt-1.5 font-medium">ESP32 Microcontroller</div>
          </div>
        </div>

        {/* Connection */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="icon-glow orange w-10 h-10">
              <Wifi className="w-5 h-5 text-[#fb923c]" />
            </div>
            <span className="text-xs font-semibold text-[#5a6380] uppercase tracking-wider">Connection</span>
          </div>
          <div className="glass-well py-4 px-4 flex flex-col items-center justify-center">
            <span className="inline-flex items-center gap-2 font-bold text-lg">
              <span className={`status-dot ${deviceStatus === "ONLINE" ? "online" : "offline"}`}></span>
              <span className={deviceStatus === "ONLINE" ? "text-emerald-400" : "text-gray-500"}
                style={deviceStatus === "ONLINE" ? { textShadow: "0 0 16px rgba(52,211,153,0.3)" } : {}}>
                {deviceStatus}
              </span>
            </span>
            <span className="text-xs text-[#5a6380] mt-1.5 font-medium">Timeout: {DEVICE_TIMEOUT_SEC}s</span>
          </div>
        </div>
      </div>

      {/* ─── CHARTS ──────────────────────────────────────────────── */}
      {data.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Temperature Chart */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="icon-glow blue w-10 h-10">
                <Thermometer className="w-5 h-5 text-[#4f8fff]" />
              </div>
              <h3 className="text-base font-bold text-[#e8ecf5]">Temperature History</h3>
            </div>
            <div className="glass-well p-3 rounded-2xl" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f8fff" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4f8fff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatXAxis}
                    stroke="transparent"
                    tick={{ fill: "#5a6380", fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={["dataMin - 1", "dataMax + 1"]}
                    stroke="transparent"
                    tick={{ fill: "#5a6380", fontSize: 11, fontWeight: 600 }}
                    tickFormatter={(val: number) => `${val}°`}
                    axisLine={false}
                    tickLine={false}
                    dx={-5}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 22, 45, 0.92)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#e8ecf5",
                      fontSize: "13px",
                      fontWeight: 600,
                      backdropFilter: "blur(16px)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                      padding: "12px 16px",
                    }}
                    labelStyle={{ color: "#8892b0", fontSize: "11px", marginBottom: "6px" }}
                    labelFormatter={(label) => {
                      try {
                        return format(new Date(label as string | number), "PPpp");
                      } catch {
                        return String(label);
                      }
                    }}
                    formatter={(value) => [`${Number(value).toFixed(1)}°C`, "Temperature"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="temperature"
                    stroke="#4f8fff"
                    strokeWidth={2.5}
                    fill="url(#tempGrad)"
                    fillOpacity={1}
                    dot={{ r: 3, fill: "#4f8fff", stroke: "#0f1528", strokeWidth: 2 }}
                    activeDot={{
                      r: 6,
                      fill: "#4f8fff",
                      stroke: "#0f1528",
                      strokeWidth: 3,
                      style: { filter: "drop-shadow(0 0 6px rgba(79,143,255,0.5))" },
                    }}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Humidity Chart */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="icon-glow emerald w-10 h-10">
                <Droplets className="w-5 h-5 text-[#34d399]" />
              </div>
              <h3 className="text-base font-bold text-[#e8ecf5]">Humidity History</h3>
            </div>
            <div className="glass-well p-3 rounded-2xl" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatXAxis}
                    stroke="transparent"
                    tick={{ fill: "#5a6380", fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={["dataMin - 2", "dataMax + 2"]}
                    stroke="transparent"
                    tick={{ fill: "#5a6380", fontSize: 11, fontWeight: 600 }}
                    tickFormatter={(val: number) => `${val}%`}
                    axisLine={false}
                    tickLine={false}
                    dx={-5}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 22, 45, 0.92)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#e8ecf5",
                      fontSize: "13px",
                      fontWeight: 600,
                      backdropFilter: "blur(16px)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                      padding: "12px 16px",
                    }}
                    labelStyle={{ color: "#8892b0", fontSize: "11px", marginBottom: "6px" }}
                    labelFormatter={(label) => {
                      try {
                        return format(new Date(label as string | number), "PPpp");
                      } catch {
                        return String(label);
                      }
                    }}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, "Humidity"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="humidity"
                    stroke="#34d399"
                    strokeWidth={2.5}
                    fill="url(#humGrad)"
                    fillOpacity={1}
                    dot={{ r: 3, fill: "#34d399", stroke: "#0f1528", strokeWidth: 2 }}
                    activeDot={{
                      r: 6,
                      fill: "#34d399",
                      stroke: "#0f1528",
                      strokeWidth: 3,
                      style: { filter: "drop-shadow(0 0 6px rgba(52,211,153,0.5))" },
                    }}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* ─── EMPTY STATE ──────────────────────────────────────── */
        <div className="glass-card p-12 text-center max-w-2xl mx-auto">
          <div className="icon-glow blue w-16 h-16 mx-auto mb-6">
            <Activity className="w-8 h-8 text-[#4f8fff]" />
          </div>
          <h3 className="text-2xl font-bold text-[#e8ecf5] mb-3">
            No Sensor Data Yet
          </h3>
          <p className="text-[#8892b0] text-sm leading-relaxed mb-8 max-w-md mx-auto">
            The dashboard is ready. Once your ESP32 device starts publishing
            data via MQTT, readings will appear here automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold">
            <div className="glass-well py-4 px-4 text-center">
              <span className="block text-[#5a6380] uppercase tracking-wider mb-2">MQTT</span>
              <span className={mqttTextClass()} style={{ textShadow: `0 0 10px ${mqttColor()}40` }}>
                ● {mqttStatus}
              </span>
            </div>
            <div className="glass-well py-4 px-4 text-center">
              <span className="block text-[#5a6380] uppercase tracking-wider mb-2">Device</span>
              <span className="text-[#8892b0]">{DEVICE_ID}</span>
            </div>
            <div className="glass-well py-4 px-4 text-center">
              <span className="block text-[#5a6380] uppercase tracking-wider mb-2">Database</span>
              <span className={supabaseError ? "text-red-400" : "text-emerald-400"}
                style={{ textShadow: supabaseError ? "0 0 10px rgba(248,113,113,0.3)" : "0 0 10px rgba(52,211,153,0.3)" }}>
                ● {supabaseError ? "Error" : "Connected"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

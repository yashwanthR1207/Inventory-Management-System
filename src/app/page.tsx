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
  const [mqttMessage, setMqttMessage] = useState("Checking MQTT status...");
  const [deviceStatus, setDeviceStatus] = useState<"ONLINE" | "OFFLINE">("OFFLINE");
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  const DEVICE_TIMEOUT_SEC = 60;
  const DEVICE_ID = "esp32-01";
  const MQTT_STATUS_POLL_MS = 30_000;

  // ─── MQTT Status ──────────────────────────────────────────────────
  const checkMqttStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/mqtt-status");
      if (!res.ok) { setMqttStatus("UNKNOWN"); setMqttMessage("Failed to reach MQTT status endpoint"); return; }
      const json: MqttStatusResponse = await res.json();
      setMqttStatus(json.status);
      setMqttMessage(json.message);
    } catch {
      setMqttStatus("UNKNOWN");
      setMqttMessage("Could not check MQTT status");
    }
  }, []);

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    checkMqttStatus();
    const i = setInterval(checkMqttStatus, MQTT_STATUS_POLL_MS);
    return () => clearInterval(i);
  }, [checkMqttStatus]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setSupabaseError(null);
      try {
        const { data: sd, error } = await supabase
          .from("sensor_data")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);
        if (error) { setSupabaseError(error.message); setIsLoading(false); return; }
        if (sd && sd.length > 0) {
          setLatestData(sd[0]);
          setLastUpdatedTime(new Date(sd[0].timestamp));
          setData([...sd].reverse());
        }
      } catch {
        setSupabaseError("Could not connect to database");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();

    const channel = supabase
      .channel("public:sensor_data")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sensor_data" }, (payload) => {
        const rec = payload.new as SensorData;
        setLatestData(rec);
        setLastUpdatedTime(new Date(rec.timestamp));
        setData((cur) => {
          const u = [...cur, rec];
          return u.length > 20 ? u.slice(u.length - 20) : u;
        });
        setMqttStatus("CONNECTED");
        setMqttMessage("MQTT pipeline is active");
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!lastUpdatedTime) return;
    const diff = (now.getTime() - lastUpdatedTime.getTime()) / 1000;
    setDeviceStatus(diff < DEVICE_TIMEOUT_SEC ? "ONLINE" : "OFFLINE");
  }, [now, lastUpdatedTime]);

  // ─── Helpers ──────────────────────────────────────────────────────
  const fmtX = (t: string) => { try { return format(new Date(t), "HH:mm"); } catch { return ""; } };

  const mqttCol = () => {
    if (mqttStatus === "CONNECTED") return "text-emerald-600";
    if (mqttStatus === "DISCONNECTED") return "text-red-500";
    if (mqttStatus === "CHECKING") return "text-amber-500";
    return "text-gray-400";
  };

  const MqttIcon = () => {
    if (mqttStatus === "CONNECTED") return <Wifi className="w-4 h-4 text-emerald-600" />;
    if (mqttStatus === "DISCONNECTED") return <WifiOff className="w-4 h-4 text-red-500" />;
    if (mqttStatus === "CHECKING") return <RefreshCw className="w-4 h-4 text-amber-500 spin-smooth" />;
    return <AlertCircle className="w-4 h-4 text-gray-400" />;
  };

  // ═══════════════════════════════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════════════════════════════
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="neu-card p-14 text-center">
          <div className="neu-icon w-16 h-16 mx-auto mb-6 bg-[#e8eef4]">
            <RefreshCw className="w-8 h-8 text-[#4a90d9] spin-smooth" />
          </div>
          <h2 className="text-2xl font-bold text-[#2c3e50] mb-2">Loading Dashboard</h2>
          <p className="text-[#8fa3b8]">Connecting to sensor database...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen p-5 md:p-8 lg:p-12 max-w-[1400px] mx-auto">

      {/* ─── HEADER ────────────────────────────────────────────── */}
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#2c3e50] tracking-tight">
            Inventory Environment
          </h1>
          <p className="text-[#8fa3b8] mt-1 text-sm font-medium">
            Real-time warehouse storage conditions
          </p>
        </div>

        <div className="flex gap-3 text-xs font-bold">
          <button onClick={checkMqttStatus} className="neu-badge px-5 py-3 flex items-center gap-2 cursor-pointer" title={mqttMessage}>
            <MqttIcon />
            <span className="text-[#5a6d80]">MQTT</span>
            <span className={mqttCol()}>● {mqttStatus}</span>
          </button>
          <div className="neu-badge px-5 py-3 flex items-center gap-2">
            <Cpu className={`w-4 h-4 ${deviceStatus === "ONLINE" ? "text-emerald-600" : "text-gray-400"}`} />
            <span className="text-[#5a6d80]">{latestData?.device_id || DEVICE_ID}</span>
            <span className={deviceStatus === "ONLINE" ? "text-emerald-600" : "text-gray-400"}>● {deviceStatus}</span>
          </div>
        </div>
      </header>

      {/* ─── BANNERS ───────────────────────────────────────────── */}
      {supabaseError && (
        <div className="mb-6 neu-banner p-4 flex items-center gap-3" style={{ borderLeft: "4px solid #e74c3c" }}>
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="font-bold text-red-600 text-sm">Database Connection Issue</p>
            <p className="text-xs text-[#8fa3b8] mt-0.5">{supabaseError}</p>
          </div>
        </div>
      )}
      {mqttStatus === "DISCONNECTED" && (
        <div className="mb-6 neu-banner p-4 flex items-center gap-3" style={{ borderLeft: "4px solid #f39c12" }}>
          <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="font-bold text-amber-600 text-sm">MQTT Pipeline Inactive</p>
            <p className="text-xs text-[#8fa3b8] mt-0.5">{mqttMessage}. Showing last known data.</p>
          </div>
        </div>
      )}

      {/* ─── LAST UPDATED ──────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-2 text-xs font-semibold text-[#8fa3b8]">
        <Activity className="w-3.5 h-3.5" />
        <span>Last updated:</span>
        <span className="text-[#5a6d80]">
          {lastUpdatedTime ? formatDistanceToNow(lastUpdatedTime, { addSuffix: true }) : "Waiting for data..."}
        </span>
      </div>

      {/* ─── METRIC CARDS ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

        {/* Temperature */}
        <div className="neu-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="neu-icon w-10 h-10 bg-[#e8eef4]">
              <Thermometer className="w-5 h-5 text-[#4a90d9]" />
            </div>
            <span className="text-xs font-bold text-[#8fa3b8] uppercase tracking-wider">Temperature</span>
          </div>
          <div className="neu-inset py-4 px-4 flex items-baseline justify-center gap-1">
            <span className="text-4xl font-extrabold text-[#2c3e50] tabular-nums">
              {latestData ? latestData.temperature.toFixed(1) : "--"}
            </span>
            <span className="text-lg font-bold text-[#4a90d9]">°C</span>
          </div>
        </div>

        {/* Humidity */}
        <div className="neu-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="neu-icon w-10 h-10 bg-[#e8eef4]">
              <Droplets className="w-5 h-5 text-[#2ecc71]" />
            </div>
            <span className="text-xs font-bold text-[#8fa3b8] uppercase tracking-wider">Humidity</span>
          </div>
          <div className="neu-inset py-4 px-4 flex items-baseline justify-center gap-1">
            <span className="text-4xl font-extrabold text-[#2c3e50] tabular-nums">
              {latestData ? latestData.humidity.toFixed(1) : "--"}
            </span>
            <span className="text-lg font-bold text-[#2ecc71]">%</span>
          </div>
        </div>

        {/* Device */}
        <div className="neu-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="neu-icon w-10 h-10 bg-[#e8eef4]">
              <Cpu className="w-5 h-5 text-[#9b59b6]" />
            </div>
            <span className="text-xs font-bold text-[#8fa3b8] uppercase tracking-wider">Device</span>
          </div>
          <div className="neu-inset py-4 px-4 text-center">
            <div className="text-xl font-extrabold text-[#2c3e50]">{latestData?.device_id || DEVICE_ID}</div>
            <div className="text-xs text-[#8fa3b8] mt-1 font-medium">ESP32 Microcontroller</div>
          </div>
        </div>

        {/* Connection */}
        <div className="neu-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="neu-icon w-10 h-10 bg-[#e8eef4]">
              <Wifi className="w-5 h-5 text-[#e67e22]" />
            </div>
            <span className="text-xs font-bold text-[#8fa3b8] uppercase tracking-wider">Connection</span>
          </div>
          <div className="neu-inset py-4 px-4 flex flex-col items-center">
            <span className="inline-flex items-center gap-2 font-extrabold text-lg">
              <span className={deviceStatus === "ONLINE" ? "dot-online" : "dot-offline"}></span>
              <span className={deviceStatus === "ONLINE" ? "text-emerald-600" : "text-gray-400"}>
                {deviceStatus}
              </span>
            </span>
            <span className="text-xs text-[#8fa3b8] mt-1.5 font-medium">Timeout: {DEVICE_TIMEOUT_SEC}s</span>
          </div>
        </div>
      </div>

      {/* ─── CHARTS ────────────────────────────────────────────── */}
      {data.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Temperature Chart */}
          <div className="neu-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="neu-icon w-9 h-9 bg-[#e8eef4]">
                <Thermometer className="w-4 h-4 text-[#4a90d9]" />
              </div>
              <h3 className="text-base font-extrabold text-[#2c3e50]">Temperature History</h3>
            </div>
            <div className="neu-inset p-3" style={{ height: 280, borderRadius: 20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                  <defs>
                    <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4a90d9" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#4a90d9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#c8d0d8" vertical={false} />
                  <XAxis
                    dataKey="timestamp" tickFormatter={fmtX} stroke="transparent"
                    tick={{ fill: "#8fa3b8", fontSize: 11, fontWeight: 600 }}
                    axisLine={false} tickLine={false} dy={8} interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={["dataMin - 1", "dataMax + 1"]} stroke="transparent"
                    tick={{ fill: "#8fa3b8", fontSize: 11, fontWeight: 600 }}
                    tickFormatter={(v: number) => `${v}°`}
                    axisLine={false} tickLine={false} width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#e8eef4", border: "none", borderRadius: 14, fontWeight: 600, fontSize: 13,
                      boxShadow: "6px 6px 12px #c8d0d8, -6px -6px 12px #ffffff", padding: "12px 16px",
                      color: "#2c3e50",
                    }}
                    labelStyle={{ color: "#8fa3b8", fontSize: 11, marginBottom: 4 }}
                    labelFormatter={(l) => { try { return format(new Date(l as string | number), "PPpp"); } catch { return String(l); } }}
                    formatter={(value) => [`${Number(value).toFixed(1)}°C`, "Temperature"]}
                  />
                  <Area
                    type="monotone" dataKey="temperature" stroke="#4a90d9" strokeWidth={2.5}
                    fill="url(#tGrad)" fillOpacity={1}
                    dot={{ r: 3, fill: "#4a90d9", stroke: "#e8eef4", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#4a90d9", stroke: "#e8eef4", strokeWidth: 3 }}
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Humidity Chart */}
          <div className="neu-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="neu-icon w-9 h-9 bg-[#e8eef4]">
                <Droplets className="w-4 h-4 text-[#2ecc71]" />
              </div>
              <h3 className="text-base font-extrabold text-[#2c3e50]">Humidity History</h3>
            </div>
            <div className="neu-inset p-3" style={{ height: 280, borderRadius: 20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                  <defs>
                    <linearGradient id="hGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2ecc71" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#c8d0d8" vertical={false} />
                  <XAxis
                    dataKey="timestamp" tickFormatter={fmtX} stroke="transparent"
                    tick={{ fill: "#8fa3b8", fontSize: 11, fontWeight: 600 }}
                    axisLine={false} tickLine={false} dy={8} interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={["dataMin - 2", "dataMax + 2"]} stroke="transparent"
                    tick={{ fill: "#8fa3b8", fontSize: 11, fontWeight: 600 }}
                    tickFormatter={(v: number) => `${v}%`}
                    axisLine={false} tickLine={false} width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#e8eef4", border: "none", borderRadius: 14, fontWeight: 600, fontSize: 13,
                      boxShadow: "6px 6px 12px #c8d0d8, -6px -6px 12px #ffffff", padding: "12px 16px",
                      color: "#2c3e50",
                    }}
                    labelStyle={{ color: "#8fa3b8", fontSize: 11, marginBottom: 4 }}
                    labelFormatter={(l) => { try { return format(new Date(l as string | number), "PPpp"); } catch { return String(l); } }}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, "Humidity"]}
                  />
                  <Area
                    type="monotone" dataKey="humidity" stroke="#2ecc71" strokeWidth={2.5}
                    fill="url(#hGrad)" fillOpacity={1}
                    dot={{ r: 3, fill: "#2ecc71", stroke: "#e8eef4", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#2ecc71", stroke: "#e8eef4", strokeWidth: 3 }}
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* ─── EMPTY STATE ──────────────────────────────────────── */
        <div className="neu-card p-12 text-center max-w-2xl mx-auto">
          <div className="neu-icon w-16 h-16 mx-auto mb-6 bg-[#e8eef4]">
            <Activity className="w-8 h-8 text-[#4a90d9]" />
          </div>
          <h3 className="text-2xl font-extrabold text-[#2c3e50] mb-3">No Sensor Data Yet</h3>
          <p className="text-[#8fa3b8] text-sm leading-relaxed mb-8 max-w-md mx-auto">
            The dashboard is ready. Once your ESP32 starts publishing via MQTT, readings will appear here automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-bold">
            <div className="neu-inset py-4 px-4 text-center">
              <span className="block text-[#8fa3b8] uppercase tracking-wider mb-2">MQTT</span>
              <span className={mqttCol()}>● {mqttStatus}</span>
            </div>
            <div className="neu-inset py-4 px-4 text-center">
              <span className="block text-[#8fa3b8] uppercase tracking-wider mb-2">Device</span>
              <span className="text-[#5a6d80]">{DEVICE_ID}</span>
            </div>
            <div className="neu-inset py-4 px-4 text-center">
              <span className="block text-[#8fa3b8] uppercase tracking-wider mb-2">Database</span>
              <span className={supabaseError ? "text-red-500" : "text-emerald-600"}>
                ● {supabaseError ? "Error" : "Connected"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

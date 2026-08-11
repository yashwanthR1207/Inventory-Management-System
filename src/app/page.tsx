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
  LineChart,
  Line,
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

  // Configuration
  const DEVICE_TIMEOUT_SEC = 60;
  const DEVICE_ID = "esp32-01";
  const MQTT_STATUS_POLL_MS = 30_000; // Poll MQTT status every 30 seconds

  // ─── Check MQTT status via API ────────────────────────────────────
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

  // ─── Tick clock for relative timestamps ───────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Poll MQTT status on mount + every 30s ────────────────────────
  useEffect(() => {
    checkMqttStatus();
    const interval = setInterval(checkMqttStatus, MQTT_STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [checkMqttStatus]);

  // ─── Fetch initial data + subscribe to realtime ───────────────────
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
          setData(sensorData.reverse());
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        setSupabaseError("Could not connect to database");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Subscribe to real-time changes
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
          // New data arrived via realtime => MQTT is definitely active
          setMqttStatus("CONNECTED");
          setMqttMessage("MQTT pipeline is active");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Update device status based on last reading age ───────────────
  useEffect(() => {
    if (!lastUpdatedTime) return;

    const diffInSeconds = (now.getTime() - lastUpdatedTime.getTime()) / 1000;
    if (diffInSeconds < DEVICE_TIMEOUT_SEC) {
      setDeviceStatus("ONLINE");
    } else {
      setDeviceStatus("OFFLINE");
    }
  }, [now, lastUpdatedTime]);

  // ─── Helpers ──────────────────────────────────────────────────────
  const formatXAxis = (tickItem: string) => {
    try {
      return format(new Date(tickItem), "HH:mm:ss");
    } catch {
      return "";
    }
  };

  const getMqttStatusColor = () => {
    switch (mqttStatus) {
      case "CONNECTED":
        return "text-emerald-500";
      case "DISCONNECTED":
        return "text-red-500";
      case "CHECKING":
        return "text-amber-500";
      default:
        return "text-gray-400";
    }
  };

  const getMqttIcon = () => {
    if (mqttStatus === "CONNECTED") return <Wifi className="w-5 h-5 text-emerald-500" />;
    if (mqttStatus === "DISCONNECTED") return <WifiOff className="w-5 h-5 text-red-500" />;
    if (mqttStatus === "CHECKING") return <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />;
    return <AlertCircle className="w-5 h-5 text-gray-400" />;
  };

  // ─── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="neumorph-card p-10 inline-block">
            <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-[#2d3748]">
              Loading Dashboard...
            </h2>
            <p className="text-[#718096] mt-2">
              Connecting to sensor database
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto text-[#4a5568]">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#2d3748] drop-shadow-sm tracking-tight">
            Inventory Environment
          </h1>
          <p className="text-[#718096] mt-2 font-medium">
            Real-time tracking of warehouse storage conditions
          </p>
        </div>

        <div className="flex flex-col gap-3 text-sm font-bold">
          {/* MQTT Status Badge */}
          <button
            onClick={checkMqttStatus}
            className="flex items-center gap-3 neumorph-button px-5 py-3 text-[#4a5568] cursor-pointer hover:scale-[1.02] transition-transform"
            title={mqttMessage}
          >
            {getMqttIcon()}
            <span>
              MQTT{" "}
              <span className={getMqttStatusColor()}>
                ● {mqttStatus}
              </span>
            </span>
          </button>

          {/* Device Status Badge */}
          <div className="flex items-center gap-3 neumorph-button px-5 py-3 text-[#4a5568]">
            <Cpu
              className={`w-5 h-5 ${
                deviceStatus === "ONLINE"
                  ? "text-emerald-500"
                  : "text-gray-400"
              }`}
            />
            <span>
              {latestData?.device_id || DEVICE_ID}{" "}
              <span
                className={
                  deviceStatus === "ONLINE"
                    ? "text-emerald-500"
                    : "text-gray-400"
                }
              >
                ● {deviceStatus}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Supabase error banner */}
      {supabaseError && (
        <div className="mb-6 neumorph-card p-4 border-l-4 border-red-400">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="font-bold text-red-600">Database Connection Issue</p>
              <p className="text-sm text-[#718096]">{supabaseError}</p>
            </div>
          </div>
        </div>
      )}

      {/* MQTT Disconnected Banner */}
      {mqttStatus === "DISCONNECTED" && (
        <div className="mb-6 neumorph-card p-4 border-l-4 border-amber-400">
          <div className="flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="font-bold text-amber-600">
                MQTT Pipeline Inactive
              </p>
              <p className="text-sm text-[#718096]">
                {mqttMessage}. The dashboard is showing the last known data.
                Live updates will resume when the MQTT subscriber reconnects.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between pl-2">
        <div className="text-[#718096] text-sm font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Last Updated:{" "}
          {lastUpdatedTime
            ? formatDistanceToNow(lastUpdatedTime, { addSuffix: true })
            : "Waiting for data..."}
        </div>
      </div>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
        {/* Card 1: Temperature */}
        <div className="neumorph-card p-6 flex flex-col relative overflow-hidden group">
          <h2 className="text-[#718096] font-bold text-lg flex items-center gap-2 uppercase tracking-wide">
            <Thermometer className="w-6 h-6 text-blue-500" /> Temperature
          </h2>
          <div className="mt-6 flex items-end gap-2 neumorph-inset p-4 self-start rounded-2xl">
            <span className="text-5xl font-black text-[#2d3748]">
              {latestData ? latestData.temperature.toFixed(1) : "--"}
            </span>
            <span className="text-2xl text-blue-500 font-bold mb-1">°C</span>
          </div>
        </div>

        {/* Card 2: Humidity */}
        <div className="neumorph-card p-6 flex flex-col relative overflow-hidden group">
          <h2 className="text-[#718096] font-bold text-lg flex items-center gap-2 uppercase tracking-wide">
            <Droplets className="w-6 h-6 text-emerald-500" /> Humidity
          </h2>
          <div className="mt-6 flex items-end gap-2 neumorph-inset p-4 self-start rounded-2xl">
            <span className="text-5xl font-black text-[#2d3748]">
              {latestData ? latestData.humidity.toFixed(1) : "--"}
            </span>
            <span className="text-2xl text-emerald-500 font-bold mb-1">%</span>
          </div>
        </div>

        {/* Card 3: Device */}
        <div className="neumorph-card p-6 flex flex-col justify-between">
          <h2 className="text-[#718096] font-bold text-lg flex items-center gap-2 uppercase tracking-wide">
            <Cpu className="w-6 h-6 text-purple-500" /> Device
          </h2>
          <div className="text-2xl font-black text-[#2d3748] mt-4">
            {latestData?.device_id || DEVICE_ID}
          </div>
          <div className="text-sm font-semibold text-[#a0aec0] mt-2">
            ESP32 Microcontroller
          </div>
        </div>

        {/* Card 4: Connection */}
        <div className="neumorph-card p-6 flex flex-col justify-between">
          <h2 className="text-[#718096] font-bold text-lg flex items-center gap-2 uppercase tracking-wide">
            <Wifi className="w-6 h-6 text-orange-500" /> Connection
          </h2>
          <div className="mt-4">
            {deviceStatus === "ONLINE" ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full neumorph-inset font-bold text-emerald-600">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                ONLINE
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full neumorph-inset font-bold text-gray-500">
                <span className="w-3 h-3 rounded-full bg-gray-400"></span>
                OFFLINE
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-[#a0aec0] mt-2">
            Timeout: {DEVICE_TIMEOUT_SEC}s
          </div>
        </div>
      </main>

      {/* Charts Section */}
      {data.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Temperature Chart */}
          <div className="neumorph-card p-6">
            <h3 className="text-xl font-bold text-[#2d3748] mb-6 flex items-center gap-2">
              <Thermometer className="w-6 h-6 text-blue-500" /> Temperature
              History
            </h3>
            <div className="h-72 w-full neumorph-inset p-4 rounded-3xl">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#cbd5e0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatXAxis}
                    stroke="#718096"
                    tick={{ fill: "#718096", fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#718096"
                    tick={{ fill: "#718096", fontWeight: "bold" }}
                    tickFormatter={(val) => `${val}°`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#e0e5ec",
                      borderColor: "#cbd5e0",
                      color: "#2d3748",
                      borderRadius: "12px",
                      fontWeight: "bold",
                      boxShadow:
                        "5px 5px 10px rgb(163, 177, 198, 0.4), -5px -5px 10px rgba(255, 255, 255, 0.3)",
                    }}
                    labelFormatter={(label) => {
                      try {
                        return format(
                          new Date(label as string | number),
                          "PPpp"
                        );
                      } catch {
                        return String(label);
                      }
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    stroke="#3b82f6"
                    strokeWidth={4}
                    dot={{
                      r: 5,
                      fill: "#3b82f6",
                      strokeWidth: 2,
                      stroke: "#e0e5ec",
                    }}
                    activeDot={{
                      r: 8,
                      fill: "#2563eb",
                      strokeWidth: 3,
                      stroke: "#e0e5ec",
                    }}
                    animationDuration={500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Humidity Chart */}
          <div className="neumorph-card p-6">
            <h3 className="text-xl font-bold text-[#2d3748] mb-6 flex items-center gap-2">
              <Droplets className="w-6 h-6 text-emerald-500" /> Humidity History
            </h3>
            <div className="h-72 w-full neumorph-inset p-4 rounded-3xl">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#cbd5e0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatXAxis}
                    stroke="#718096"
                    tick={{ fill: "#718096", fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#718096"
                    tick={{ fill: "#718096", fontWeight: "bold" }}
                    tickFormatter={(val) => `${val}%`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#e0e5ec",
                      borderColor: "#cbd5e0",
                      color: "#2d3748",
                      borderRadius: "12px",
                      fontWeight: "bold",
                      boxShadow:
                        "5px 5px 10px rgb(163, 177, 198, 0.4), -5px -5px 10px rgba(255, 255, 255, 0.3)",
                    }}
                    labelFormatter={(label) => {
                      try {
                        return format(
                          new Date(label as string | number),
                          "PPpp"
                        );
                      } catch {
                        return String(label);
                      }
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="humidity"
                    stroke="#10b981"
                    strokeWidth={4}
                    dot={{
                      r: 5,
                      fill: "#10b981",
                      strokeWidth: 2,
                      stroke: "#e0e5ec",
                    }}
                    activeDot={{
                      r: 8,
                      fill: "#059669",
                      strokeWidth: 3,
                      stroke: "#e0e5ec",
                    }}
                    animationDuration={500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state — no data yet */
        <div className="neumorph-card p-10 text-center">
          <Activity className="w-16 h-16 text-[#a0aec0] mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-[#2d3748] mb-2">
            No Sensor Data Yet
          </h3>
          <p className="text-[#718096] max-w-md mx-auto">
            The dashboard is ready and waiting for sensor readings. Once your
            ESP32 device starts publishing data via MQTT, it will appear here
            automatically.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center text-sm font-semibold text-[#718096]">
            <div className="neumorph-inset px-5 py-3 rounded-xl">
              <span className="block text-xs uppercase tracking-wider text-[#a0aec0] mb-1">
                MQTT Status
              </span>
              <span className={getMqttStatusColor()}>● {mqttStatus}</span>
            </div>
            <div className="neumorph-inset px-5 py-3 rounded-xl">
              <span className="block text-xs uppercase tracking-wider text-[#a0aec0] mb-1">
                Device
              </span>
              <span>{DEVICE_ID}</span>
            </div>
            <div className="neumorph-inset px-5 py-3 rounded-xl">
              <span className="block text-xs uppercase tracking-wider text-[#a0aec0] mb-1">
                Database
              </span>
              <span className={supabaseError ? "text-red-500" : "text-emerald-500"}>
                ● {supabaseError ? "Error" : "Connected"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

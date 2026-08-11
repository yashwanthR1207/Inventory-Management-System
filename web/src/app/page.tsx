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

  // Configuration
  const DEVICE_TIMEOUT_SEC = 60;
  const DEVICE_ID = "esp32-01";
  const MQTT_STATUS_POLL_MS = 30_000;

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

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    checkMqttStatus();
    const interval = setInterval(checkMqttStatus, MQTT_STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [checkMqttStatus]);

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

  useEffect(() => {
    if (!lastUpdatedTime) return;

    const diffInSeconds = (now.getTime() - lastUpdatedTime.getTime()) / 1000;
    if (diffInSeconds < DEVICE_TIMEOUT_SEC) {
      setDeviceStatus("ONLINE");
    } else {
      setDeviceStatus("OFFLINE");
    }
  }, [now, lastUpdatedTime]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#e6eef4]">
        <div className="text-center">
          <div className="neumorph-card p-12 inline-block">
            <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-black text-[#2d3748]">
              Loading Dashboard...
            </h2>
            <p className="text-[#718096] mt-2 font-medium">
              Connecting to sensor database
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-10 lg:p-16 max-w-[1400px] mx-auto text-[#4a5568] bg-[#e6eef4]">
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-[#2d3748] tracking-tight mb-2">
            Inventory Environment
          </h1>
          <p className="text-[#718096] font-medium text-lg">
            Real-time tracking of warehouse storage conditions
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-5 text-sm font-bold w-full md:w-auto">
          {/* MQTT Status Badge */}
          <button
            onClick={checkMqttStatus}
            className="flex flex-1 items-center justify-center gap-3 neumorph-button px-7 py-4 text-[#4a5568] cursor-pointer"
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
          <div className="flex flex-1 items-center justify-center gap-3 neumorph-button px-7 py-4 text-[#4a5568]">
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
        <div className="mb-8 neumorph-inset p-5 border-l-4 border-red-500 bg-red-500/5">
          <div className="flex items-center gap-4">
            <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <p className="font-bold text-red-600 text-lg">Database Connection Issue</p>
              <p className="text-sm text-[#718096] font-medium mt-1">{supabaseError}</p>
            </div>
          </div>
        </div>
      )}

      {/* MQTT Disconnected Banner */}
      {mqttStatus === "DISCONNECTED" && (
        <div className="mb-8 neumorph-inset p-5 border-l-4 border-amber-500 bg-amber-500/5">
          <div className="flex items-center gap-4">
            <WifiOff className="w-6 h-6 text-amber-500 shrink-0" />
            <div>
              <p className="font-bold text-amber-600 text-lg">
                MQTT Pipeline Inactive
              </p>
              <p className="text-sm text-[#718096] font-medium mt-1">
                {mqttMessage}. The dashboard is showing the last known data.
                Live updates will resume when the MQTT subscriber reconnects.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div className="text-[#718096] text-sm font-semibold flex items-center gap-2 bg-[#e6eef4] px-5 py-2.5 rounded-full shadow-[inset_4px_4px_8px_#c5d2e0,inset_-4px_-4px_8px_#ffffff]">
          <Activity className="w-4 h-4 text-blue-500" />
          Last Updated:{" "}
          <span className="text-[#2d3748] ml-1">
            {lastUpdatedTime
              ? formatDistanceToNow(lastUpdatedTime, { addSuffix: true })
              : "Waiting for data..."}
          </span>
        </div>
      </div>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
        {/* Card 1: Temperature */}
        <div className="neumorph-card p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 neumorph-inset rounded-2xl flex items-center justify-center mb-5 text-blue-500">
            <Thermometer className="w-8 h-8" />
          </div>
          <h2 className="text-[#718096] font-bold text-sm tracking-widest uppercase mb-4">
            Temperature
          </h2>
          <div className="flex items-start justify-center gap-1 w-full neumorph-inset py-5 px-2 rounded-2xl">
            <span className="text-5xl font-black text-[#2d3748] tracking-tighter">
              {latestData ? latestData.temperature.toFixed(1) : "--"}
            </span>
            <span className="text-xl text-blue-500 font-bold mt-1">°C</span>
          </div>
        </div>

        {/* Card 2: Humidity */}
        <div className="neumorph-card p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 neumorph-inset rounded-2xl flex items-center justify-center mb-5 text-emerald-500">
            <Droplets className="w-8 h-8" />
          </div>
          <h2 className="text-[#718096] font-bold text-sm tracking-widest uppercase mb-4">
            Humidity
          </h2>
          <div className="flex items-start justify-center gap-1 w-full neumorph-inset py-5 px-2 rounded-2xl">
            <span className="text-5xl font-black text-[#2d3748] tracking-tighter">
              {latestData ? latestData.humidity.toFixed(1) : "--"}
            </span>
            <span className="text-xl text-emerald-500 font-bold mt-1">%</span>
          </div>
        </div>

        {/* Card 3: Device */}
        <div className="neumorph-card p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 neumorph-inset rounded-2xl flex items-center justify-center mb-5 text-purple-500">
            <Cpu className="w-8 h-8" />
          </div>
          <h2 className="text-[#718096] font-bold text-sm tracking-widest uppercase mb-4">
            Device
          </h2>
          <div className="w-full neumorph-inset py-4 px-4 rounded-2xl flex flex-col items-center justify-center min-h-[96px]">
            <div className="text-2xl font-black text-[#2d3748]">
              {latestData?.device_id || DEVICE_ID}
            </div>
            <div className="text-xs font-bold text-[#718096] mt-2">
              ESP32 Microcontroller
            </div>
          </div>
        </div>

        {/* Card 4: Connection */}
        <div className="neumorph-card p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 neumorph-inset rounded-2xl flex items-center justify-center mb-5 text-orange-500">
            <Wifi className="w-8 h-8" />
          </div>
          <h2 className="text-[#718096] font-bold text-sm tracking-widest uppercase mb-4">
            Connection
          </h2>
          <div className="w-full neumorph-inset py-4 px-4 rounded-2xl flex flex-col items-center justify-center min-h-[96px]">
            {deviceStatus === "ONLINE" ? (
              <span className="inline-flex items-center gap-2 font-black text-emerald-600 text-lg">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></span>
                ONLINE
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 font-black text-gray-500 text-lg">
                <span className="w-3 h-3 rounded-full bg-gray-400"></span>
                OFFLINE
              </span>
            )}
            <div className="text-xs font-bold text-[#718096] mt-2">
              Timeout: {DEVICE_TIMEOUT_SEC}s
            </div>
          </div>
        </div>
      </main>

      {/* Charts Section */}
      {data.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Temperature Chart */}
          <div className="neumorph-card p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 neumorph-inset rounded-2xl flex items-center justify-center">
                <Thermometer className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-2xl font-black text-[#2d3748]">
                Temperature History
              </h3>
            </div>
            <div className="h-[350px] w-full neumorph-inset p-5 rounded-3xl">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="6 6"
                    stroke="rgba(113, 128, 150, 0.15)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatXAxis}
                    stroke="#a0aec0"
                    tick={{ fill: "#718096", fontSize: 13, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    dy={15}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#a0aec0"
                    tick={{ fill: "#718096", fontSize: 13, fontWeight: 700 }}
                    tickFormatter={(val) => `${val}°`}
                    axisLine={false}
                    tickLine={false}
                    dx={-15}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#e6eef4",
                      borderColor: "rgba(255, 255, 255, 0.4)",
                      color: "#2d3748",
                      borderRadius: "16px",
                      fontWeight: "bold",
                      boxShadow: "10px 10px 20px #c5d2e0, -10px -10px 20px #ffffff",
                      padding: "16px",
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
                  <Area
                    type="monotone"
                    dataKey="temperature"
                    stroke="#3b82f6"
                    strokeWidth={5}
                    fillOpacity={1}
                    fill="url(#colorTemp)"
                    activeDot={{
                      r: 8,
                      fill: "#3b82f6",
                      strokeWidth: 4,
                      stroke: "#e6eef4",
                    }}
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Humidity Chart */}
          <div className="neumorph-card p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 neumorph-inset rounded-2xl flex items-center justify-center">
                <Droplets className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-black text-[#2d3748]">
                Humidity History
              </h3>
            </div>
            <div className="h-[350px] w-full neumorph-inset p-5 rounded-3xl">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="6 6"
                    stroke="rgba(113, 128, 150, 0.15)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatXAxis}
                    stroke="#a0aec0"
                    tick={{ fill: "#718096", fontSize: 13, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    dy={15}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#a0aec0"
                    tick={{ fill: "#718096", fontSize: 13, fontWeight: 700 }}
                    tickFormatter={(val) => `${val}%`}
                    axisLine={false}
                    tickLine={false}
                    dx={-15}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#e6eef4",
                      borderColor: "rgba(255, 255, 255, 0.4)",
                      color: "#2d3748",
                      borderRadius: "16px",
                      fontWeight: "bold",
                      boxShadow: "10px 10px 20px #c5d2e0, -10px -10px 20px #ffffff",
                      padding: "16px",
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
                  <Area
                    type="monotone"
                    dataKey="humidity"
                    stroke="#10b981"
                    strokeWidth={5}
                    fillOpacity={1}
                    fill="url(#colorHum)"
                    activeDot={{
                      r: 8,
                      fill: "#10b981",
                      strokeWidth: 4,
                      stroke: "#e6eef4",
                    }}
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="neumorph-card p-12 text-center max-w-3xl mx-auto mt-12">
          <div className="w-24 h-24 neumorph-inset rounded-[2rem] flex items-center justify-center mx-auto mb-8">
            <Activity className="w-12 h-12 text-blue-400" />
          </div>
          <h3 className="text-3xl font-black text-[#2d3748] mb-4 tracking-tight">
            No Sensor Data Yet
          </h3>
          <p className="text-[#718096] text-lg font-medium leading-relaxed mb-10 max-w-xl mx-auto">
            The dashboard is ready and waiting for sensor readings. Once your
            ESP32 device starts publishing data via MQTT, it will appear here
            automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center text-sm font-bold text-[#718096]">
            <div className="neumorph-inset px-8 py-5 rounded-3xl flex-1">
              <span className="block text-xs uppercase tracking-widest text-[#a0aec0] mb-3">
                MQTT Status
              </span>
              <span className={`text-lg font-black ${getMqttStatusColor()}`}>● {mqttStatus}</span>
            </div>
            <div className="neumorph-inset px-8 py-5 rounded-3xl flex-1">
              <span className="block text-xs uppercase tracking-widest text-[#a0aec0] mb-3">
                Device
              </span>
              <span className="text-lg font-black text-[#4a5568]">{DEVICE_ID}</span>
            </div>
            <div className="neumorph-inset px-8 py-5 rounded-3xl flex-1">
              <span className="block text-xs uppercase tracking-widest text-[#a0aec0] mb-3">
                Database
              </span>
              <span className={`text-lg font-black ${supabaseError ? "text-red-500" : "text-emerald-500"}`}>
                ● {supabaseError ? "Error" : "Connected"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

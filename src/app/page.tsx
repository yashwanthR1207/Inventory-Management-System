'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { DashboardHeader } from '@/components/DashboardHeader';
import { HeroOverview } from '@/components/HeroOverview';
import { EnvironmentStatusCard } from '@/components/EnvironmentStatusCard';
import { TemperatureChart } from '@/components/TemperatureChart';
import { HumidityChart } from '@/components/HumidityChart';
import { LiveSensorCard } from '@/components/LiveSensorCard';
import { StorageZoneSection } from '@/components/StorageZoneSection';
import { AlertsPanel } from '@/components/AlertsPanel';
import { HealthScoreCard } from '@/components/HealthScoreCard';
import { SensorReadingsTable } from '@/components/SensorReadingsTable';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';

import { SensorReading, TimeRange, AlertItem, EnvironmentStatus } from '@/types/sensor';
import { fetchSensorReadings, getStatusForReading } from '@/lib/supabase';
import { mqttManager } from '@/lib/mqtt';
import { calculateHealthScore } from '@/lib/healthScore';
import { ShieldCheck, Server, Cpu, ExternalLink } from 'lucide-react';

export default function EnviroStockDashboard() {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [currentReading, setCurrentReading] = useState<SensorReading | null>(null);
  const [mqttStatus, setMqttStatus] = useState<'Connected' | 'Connecting' | 'Disconnected' | 'Error'>('Connecting');
  const [timeRange, setTimeRange] = useState<TimeRange>('24H');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Active alerts list derived from incoming telemetry
  const [alerts, setAlerts] = useState<AlertItem[]>([
    {
      id: 'alt-1',
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      severity: 'info',
      title: 'HiveMQ MQTT Socket Connected',
      message: 'Secure WebSocket TLS session established with HiveMQ Cloud broker.',
      value: 'wss://',
      isResolved: true,
    },
  ]);

  // Initial database load
  const loadData = useCallback(async (range: TimeRange) => {
    setIsRefreshing(true);
    const data = await fetchSensorReadings(range);
    setReadings(data);
    if (data.length > 0) {
      const latest = data[data.length - 1];
      setCurrentReading(latest);
      setLastUpdated(new Date(latest.timestamp));
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadData(timeRange);
  }, [timeRange, loadData]);

  // Connect to MQTT live stream
  useEffect(() => {
    mqttManager.connect();

    const unsubscribeStatus = mqttManager.subscribeStatus((status) => {
      setMqttStatus(status);
    });

    const unsubscribeReadings = mqttManager.subscribeReadings((reading) => {
      setCurrentReading(reading);
      setLastUpdated(new Date());

      // Append live packet to history array
      setReadings((prev) => {
        const updated = [...prev, reading];
        // Keep up to 250 data points for active charts
        if (updated.length > 250) {
          return updated.slice(updated.length - 250);
        }
        return updated;
      });

      // Dynamic anomaly detection alert triggers
      if (reading.temperature > 28.0) {
        const newAlert: AlertItem = {
          id: `alert-temp-${Date.now()}`,
          timestamp: reading.timestamp,
          severity: 'critical',
          title: 'High Temperature Threshold Warning',
          message: `Sensor ${reading.device_id} reported elevated reading exceeding safety baseline.`,
          value: `${reading.temperature.toFixed(1)}°C`,
          isResolved: false,
        };
        setAlerts((prevAlerts) => [newAlert, ...prevAlerts.slice(0, 9)]);
      } else if (reading.humidity > 68.0) {
        const newAlert: AlertItem = {
          id: `alert-hum-${Date.now()}`,
          timestamp: reading.timestamp,
          severity: 'warning',
          title: 'Elevated Relative Humidity Warning',
          message: `Sensor ${reading.device_id} detected rising moisture levels in main storage bay.`,
          value: `${reading.humidity.toFixed(1)}% RH`,
          isResolved: false,
        };
        setAlerts((prevAlerts) => [newAlert, ...prevAlerts.slice(0, 9)]);
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeReadings();
      mqttManager.disconnect();
    };
  }, []);

  // Update second counter ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      setSecondsAgo(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Fallback defaults if no reading has arrived yet
  const activeTemp = currentReading ? currentReading.temperature : 22.5;
  const activeHumidity = currentReading ? currentReading.humidity : 52.0;
  const activeStatus: EnvironmentStatus = currentReading
    ? currentReading.status
    : getStatusForReading(activeTemp, activeHumidity);
  const healthResult = calculateHealthScore(activeTemp, activeHumidity);

  return (
    <div className="min-h-screen bg-industrial-grid pb-12 font-sans selection:bg-blue-500 selection:text-white">
      {/* 1. TOP NAVIGATION */}
      <DashboardHeader
        mqttStatus={mqttStatus}
        lastUpdatedSecondsAgo={secondsAgo}
        tempUnit={tempUnit}
        onToggleTempUnit={() => setTempUnit((u) => (u === 'C' ? 'F' : 'C'))}
        onRefreshData={() => loadData(timeRange)}
        isRefreshing={isRefreshing}
      />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 space-y-6">
        
        {/* 2. HERO / OVERVIEW SECTION */}
        <HeroOverview
          currentTemp={activeTemp}
          currentHumidity={activeHumidity}
          status={activeStatus}
          deviceName={currentReading?.device_id || 'ESP32-01'}
          isOnline={mqttStatus === 'Connected'}
          tempUnit={tempUnit}
        />

        {/* 3. ENVIRONMENT STATUS CARD */}
        <EnvironmentStatusCard
          status={activeStatus}
          temperature={activeTemp}
          humidity={activeHumidity}
          recommendation={healthResult.recommendation}
        />

        {/* 4. TEMPERATURE & HUMIDITY ANALYTICS CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TemperatureChart
            readings={readings}
            timeRange={timeRange}
            onTimeRangeChange={(r) => setTimeRange(r)}
            tempUnit={tempUnit}
            isLoading={isRefreshing}
          />
          <HumidityChart
            readings={readings}
            timeRange={timeRange}
            onTimeRangeChange={(r) => setTimeRange(r)}
            isLoading={isRefreshing}
          />
        </div>

        {/* 5, 7, 8. SENSOR CARD, HEALTH SCORE, ALERTS PANEL GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 5. LIVE SENSOR CARD */}
          <LiveSensorCard
            deviceName={currentReading?.device_id || 'ESP32-01'}
            isOnline={mqttStatus === 'Connected'}
            mqttStatus={mqttStatus}
            lastReading={currentReading}
          />

          {/* 8. ENVIRONMENTAL HEALTH SCORE */}
          <HealthScoreCard
            temperature={activeTemp}
            humidity={activeHumidity}
          />

          {/* 7. ALERTS & ANOMALIES */}
          <AlertsPanel alerts={alerts} />

        </div>

        {/* 6. STORAGE ZONES SECTION */}
        <StorageZoneSection
          currentTemp={activeTemp}
          currentHumidity={activeHumidity}
        />

        {/* 9. RECENT SENSOR READINGS TABLE */}
        <SensorReadingsTable
          readings={[...readings].reverse()}
          tempUnit={tempUnit}
        />

        {/* FOOTER */}
        <footer className="pt-8 border-t border-gray-800/80 text-center md:flex md:items-center md:justify-between text-xs font-mono text-gray-500">
          <div className="flex items-center justify-center md:justify-start gap-2 mb-2 md:mb-0">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-gray-300">EnviroStock Intelligence</span>
            <span>— Commercial Warehouse IoT Monitoring</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-gray-400">
            <span>ESP32</span>
            <span>•</span>
            <span>DHT11</span>
            <span>•</span>
            <span>HiveMQ Cloud</span>
            <span>•</span>
            <span>Supabase</span>
            <span>•</span>
            <span>Next.js</span>
          </div>
        </footer>

      </main>
    </div>
  );
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API Route: GET /api/mqtt-status
 * 
 * Checks whether the MQTT pipeline is active by looking at the most recent
 * sensor_data row in Supabase. If a reading arrived within the last 2 minutes,
 * we consider MQTT "CONNECTED". Otherwise "DISCONNECTED".
 * 
 * This works even without a direct MQTT connection from the web app because
 * the MQTT subscriber (mqtt/subscriber.js) writes to Supabase, and we simply
 * check the freshness of that data.
 */

const MQTT_ACTIVE_THRESHOLD_SEC = 120; // 2 minutes

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          status: "UNKNOWN",
          message: "Supabase not configured",
          lastReading: null,
          secondsAgo: null,
        },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("sensor_data")
      .select("timestamp")
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({
        status: "DISCONNECTED",
        message: "No sensor data found in database",
        lastReading: null,
        secondsAgo: null,
      });
    }

    const lastTimestamp = new Date(data.timestamp);
    const secondsAgo = Math.floor(
      (Date.now() - lastTimestamp.getTime()) / 1000
    );

    const status: "CONNECTED" | "DISCONNECTED" =
      secondsAgo < MQTT_ACTIVE_THRESHOLD_SEC ? "CONNECTED" : "DISCONNECTED";

    return NextResponse.json({
      status,
      message:
        status === "CONNECTED"
          ? "MQTT pipeline is active"
          : `Last data received ${secondsAgo}s ago (threshold: ${MQTT_ACTIVE_THRESHOLD_SEC}s)`,
      lastReading: lastTimestamp.toISOString(),
      secondsAgo,
    });
  } catch (err) {
    console.error("MQTT status check failed:", err);
    return NextResponse.json(
      {
        status: "UNKNOWN",
        message: "Failed to check MQTT status",
        lastReading: null,
        secondsAgo: null,
      },
      { status: 200 }
    );
  }
}

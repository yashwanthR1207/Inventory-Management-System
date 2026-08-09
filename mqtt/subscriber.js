import mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Configuration
const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_PORT = process.env.MQTT_PORT || 8883;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'inventory/environment/+/data';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_MODE = process.env.TEST_MODE === 'true';

if (!MQTT_HOST || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing critical environment variables. Check .env file.");
  process.exit(1);
}

// Initialize Supabase (with Service Role key to bypass RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function connectMQTT() {
  const protocol = MQTT_PORT == 8883 ? 'mqtts' : 'mqtt';
  const connectUrl = `${protocol}://${MQTT_HOST}:${MQTT_PORT}`;
  
  console.log(`Connecting to HiveMQ at ${connectUrl}...`);
  
  const client = mqtt.connect(connectUrl, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId: `mqtt-subscriber-${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  });

  return client;
}

function validateSensorPayload(payload) {
  if (!payload.device_id || typeof payload.device_id !== 'string') return false;
  if (typeof payload.temperature !== 'number' || isNaN(payload.temperature)) return false;
  if (typeof payload.humidity !== 'number' || isNaN(payload.humidity)) return false;
  return true;
}

async function publishToDatabase(data) {
  try {
    const { device_id, temperature, humidity, timestamp } = data;
    
    // Use the timestamp provided in the payload, or the current time if missing/invalid
    const readingTimestamp = timestamp ? new Date(timestamp) : new Date();

    const { error } = await supabase
      .from('sensor_data')
      .insert([
        {
          device_id,
          temperature,
          humidity,
          timestamp: readingTimestamp.toISOString()
        }
      ]);

    if (error) {
      console.error("Supabase insertion error:", error.message);
    } else {
      console.log(`Supabase insert successful: [${device_id}] Temp: ${temperature}°C, Hum: ${humidity}%`);
    }
  } catch (err) {
    console.error("publishToDatabase exception:", err);
  }
}

function handleMQTTMessage(topic, message) {
  try {
    const payloadStr = message.toString();
    const payload = JSON.parse(payloadStr);

    console.log(`Message received on ${topic}`);

    if (validateSensorPayload(payload)) {
      console.log("Payload validated");
      publishToDatabase(payload);
    } else {
      console.error("Invalid MQTT JSON or missing required fields", payloadStr);
    }
  } catch (e) {
    console.error("Invalid MQTT JSON format:", message.toString());
  }
}

function startSubscriber() {
  const client = connectMQTT();

  client.on('connect', () => {
    console.log('MQTT connected');
    subscribeToTopic(client, MQTT_TOPIC);
  });

  client.on('message', (topic, message) => {
    handleMQTTMessage(topic, message);
  });

  client.on('error', (err) => {
    console.error('MQTT error:', err);
  });

  client.on('offline', () => {
    console.warn('MQTT offline (disconnected)');
  });
}

function subscribeToTopic(client, topic) {
  client.subscribe(topic, (err) => {
    if (!err) {
      console.log(`Subscribed to topic: ${topic}`);
    } else {
      console.error(`Failed to subscribe to ${topic}`, err);
    }
  });
}

// Start
startSubscriber();

// Test Mode: Simulate ESP32 sending data every 5 seconds
if (TEST_MODE) {
  console.log("Test mode enabled. Simulating sensor readings...");
  setInterval(() => {
    const fakeData = {
      device_id: "esp32-test",
      temperature: 20 + Math.random() * 10, // 20-30 °C
      humidity: 40 + Math.random() * 20, // 40-60 %
      timestamp: new Date().toISOString()
    };
    handleMQTTMessage('inventory/environment/esp32-test/data', Buffer.from(JSON.stringify(fakeData)));
  }, 5000);
}

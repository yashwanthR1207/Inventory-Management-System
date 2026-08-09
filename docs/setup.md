# Step-by-Step Setup Guide

Follow these steps precisely to set up your Environmental Monitoring Module.

## STEP 1: Connect DHT11
Connect the DHT11 sensor to the ESP32:
- DHT11 VCC → ESP32 3.3V
- DHT11 GND → ESP32 GND
- DHT11 DATA → ESP32 GPIO4

## STEP 2: Install Arduino IDE
Download and install the [Arduino IDE](https://www.arduino.cc/en/software).

## STEP 3: Install ESP32 board package
In Arduino IDE, go to `Preferences`, add `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json` to the "Additional Boards Manager URLs", then go to `Tools -> Board -> Boards Manager` and install "esp32 by Espressif Systems".

## STEP 4: Install DHT library
Go to `Sketch -> Include Library -> Manage Libraries`. Search for "DHT sensor library" by Adafruit and install it (and its dependencies, like Adafruit Unified Sensor).

## STEP 5: Install PubSubClient
In the Library Manager, search for and install `PubSubClient` by Nick O'Leary. Also search for `ArduinoJson` by Benoit Blanchon and install it.

## STEP 6: Create HiveMQ Cloud cluster
Go to [HiveMQ Cloud](https://console.hivemq.cloud/), sign up, and create a free serverless cluster.

## STEP 7: Create MQTT credentials
In the HiveMQ Console, navigate to "Access Management" and add a new user. Write down the username, password, and your cluster URL (e.g., `your-cluster.s1.eu.hivemq.cloud`).

## STEP 8: Configure ESP32
Open `esp32/dht11-mqtt/dht11-mqtt.ino` in Arduino IDE. Replace `YOUR_WIFI_SSID`, `YOUR_WIFI_PASSWORD`, `YOUR_HIVEMQ_CLUSTER_URL`, `YOUR_MQTT_USERNAME`, and `YOUR_MQTT_PASSWORD` with your actual details.

## STEP 9: Upload firmware
Select your ESP32 board and COM port in the Arduino IDE. Click "Upload". Open the Serial Monitor (baud rate 115200) to verify it connects to WiFi and MQTT.

## STEP 10: Create Supabase project
Go to [Supabase](https://supabase.com/) and create a new project.

## STEP 11: Create sensor_data table
Go to the Supabase SQL Editor and copy-paste the contents of `supabase/schema.sql`. Click "Run" to create the tables and policies.

## STEP 12: Configure MQTT subscriber
Navigate to the `mqtt/` folder in your project. This is a Node.js service that subscribes to HiveMQ and inserts data into Supabase.

## STEP 13: Configure environment variables
Create a `.env` file in the project root by copying `.env.example`. Fill in:
- MQTT variables (from HiveMQ)
- Supabase URL and Keys (from Supabase Project Settings > API)

## STEP 14: Run application locally
Run the MQTT subscriber:
```bash
cd mqtt
npm install
npm start
```
Run the web dashboard:
```bash
cd web
npm install
npm run dev
```

## STEP 15: Verify MQTT messages
Ensure the ESP32 is powered on. You should see "Message received on..." in the `mqtt/` terminal logs.

## STEP 16: Verify Supabase rows
Go to Supabase > Table Editor > `sensor_data`. You should see new rows being added every 5 seconds.

## STEP 17: Verify dashboard
Open `http://localhost:3000`. You should see live temperature, humidity, connection status, and charts updating automatically.

## STEP 18: Deploy frontend to Vercel
Push your code to GitHub. Go to [Vercel](https://vercel.com/), click "Add New Project", and import your repository. Set the "Root Directory" to `web`. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Environment Variables section, and click "Deploy".

*(Note: The `mqtt/` subscriber folder must be deployed to a persistent server like Render or Railway, as Vercel Serverless Functions cannot host permanent MQTT subscribers).*

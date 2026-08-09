#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h> // Need to parse and generate JSON

// --- Configuration ---
// WiFi
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// HiveMQ Cloud
const char* mqtt_server = "YOUR_HIVEMQ_CLUSTER_URL";
const int mqtt_port = 8883;
const char* mqtt_user = "YOUR_MQTT_USERNAME";
const char* mqtt_password = "YOUR_MQTT_PASSWORD";
const char* mqtt_topic = "inventory/environment/esp32-01/data";
const char* device_id = "esp32-01";

// DHT Sensor
#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// WiFi & MQTT Clients
WiFiClientSecure espClient;
PubSubClient client(espClient);

// Timing
unsigned long lastMsg = 0;
const long interval = 5000;

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to WiFi...");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  // Loop until we're reconnected
  while (!client.connected()) {
    Serial.print("Connecting to HiveMQ...");
    
    // Create a random client ID
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);
    
    // Attempt to connect
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      // Wait 5 seconds before retrying
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  // Set WiFiClientSecure to ignore SSL certificate validation for simplicity.
  // In a production environment, you should use the server's root CA certificate.
  espClient.setInsecure(); 
  
  dht.begin();
  setup_wifi();
  
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > interval) {
    lastMsg = now;

    // Read temperature and humidity
    float h = dht.readHumidity();
    float t = dht.readTemperature(); // Celsius

    // Check if any reads failed and exit early (to try again).
    if (isnan(h) || isnan(t)) {
      Serial.println("DHT11 read failure");
      return;
    }

    Serial.print("Temperature: ");
    Serial.print(t);
    Serial.println(" °C");
    Serial.print("Humidity: ");
    Serial.print(h);
    Serial.println(" %");

    // Create JSON payload
    StaticJsonDocument<200> doc;
    doc["device_id"] = device_id;
    doc["temperature"] = t;
    doc["humidity"] = h;
    // ESP32 usually doesn't have an RTC with internet time out-of-the-box unless configured.
    // We will let the MQTT subscriber or Supabase assign the exact timestamp if one is missing, 
    // but the payload format requests a timestamp. We will leave it empty here or just rely 
    // on the backend subscriber to populate missing 'timestamp' with current time.
    // For completeness, we add a placeholder.
    // doc["timestamp"] = "2026-08-08T10:30:00Z"; 

    char jsonBuffer[512];
    serializeJson(doc, jsonBuffer);
    
    Serial.println("Publishing:");
    Serial.println(mqtt_topic);
    
    // Publish
    client.publish(mqtt_topic, jsonBuffer);
  }
}

#define ENABLE_USER_AUTH
#define ENABLE_DATABASE
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <FirebaseClient.h>
#include <WiFiClientSecure.h>

#include "settings.h"
#include "sensors.h"

// FIREBASE OBJECTS
WiFiClientSecure ssl_client;
AsyncClientClass aClient(ssl_client);
FirebaseApp app;
RealtimeDatabase Database;

// Global Variables
Preferences preferences;
AsyncWebServer server(80);
String currentSSID = "TUNISIETELECOM-2.4G-6aZF";
String currentWiFiPassword = "RXW7XezR";
String currentAPSSID = "ESP32_001";
String currentAPPassword = "men0lel1";
String wifiOptionsHTML = "";
String currentFbUrl = "";
String currentFbApiKey = "";
String currentFbEmail = "";
String currentFbPassword = "";
String currentRoomId = "room_001";
String currentPatientId = "patient_001";
bool shouldReboot = false;
unsigned long rebootTime = 0;

const unsigned long SCAN_INTERVAL_MS = 10000;
unsigned long lastScanTime = 0 - SCAN_INTERVAL_MS;

const unsigned long DEBUG_INTERVAL_MS = 2000;
unsigned long lastDebugPrint = 0;

// Firebase Push Timer
const unsigned long FIREBASE_INTERVAL_MS = 1000;
unsigned long lastFirebasePush = 0;

void setup() {
  Serial.begin(115200);

  // Initialize LittleFS
  if (!LittleFS.begin(true)) {
    Serial.println("An Error has occurred while mounting LittleFS");
    return;
  }
  Serial.println("LittleFS mounted successfully");

  File root = LittleFS.open("/");
  File file = root.openNextFile();
  Serial.println("--- Files currently in LittleFS ---");
  bool hasFiles = false;
  while (file) {
    Serial.print("FILE: /");
    Serial.println(file.name());
    hasFiles = true;
    file = root.openNextFile();
  }
  if (!hasFiles) {
    Serial.println("NO FILES FOUND! The data folder is empty or didn't upload.");
  }
  Serial.println("-----------------------------------");
  // Load preferences
  preferences.begin("settings", true);
  currentSSID = preferences.getString("ssid", "");
  currentWiFiPassword = preferences.getString("wifi_password", "");
  currentAPSSID = preferences.getString("apssid", "ESP32_001");
  currentAPPassword = preferences.getString("ap_password", "men0lel1");
  currentFbUrl = preferences.getString("fb_url", "");
  currentFbApiKey = preferences.getString("fb_api_key", "");
  currentFbEmail = preferences.getString("fb_email", "");
  currentFbPassword = preferences.getString("fb_password", "");
  currentRoomId = preferences.getString("room_id", "room_001");
  currentPatientId = preferences.getString("patient_id", "patient_001");
  preferences.end();

  // Initialize Hardware Sensors
  initSensors();

  WiFi.mode(WIFI_AP_STA);

  // Connect to Wi-Fi
  WiFi.begin(currentSSID.c_str(), currentWiFiPassword.c_str());
  int attempts = 0;
  Serial.println("\nTrying to connect to Wifi...");
  Serial.print("SSID: ");
  Serial.println(currentSSID);
  Serial.print("Password: ");
  Serial.println(currentWiFiPassword);
  while (WiFi.status() != WL_CONNECTED && attempts < WIFI_ATTEMPTS) {
    delay(WIFI_DELAY_MS);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to WiFi");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFailed to connect to WiFi");
    WiFi.disconnect();
  }

  if (WiFi.status() == WL_CONNECTED && currentFbApiKey.length() > 0) {
    Serial.println("Initializing Firebase...");

    ssl_client.setInsecure();

    Serial.println("Initializing Firebase...");
    UserAuth user_auth(currentFbApiKey, currentFbEmail, currentFbPassword);
    initializeApp(aClient, app, getAuth(user_auth));

    app.getApp<RealtimeDatabase>(Database);
    Database.url(currentFbUrl); 

    Serial.println("Firebase App Initialized.");
  }

  // Configure Access Point
  WiFi.softAP(currentAPSSID.c_str(), currentAPPassword.c_str());
  Serial.print("AP IP Address: ");
  Serial.println(WiFi.softAPIP());

  // Set up routes and start the server
  setupSettingsRoutes();
  server.begin();
  Serial.println("HTTP server started");

  // Access point credentials
  Serial.println();
  Serial.print("Access point: ");
  Serial.println(currentAPSSID);
  Serial.print("AP Password: ");
  Serial.println(currentAPPassword);
}

void loop() {
  if (shouldReboot) {
    if (millis() - rebootTime > 2000) {
      ESP.restart();
    }
    return;
  }

  // Keep Firebase running
  app.loop();

  updateSensors();

  if (millis() - lastDebugPrint > DEBUG_INTERVAL_MS) {
    lastDebugPrint = millis();
    Serial.print("[DEBUG] Temp: "); Serial.print(currentTemp);
    Serial.print(" °C | Hum: "); Serial.print(currentHumidity);
    Serial.print(" % | BPM: "); Serial.print(currentBPM);
    Serial.print(" | SpO2: "); Serial.print(currentSpO2);
    Serial.println(" %");
  }

  unsigned long currentTime = millis();
  if (lastScanTime == 0 || currentTime - lastScanTime >= SCAN_INTERVAL_MS) {
    lastScanTime = (currentTime == 0) ? 1 : currentTime; 
    WiFi.scanNetworks(true);  
  }

  int n = WiFi.scanComplete();
  if (n >= 0) { 
    String options = "";
    if (n == 0) {
      options = "<option value='Null'>No Networks Found</option>";
    } else {
      for (int i = 0; i < n; i++) {
        options += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + "dB)</option>";
      }
    }
    wifiOptionsHTML = options;
    WiFi.scanDelete();  
  } else if (n == -2) { 
    lastScanTime = 0; 
  }

  // Push data to Firebase periodically
  if (app.ready() && (millis() - lastFirebasePush > FIREBASE_INTERVAL_MS)) {
    lastFirebasePush = millis();

    // --- Push Room Data (Temperature & Humidity) ---
    String roomPath = "/rooms/" + currentRoomId;
    String roomJson = "{\"temperature\":" + String(currentTemp) + 
      ",\"humidity\":" + String(currentHumidity) + "}";
    Database.set<String>(aClient, roomPath, roomJson);

    // --- Push Patient Data (Heart Rate & SpO2) ---
    // Only push if the finger is actually present and calculating
    if (currentBPM > 0 || currentSpO2 > 0) {
      String patientPath = "/patients/" + currentPatientId;
      String patientJson = "{\"heartRate\":" + String(currentBPM) + 
        ",\"spO2\":" + String(currentSpO2) + "}";
      Database.set<String>(aClient, patientPath, patientJson);
    }

    Serial.println("Pushed updated Room and Patient data to Firebase.");
  }

  delay(10);
}

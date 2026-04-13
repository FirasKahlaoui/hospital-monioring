#define ENABLE_USER_AUTH
#define ENABLE_DATABASE
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <FirebaseClient.h>
#include <FirebaseJson.h>
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

const unsigned long WIFI_CHECK_INTERVAL = 10000;
unsigned long lastWiFiCheckTime = 0;

const unsigned long SCAN_INTERVAL_MS = 10000;
unsigned long lastScanTime = 0 - SCAN_INTERVAL_MS;

const unsigned long DEBUG_INTERVAL_MS = 5000;
unsigned long lastDebugPrint = 0;

// Firebase Push Timer
const unsigned long FIREBASE_INTERVAL_MS = 1000;
unsigned long lastFirebasePush = 0;

TaskHandle_t FirebaseTask;

void firebaseUploadTask(void * pvParameters) {
  unsigned long lastTaskPush = 0;
  unsigned long lastWiFiReconnect = 0;

  AsyncResult roomResult;
  AsyncResult patientResult;

  String roomPath = "/rooms/" + currentRoomId;
  String patientPath = "/patients/" + currentPatientId;

  float lastSentTemp = -999.0;
  float lastSentHum = -999.0;

  float lastSentBPM = -999.0;  
  float lastSentSpO2 = -999.0;

  for(;;) {
    app.loop();

    // Delivery Status Checkers
    if (roomResult.isError()) {
      Serial.print(">> [SAVE FAILED] Room: ");
      Serial.println(roomResult.error().message());
      roomResult.clear();
    }
    if (patientResult.isError()) {
      Serial.print(">> [SAVE FAILED] Patient: ");
      Serial.println(patientResult.error().message());
      patientResult.clear(); 
    }

    //  WI-FI CONNECTED 
    if (WiFi.status() == WL_CONNECTED) {
      if (app.ready()) {
        if (millis() - lastTaskPush >= FIREBASE_INTERVAL_MS) {
          lastTaskPush = millis();

          // Queue Room Data
          if (abs(currentTemp - lastSentTemp) > 0.3 || abs(currentHumidity - lastSentHum) > 0.5) {
            String roomJson = "{\"temperature\":" + String(currentTemp) + 
              ",\"humidity\":" + String(currentHumidity) + 
              ",\"timestamp\":{\".sv\":\"timestamp\"}}";
            Serial.println(">> Q-Room... ");
            Database.push<object_t>(aClient, roomPath, object_t(roomJson), roomResult);
            lastSentTemp = currentTemp;
            lastSentHum = currentHumidity;
          }

          // Queue Patient Data
          if (currentBPM != lastSentBPM || abs(currentSpO2 - lastSentSpO2) > 2) {

            String patientJson = "{\"heartRate\":" + String(currentBPM) + 
              ",\"spO2\":" + String(currentSpO2) + 
              ",\"timestamp\":{\".sv\":\"timestamp\"}}";
            Serial.println(">> Q-Patient...");
            Database.push<object_t>(aClient, patientPath, object_t(patientJson), patientResult);

            lastSentBPM = currentBPM;
            lastSentSpO2 = currentSpO2;
          }
        }
      } else {
        if (millis() - lastTaskPush >= 5000) {
          lastTaskPush = millis();
          Serial.println(">> [FIREBASE] App not ready (Authenticating/Renewing Token)...");
        }
      }

    } 
    //  WI-FI DISCONNECTED 
    else {
      // Reconnection Logic
      if (WiFi.SSID() != "") { 
        if (millis() - lastWiFiReconnect >= 10000) { 
          lastWiFiReconnect = millis();
          Serial.println(">> [NETWORK] Wi-Fi lost. Attempting to reconnect...");
          WiFi.disconnect(); 
          WiFi.reconnect();  
        }
      }

      // Background Wi-Fi Scanning Logic
      int n = WiFi.scanComplete();

      if (n >= 0) { 
        // Scan finished! Process the results.
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
        // -2 means no scan has been triggered yet.
        lastScanTime = 0; 
      }
    }

    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

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

  //  Display Loaded Configurations 
  Serial.println("\n==================================");
  Serial.println("     CURRENT CONFIGURATIONS       ");
  Serial.println("==================================");
  Serial.println("WiFi SSID:      " + currentSSID);
  Serial.println("AP SSID:        " + currentAPSSID);
  Serial.println("Room ID:        " + currentRoomId);
  Serial.println("Patient ID:     " + currentPatientId);
  Serial.println("Firebase URL:   " + currentFbUrl);
  Serial.println("Firebase Email: " + currentFbEmail);
  Serial.println("==================================\n");

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

  if (WiFi.status() == WL_CONNECTED && currentFbUrl.length() > 0) {
    ssl_client.setInsecure();

    Serial.println("Initializing Firebase with NO AUTH...");

    NoAuth no_auth;

    initializeApp(aClient, app, getAuth(no_auth));

    app.getApp<RealtimeDatabase>(Database);
    Database.url(currentFbUrl); 

    Serial.println("Firebase App Initialized in No-Auth Mode.");
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

  // Start the Firebase upload loop on Core 0 (Network Core)
  xTaskCreatePinnedToCore(
      firebaseUploadTask,   // Function to run
      "FirebaseTask",       // Name of the task
      8192,                 // Stack size (8KB is good for SSL network tasks)
      NULL,                 // Parameters
      1,                    // Priority
      &FirebaseTask,        // Task handle
      0                     // Pin to Core 0
      );
}

void loop() {
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

  if (shouldReboot) {
    if (millis() - rebootTime > 2000) {
      ESP.restart();
    }
    return;
  }

  delay(10);
}

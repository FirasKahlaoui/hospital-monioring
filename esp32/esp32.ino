#define ENABLE_USER_AUTH
#define ENABLE_DATABASE
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include "routes.h"
#include <FirebaseClient.h>
#include <WiFiClientSecure.h>

// FIREBASE OBJECTS
WiFiClientSecure ssl_client;
AsyncClientClass aClient(ssl_client);
FirebaseApp app;
RealtimeDatabase Database;

// Global Variables
Preferences preferences;
AsyncWebServer server(80);
String currentSSID = "bardo";
String currentWiFiPassword = "12345679";
String currentAPSSID = "ESP32_001";
String currentAPPassword = "men0lel1";
String wifiOptionsHTML = "";
String currentFbUrl = "";
String currentFbApiKey = "";
String currentFbEmail = "";
String currentFbPassword = "";
bool shouldReboot = false;
unsigned long rebootTime = 0;

const unsigned long SCAN_INTERVAL_MS = 10000;
unsigned long lastScanTime = 0 - SCAN_INTERVAL_MS;

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
  currentSSID = preferences.getString("ssid", "bardo");
  currentWiFiPassword = preferences.getString("wifi_password", "12345679");
  currentAPSSID = preferences.getString("apssid", "ESP32_001");
  currentAPPassword = preferences.getString("ap_password", "men0lel1");
  currentFbUrl = preferences.getString("fb_url", "");
  currentFbApiKey = preferences.getString("fb_api_key", "");
  currentFbEmail = preferences.getString("fb_email", "");
  currentFbPassword = preferences.getString("fb_password", "");
  preferences.end();

  // Initialize hardware components
  dht.begin();

  WiFi.mode(WIFI_AP_STA);

  // Connect to Wi-Fi
  WiFi.begin(currentSSID.c_str(), currentWiFiPassword.c_str());
  int attempts = 0;
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

  if (WiFi.status() == WL_CONNECTED && currentFbApiKey.length() > 0 && currentFbEmail.length() > 0) {
    Serial.println("Initializing Firebase...");

    ssl_client.setInsecure();

    Serial.println("Initializing Firebase...");
    UserAuth user_auth(currentFbApiKey, currentFbEmail, currentFbPassword);
    initializeApp(aClient, app, getAuth(user_auth));

    app.getApp<RealtimeDatabase>(Database);
    Database.url(currentFbUrl); // Uncomment and use your DB URL variable here

    Serial.println("Firebase App Initialized.");
  }

  // Configure Access Point
  WiFi.softAP(currentAPSSID.c_str(), currentAPPassword.c_str());
  Serial.print("AP IP Address: ");
  Serial.println(WiFi.softAPIP());

  // Set up routes and start the server
  setupRoutes();
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
      Serial.println("Rebooting device to apply new settings...");
      ESP.restart();
    }
    return;
  }

  app.loop();

  unsigned long currentTime = millis();
  if (lastScanTime == 0 || currentTime - lastScanTime >= SCAN_INTERVAL_MS) {
    lastScanTime = (currentTime == 0) ? 1 : currentTime; // Prevent staying 0
    Serial.println("Starting background WiFi scan...");
    WiFi.scanNetworks(true);  // 'true' makes it async
  }

  int n = WiFi.scanComplete();
  
  if (n >= 0) { // Scan successfully finished!
    
    String options = "";
    if (n == 0) {
      options = "<option value='Null'>No Networks Found</option>";
    } else {
      for (int i = 0; i < n; i++) {
        options += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + "dB)</option>";
      }
    }
    wifiOptionsHTML = options;
    WiFi.scanDelete();  // Clear memory
    
  } else if (n == -2) { 
    // -2 means WIFI_SCAN_FAILED. The radio was busy.
    Serial.println("Scan failed (Radio might be busy). Retrying...");
    lastScanTime = 0; // Force it to try again immediately on the next loop
  }

  delay(10);
}

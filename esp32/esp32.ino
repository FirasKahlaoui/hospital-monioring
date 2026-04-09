cd do#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include "routes.h"


// Global Variables
Preferences preferences;
AsyncWebServer server(80);
String currentSSID = "bardo";
String currentWiFiPassword = "12345679";
String currentAPSSID = "ESP32_001";
String currentAPPassword = "men0lel1";
String currentUsername = "admin";
String currentPassword = "password";
String wifiOptionsHTML = "";

unsigned long lastScanTime = 0;                // Tracks the last scan time
const unsigned long SCAN_INTERVAL_MS = 10000;  // Time between scans (10 seconds)

void setup() {
  Serial.begin(115200);

  // Initialize LittleFS
  if (!LittleFS.begin(true)) {
    Serial.println("An Error has occurred while mounting LittleFS");
    return;
  }
  Serial.println("LittleFS mounted successfully");

  // --- ADD THIS DEBUGGING BLOCK ---
  File root = LittleFS.open("/");
  File file = root.openNextFile();
  Serial.println("--- Files currently in LittleFS ---");
  bool hasFiles = false;
  while(file){
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
  currentUsername = preferences.getString("username", "admin");
  currentPassword = preferences.getString("password", "password");
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
  }

  // Configure Access Point
  WiFi.softAP(currentAPSSID.c_str(), currentAPPassword.c_str());
  Serial.print("AP IP Address: ");
  Serial.println(WiFi.softAPIP());

  // Set up routes and start the server
  setupRoutes();
  server.begin();
  Serial.println("HTTP server started");

  // Login credentials
  Serial.println();
  Serial.print("Username: ");
  Serial.println(currentUsername);
  Serial.print("Password: ");
  Serial.println(currentPassword);

  // Access point credentials
  Serial.println();
  Serial.print("Access point: ");
  Serial.println(currentAPSSID);
  Serial.print("AP Password: ");
  Serial.println(currentAPPassword);
}

void loop() {
  unsigned long currentTime = millis();
  if (currentTime - lastScanTime >= SCAN_INTERVAL_MS) {
    lastScanTime = currentTime;
    scanForWiFiNetworks();
    cleanupExpiredSessions();
  }
  delay(10);
}

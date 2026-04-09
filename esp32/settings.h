#ifndef SETTINGS_H
#define SETTINGS_H

#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <WiFi.h>
#include <ctime>
#include <LittleFS.h>

extern String currentSSID;
extern String currentWiFiPassword;
extern String currentAPSSID;
extern String currentAPPassword;
extern String wifiOptionsHTML;
extern String currentUsername;
extern String currentPassword;
extern AsyncWebServer server;
extern Preferences preferences;

#define WIFI_ATTEMPTS 10
#define WIFI_DELAY_MS 1000

void scanForWiFiNetworks() {
  String options = "";
  int n = WiFi.scanNetworks();
  if (n == 0) {
    options = "<option value='Null'>No Networks Found</option>";
  } else {
    for (int i = 0; i < n; i++) {
      options += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + "dB)</option>";
    }
  }
  wifiOptionsHTML = options;
  WiFi.scanDelete();
}

void handleSettings(AsyncWebServerRequest *request) {
  if (!ensureLoggedIn(request)) return;
  // Serve the static HTML file
  request->send(LittleFS, "/settings.html", "text/html");
}

// NEW API ENDPOINT: Sends current config to settings.html via JSON
void handleGetSettingsData(AsyncWebServerRequest *request) {
  if (!ensureLoggedIn(request)) return;
  
  String json = "{";
  json += "\"username\": \"" + currentUsername + "\",";
  json += "\"wifiOptions\": \"" + wifiOptionsHTML + "\"";
  json += "}";
  
  request->send(200, "application/json", json);
}

void handleUpdateSettings(AsyncWebServerRequest *request) {
  bool isUpdated = false;
  IPAddress clientIP = request->client()->remoteIP();

  if (!ensureLoggedInAndAuthorized(request, "admin")) return;

  if (request->method() == HTTP_POST) {
    preferences.begin("settings", false);

    if (request->hasParam("ssid", true) && request->hasParam("wifi_password", true)) {
      String newSSID = request->getParam("ssid", true)->value();
      String newWiFiPassword = request->getParam("wifi_password", true)->value();

      if (newSSID.length() != 0 && newWiFiPassword.length() != 0 && newSSID != "Null") {
        currentSSID = newSSID;
        currentWiFiPassword = newWiFiPassword;
        WiFi.begin(currentSSID.c_str(), currentWiFiPassword.c_str());

        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < WIFI_ATTEMPTS) {
          delay(WIFI_DELAY_MS);
          attempts++;
        }

        if (WiFi.status() == WL_CONNECTED) {
          preferences.putString("ssid", currentSSID);
          preferences.putString("wifi_password", currentWiFiPassword);
          isUpdated = true;
        }
      }
    }

    if (request->hasParam("apssid", true) && request->hasParam("ap_password", true)) {
      String newAPSSID = request->getParam("apssid", true)->value();
      String newAPPassword = request->getParam("ap_password", true)->value();

      if (newAPSSID.length() > 0 && newAPPassword.length() >= 8) { 
        preferences.putString("apssid", newAPSSID);
        preferences.putString("ap_password", newAPPassword);
        isUpdated = true;
        WiFi.softAPdisconnect(true);
        WiFi.softAP(newAPSSID.c_str(), newAPPassword.c_str());
      }
    }

    if (request->hasParam("username", true)) {
      String newUsername = request->getParam("username", true)->value();
      if (newUsername.length() != 0 && newUsername != currentUsername) {
        currentUsername = newUsername;
        preferences.putString("username", currentUsername);
        isUpdated = true;
      }
    }

    if (request->hasParam("password", true)) {
      String newPassword = request->getParam("password", true)->value();
      if (newPassword.length() != 0 && newPassword != currentPassword) {
        currentPassword = newPassword;
        preferences.putString("password", currentPassword);
        isUpdated = true;
      }
    }

    preferences.end();

    if (isUpdated) {
      if (request->hasParam("username", true) || request->hasParam("password", true)) {
        handleLogout(request); 
        return;
      }
      request->redirect("/settings?success=1");
    } else {
      request->redirect("/settings?error=1");
    }

  } else {
    request->send(405, "text/plain", "Method Not Allowed");
  }
}

void setupSettingsRoutes() {
  server.on("/settings", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!ensureLoggedInAndAuthorized(request, "admin")) return;
    handleSettings(request);  
  });
  
  server.on("/api/get_settings", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!ensureLoggedInAndAuthorized(request, "admin")) return;
    handleGetSettingsData(request);
  });

  server.on("/update_settings", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (!ensureLoggedInAndAuthorized(request, "admin")) return;
    handleUpdateSettings(request);  
  });
}

#endif

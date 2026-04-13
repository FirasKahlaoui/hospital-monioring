#ifndef SETTINGS_H
#define SETTINGS_H

#include <ESPAsyncWebServer.h>

// Wi-Fi Connection Definitions (Used by main.ino)
#define WIFI_ATTEMPTS 10
#define WIFI_DELAY_MS 1000

// Web Server Route Prototypes
bool isAPConnected(AsyncWebServerRequest *request);
void handleSettings(AsyncWebServerRequest *request);
void handleGetSettingsData(AsyncWebServerRequest *request);
void handleUpdateSettings(AsyncWebServerRequest *request);
void setupSettingsRoutes();

#endif

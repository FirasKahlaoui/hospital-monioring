#ifndef ROUTES_H
#define ROUTES_H

#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include "auth.h"
#include "dashboard.h"
#include "settings.h"

extern Preferences preferences;
extern AsyncWebServer server;

void setupRoutes() {
  // Serve static files from LittleFS automatically.
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

  setupAuthRoutes();
  setupSettingsRoutes();
  setupSensorRoutes();
}

#endif  // ROUTES_H

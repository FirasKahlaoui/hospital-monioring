#ifndef AUTH_H
#define AUTH_H

#include <ESPAsyncWebServer.h>
#include <WiFi.h>

bool isAPConnected(AsyncWebServerRequest *request) {
  // Check if the client reached the server via the ESP32's Access Point IP
  if (request->client()->localIP() == WiFi.softAPIP()) {
    return true;
  } else {
    // If they came from the home router, kick them back to the dashboard
    request->redirect("/");
    return false;
  }
}

// Keep an empty function so routes.h doesn't break (reused function from another code)
void setupAuthRoutes() {
}

#endif
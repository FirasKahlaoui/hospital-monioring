#include "network.h"

void firebaseUploadTask(void *pvParameters) {
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

  for (;;) {
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

    // --- WI-FI CONNECTED ---
    if (WiFi.status() == WL_CONNECTED) {
      if (app.ready()) {
        if (millis() - lastTaskPush >= FIREBASE_INTERVAL_MS) {
          lastTaskPush = millis();

          // Queue Room Data
          if (abs(currentTemp - lastSentTemp) > 0.3 ||
              abs(currentHumidity - lastSentHum) > 0.5) {
            String roomJson = "{\"temperature\":" + String(currentTemp) +
                              ",\"humidity\":" + String(currentHumidity) +
                              ",\"timestamp\":{\".sv\":\"timestamp\"}}";
            Serial.println(">> Q-Room... ");
            Database.push<object_t>(aClient, roomPath, object_t(roomJson),
                                    roomResult);
            lastSentTemp = currentTemp;
            lastSentHum = currentHumidity;
          }

          // Queue Patient Data
          if (currentBPM != lastSentBPM ||
              abs(currentSpO2 - lastSentSpO2) > 2) {
            String patientJson = "{\"heartRate\":" + String(currentBPM) +
                                 ",\"spO2\":" + String(currentSpO2) +
                                 ",\"timestamp\":{\".sv\":\"timestamp\"}}";
            Serial.println(">> Q-Patient...");
            Database.push<object_t>(aClient, patientPath, object_t(patientJson),
                                    patientResult);
            lastSentBPM = currentBPM;
            lastSentSpO2 = currentSpO2;
          }
        }
      } else {
        if (millis() - lastTaskPush >= 5000) {
          lastTaskPush = millis();
          Serial.println(
              ">> [FIREBASE] App not ready (Authenticating/Renewing Token)...");
        }
      }
    }
    // --- WI-FI DISCONNECTED ---
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
        String options = "";
        if (n == 0) {
          options = "<option value='Null'>No Networks Found</option>";
        } else {
          for (int i = 0; i < n; i++) {
            options += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) +
                       " (" + String(WiFi.RSSI(i)) + "dB)</option>";
          }
        }
        wifiOptionsHTML = options;
        WiFi.scanDelete();
      } else if (n == -2) {
        lastScanTime = 0;
      }
    }

    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

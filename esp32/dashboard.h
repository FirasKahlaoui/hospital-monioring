#ifndef DASHBOARD_H
#define DASHBOARD_H

#include <ESPAsyncWebServer.h>
#include <DHT.h>

#define DHT_PIN 4
#define DHT_TYPE DHT22

extern AsyncWebServer server;
DHT dht(DHT_PIN, DHT_TYPE);

void handleSensorData(AsyncWebServerRequest *request) {
  
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  String temperatureStr = isnan(temperature) ? "Error" : "Temperature: " + String(temperature);
  String humidityStr = isnan(humidity) ? "Error" : "Humidity: " + String(humidity);

  String jsonResponse = "{\"temperature\": \"" + temperatureStr + " °C\", \"humidity\": \"" + humidityStr + " %\"}";

  request->send(200, "application/json", jsonResponse);
}

void setupSensorRoutes() {
  server.on("/sensor_data", HTTP_GET, [](AsyncWebServerRequest *request) {
    handleSensorData(request);
  });
}

#endif

#ifndef SENSORS_H
#define SENSORS_H

#include <Arduino.h>

// Sensor Pins & Settings
#define DHT_PIN 4
#define DHT_TYPE DHT22

// Function Prototypes
void initSensors();
void updateSensors();

#endif

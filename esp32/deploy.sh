#!/bin/bash

# Configuration
PORT="/dev/ttyUSB0"
BAUD="460800"
# FQBN (Fully Qualified Board Name).
FQBN="esp32:esp32:esp32da"
SKETCH_DIR="."

echo "Compiling the Arduino Sketch..."

arduino-cli compile --fqbn $FQBN $SKETCH_DIR

# Check if compilation was successful
if [ $? -ne 0 ]; then
    echo "Compilation failed! Aborting."
    exit 1
fi

echo "Uploading the Sketch (Firmware)..."

arduino-cli upload -p $PORT --fqbn $FQBN $SKETCH_DIR

if [ $? -ne 0 ]; then
    echo "Firmware upload failed! Aborting."
    exit 1
fi

echo "Building & Uploading LittleFS..."

~/.arduino15/packages/esp32/tools/mklittlefs/4.*/mklittlefs -c ./data -p 256 -b 4096 -s 1441792 /tmp/test_image.bin

if [ $? -ne 0 ]; then
    echo "LittleFS image creation failed! Aborting."
    exit 1
fi

esptool --no-stub --chip esp32 --port $PORT --baud $BAUD write_flash 0x290000 /tmp/test_image.bin

if [ $? -eq 0 ]; then
    echo " ✅ SUCCESS! Firmware and Web Data uploaded."
else
    echo "LittleFS upload failed!"
    exit 1
fi

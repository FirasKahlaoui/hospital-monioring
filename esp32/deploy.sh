#!/bin/bash

# Configuration
PORT="/dev/ttyUSB0"
BAUD="460800"
# FQBN (Fully Qualified Board Name).
FQBN="esp32:esp32:esp32da"
SKETCH_DIR="."

# Initialize flags
UPLOAD_CODE=false
UPLOAD_DATA=false

# Parse command-line arguments
for arg in "$@"; do
    case $arg in
    --code)
        UPLOAD_CODE=true
        ;;
    --data)
        UPLOAD_DATA=true
        ;;
    *)
        echo "Error: Unknown flag '$arg'"
        echo "Usage: $0 [--code] [--data]"
        exit 1
        ;;
    esac
done

# If no flags are provided, default to uploading both
if [ "$UPLOAD_CODE" = false ] && [ "$UPLOAD_DATA" = false ]; then
    UPLOAD_CODE=true
    UPLOAD_DATA=true
fi

# CODE (FIRMWARE) COMPILATION & UPLOAD
if [ "$UPLOAD_CODE" = true ]; then
    echo "--- Compiling the Arduino Sketch ---"
    arduino-cli compile --fqbn "$FQBN" "$SKETCH_DIR"

    if [ $? -ne 0 ]; then
        echo "Compilation failed! Aborting."
        exit 1
    fi

    echo "--- Uploading the Sketch (Firmware) ---"
    arduino-cli upload -p "$PORT" --fqbn "$FQBN" "$SKETCH_DIR"

    if [ $? -ne 0 ]; then
        echo "Firmware upload failed! Aborting."
        exit 1
    fi
    echo "Firmware successfully updated!"
fi

# DATA (LITTLEFS) BUILD & UPLOAD
if [ "$UPLOAD_DATA" = true ]; then
    echo "--- Building LittleFS Image ---"

    # Locate mklittlefs dynamically just in case the version folder changes
    MKLITTLEFS_BIN=$(ls ~/.arduino15/packages/esp32/tools/mklittlefs/4.*/mklittlefs | head -n 1)

    if [ -z "$MKLITTLEFS_BIN" ] || [ ! -x "$MKLITTLEFS_BIN" ]; then
        echo "Error: mklittlefs executable not found or not executable!"
        exit 1
    fi

    "$MKLITTLEFS_BIN" -c ./data -p 256 -b 4096 -s 1441792 /tmp/test_image.bin

    if [ $? -ne 0 ]; then
        echo "LittleFS image creation failed! Aborting."
        exit 1
    fi

    echo "--- Uploading LittleFS Image ---"
    esptool --no-stub --chip esp32 --port "$PORT" --baud "$BAUD" write_flash 0x290000 /tmp/test_image.bin

    if [ $? -ne 0 ]; then
        echo "LittleFS upload failed! Aborting."
        exit 1
    fi
    echo "Web Data successfully updated!"
fi

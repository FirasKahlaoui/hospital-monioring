#!/bin/bash

echo "=== Arduino/ESP32 Serial Monitor ==="

# SCAN FOR AVAILABLE PORTS
available_ports=()
for p in /dev/ttyUSB* /dev/ttyACM*; do
    # -c checks if the character device file actually exists
    if [ -c "$p" ]; then
        available_ports+=("$p")
    fi
done

# If the array is empty, no devices are plugged in
if [ ${#available_ports[@]} -eq 0 ]; then
    echo "Error: No USB serial ports found!"
    echo "Ensure your device is plugged in (looking for /dev/ttyUSB* or /dev/ttyACM*)."
    exit 1
fi

# PORT SELECTION MENU
echo ""
echo "Available Serial Ports:"
PS3="Select a port (enter number): "

select PORT in "${available_ports[@]}"; do
    if [ -n "$PORT" ]; then
        echo "Selected port: $PORT"
        break
    else
        echo "Invalid selection. Please enter a valid number."
    fi
done

# BAUD RATE SELECTION MENU
echo ""
echo "Common Baud Rates:"
common_bauds=("9600" "115200" "460800" "Custom")
PS3="Select a baud rate (enter number): "

select BAUD in "${common_bauds[@]}"; do
    if [ "$BAUD" == "Custom" ]; then
        read -p "Type your custom baud rate: " BAUD
        break
    elif [ -n "$BAUD" ]; then
        echo "Selected baud rate: $BAUD"
        break
    else
        echo "Invalid selection. Please enter a valid number."
    fi
done

# CONFIGURE AND READ
echo ""
echo "Listening on $PORT at $BAUD baud..."
echo "Press Ctrl+C to stop."
echo "----------------------------------------"

# Configure the serial port to raw mode with the correct baud rate
stty -F "$PORT" "$BAUD" cs8 -cstopb -parenb raw -echo

# Read and print the output continuously
cat "$PORT"

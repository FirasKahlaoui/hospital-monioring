function updateSensorData() {
  fetch("/sensor_data")
    .then(response => response.json())
    .then(data => {
      document.getElementById("temperature").innerText = data.temperature;
      document.getElementById("humidity").innerText = data.humidity;
    })
    .catch(err => console.error("Error fetching sensor data:", err));
}

// Fetch immediately on load, then every 1 second
updateSensorData();
setInterval(updateSensorData, 1000);

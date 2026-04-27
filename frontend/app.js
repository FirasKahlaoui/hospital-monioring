import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const connectionDot = document.getElementById("connectionDot");
const connectionText = document.getElementById("connectionText");
const roomTableBody = document.getElementById("roomTableBody");
const patientTableBody = document.getElementById("patientTableBody");

const MAX_POINTS = 60;

const sharedLineDataset = {
  borderWidth: 2.4,
  pointRadius: 0,
  pointHoverRadius: 4,
  spanGaps: true,
  fill: false,
  tension: 0.32,
};

const sharedChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  normalized: true,
  interaction: {
    mode: "index",
    intersect: false,
  },
  plugins: {
    legend: {
      position: "top",
      labels: {
        boxWidth: 34,
        boxHeight: 10,
        usePointStyle: false,
        font: {
          size: 12,
          weight: "600",
        },
      },
    },
    tooltip: {
      callbacks: {
        title(items) {
          if (!items.length) {
            return "";
          }

          return formatTimestamp(items[0].raw.x);
        },
      },
    },
  },
  scales: {
    x: {
      type: "linear",
      grid: {
        color: "rgba(79, 93, 117, 0.14)",
      },
      ticks: {
        maxTicksLimit: 8,
        callback(value) {
          return formatTimestamp(Number(value));
        },
      },
    },
  },
};

const roomChart = new Chart(document.getElementById("roomChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Temperature (C)",
        data: [],
        borderColor: "#ff7a18",
        backgroundColor: "rgba(255, 122, 24, 0.15)",
        yAxisID: "yTemp",
        ...sharedLineDataset,
      },
      {
        label: "Humidity (%)",
        data: [],
        borderColor: "#00a6a6",
        backgroundColor: "rgba(0, 166, 166, 0.15)",
        yAxisID: "yHum",
        ...sharedLineDataset,
      },
    ],
  },
  options: {
    ...sharedChartOptions,
    scales: {
      ...sharedChartOptions.scales,
      yTemp: {
        type: "linear",
        position: "left",
        suggestedMin: 20,
        suggestedMax: 35,
        grid: { color: "rgba(79, 93, 117, 0.14)" },
        title: { display: true, text: "Temperature (C)" },
      },
      yHum: {
        type: "linear",
        position: "right",
        suggestedMin: 40,
        suggestedMax: 90,
        grid: { drawOnChartArea: false },
        title: { display: true, text: "Humidity (%)" },
      },
    },
  },
});

const patientChart = new Chart(document.getElementById("patientChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Heart Rate (bpm)",
        data: [],
        borderColor: "#e63946",
        backgroundColor: "rgba(230, 57, 70, 0.15)",
        yAxisID: "yHeart",
        ...sharedLineDataset,
      },
      {
        label: "SpO2 (%)",
        data: [],
        borderColor: "#2a9d8f",
        backgroundColor: "rgba(42, 157, 143, 0.15)",
        yAxisID: "ySpO2",
        ...sharedLineDataset,
      },
    ],
  },
  options: {
    ...sharedChartOptions,
    scales: {
      ...sharedChartOptions.scales,
      yHeart: {
        type: "linear",
        position: "left",
        suggestedMin: 40,
        suggestedMax: 130,
        grid: { color: "rgba(79, 93, 117, 0.14)" },
        title: { display: true, text: "Heart Rate (bpm)" },
      },
      ySpO2: {
        type: "linear",
        position: "right",
        grid: { drawOnChartArea: false },
        min: 80,
        max: 100,
        title: { display: true, text: "SpO2 (%)" },
      },
    },
  },
});

function formatTimestamp(value) {
  if (typeof value !== "number") {
    return "N/A";
  }

  if (value > 1000000000) {
    return new Date(value * 1000).toLocaleTimeString();
  }

  if (value >= 100000) {
    return new Date(value).toLocaleTimeString();
  }

  return `t=${value}`;
}

function sortByTimestamp(a, b) {
  const ta = typeof a.timestamp === "number" ? a.timestamp : -Infinity;
  const tb = typeof b.timestamp === "number" ? b.timestamp : -Infinity;
  return ta - tb;
}

function mapSnapshotToRows(snapshotValue) {
  if (!snapshotValue || typeof snapshotValue !== "object") {
    return [];
  }

  return Object.entries(snapshotValue).map(([id, row]) => ({
    id,
    ...row,
  }));
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function aggregateByTimestamp(rows, fields) {
  const bucket = new Map();

  for (const row of rows) {
    const timestamp = safeNumber(row.timestamp);
    if (timestamp === null) {
      continue;
    }

    if (!bucket.has(timestamp)) {
      const init = { timestamp, count: 0 };
      for (const field of fields) {
        init[field] = 0;
        init[`${field}Count`] = 0;
      }
      bucket.set(timestamp, init);
    }

    const agg = bucket.get(timestamp);
    agg.count += 1;

    for (const field of fields) {
      const value = safeNumber(row[field]);
      if (value !== null) {
        agg[field] += value;
        agg[`${field}Count`] += 1;
      }
    }
  }

  return Array.from(bucket.values())
    .map((item) => {
      const out = { timestamp: item.timestamp };
      for (const field of fields) {
        const count = item[`${field}Count`];
        out[field] =
          count > 0 ? Number((item[field] / count).toFixed(2)) : null;
      }
      return out;
    })
    .sort(sortByTimestamp)
    .slice(-MAX_POINTS);
}

function toChartPoints(rows, field) {
  return rows
    .filter(
      (row) =>
        safeNumber(row.timestamp) !== null && safeNumber(row[field]) !== null,
    )
    .map((row) => ({ x: Number(row.timestamp), y: Number(row[field]) }));
}

function renderRoom(rows) {
  const ordered = aggregateByTimestamp(rows, ["temperature", "humidity"]);
  roomChart.data.labels = [];
  roomChart.data.datasets[0].data = toChartPoints(ordered, "temperature");
  roomChart.data.datasets[1].data = toChartPoints(ordered, "humidity");
  roomChart.update();

  roomTableBody.innerHTML = ordered
    .slice(-8)
    .reverse()
    .map(
      (row) => `
        <tr>
          <td>${formatTimestamp(row.timestamp)}</td>
          <td>${row.temperature ?? "-"}</td>
          <td>${row.humidity ?? "-"}</td>
        </tr>
      `,
    )
    .join("");
}

function renderPatient(rows) {
  const ordered = aggregateByTimestamp(rows, ["heartRate", "spO2"]);
  patientChart.data.labels = [];
  patientChart.data.datasets[0].data = toChartPoints(ordered, "heartRate");
  patientChart.data.datasets[1].data = toChartPoints(ordered, "spO2");
  patientChart.update();

  patientTableBody.innerHTML = ordered
    .slice(-8)
    .reverse()
    .map(
      (row) => `
        <tr>
          <td>${formatTimestamp(row.timestamp)}</td>
          <td>${row.heartRate ?? "-"}</td>
          <td>${row.spO2 ?? "-"}</td>
        </tr>
      `,
    )
    .join("");
}

function setConnected(isConnected) {
  connectionDot.style.background = isConnected ? "#22c55e" : "#f59e0b";
  connectionText.textContent = isConnected ? "Live" : "Reconnecting...";
}

onValue(
  ref(db, "rooms/room_001"),
  (snapshot) => {
    setConnected(true);
    renderRoom(mapSnapshotToRows(snapshot.val()));
  },
  () => {
    setConnected(false);
  },
);

onValue(
  ref(db, "patients/patient_001"),
  (snapshot) => {
    setConnected(true);
    renderPatient(mapSnapshotToRows(snapshot.val()));
  },
  () => {
    setConnected(false);
  },
);

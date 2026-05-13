# Figures and Diagrams

# Figure 2.1 — System Context Diagram

Insert in: Section 2.1 (System Description)

Purpose:
Shows actors, system boundary, and cloud integrations.

```mermaid
flowchart LR
  Staff[Medical Staff] -->|Use dashboard| UI[Web Dashboard]
  ESP32[ESP32 Node] -->|HTTPS JSON| RTDB[Firebase Realtime DB]
  UI -->|Subscribe| RTDB
  UI -->|tRPC calls| API[Node.js/tRPC API]
  API --> Firestore[Firebase Firestore]
  API --> RTDB
  API --> SMTP[SMTP Relay]
  Staff <-->|Alerts| UI
```

# Figure 3.1 — Global Architecture Diagram

Insert in: Section 3.1 (Global Architecture Diagram)

Purpose:
Shows the five-layer system architecture and data flow.

```mermaid
flowchart TB
  subgraph SensorLayer[Sensor Layer]
    DHT[DHT22] --> ESP32
    MAX[MAX30102] --> ESP32
  end
  subgraph EmbeddedLayer[Embedded Layer]
    ESP32[ESP32 Firmware]
  end
  subgraph ServerLayer[Server Layer]
    API[Node.js + tRPC]
  end
  subgraph AILayer[AI Insights Layer]
    AI[Z-score + Linear Regression]
  end
  subgraph AppLayer[Application Layer]
    UI[React Dashboard]
  end

  ESP32 -->|HTTPS JSON| RTDB[Firebase RTDB]
  UI -->|WebSocket| RTDB
  UI -->|tRPC| API
  API --> Firestore[Firestore]
  API --> AI
  AI --> API
  API --> UI
```

# Figure 3.1b — End-to-End System Diagram (ESP32 to Dashboard + RBAC + Alerts)

Insert in: Section 3.1 (Global Architecture Diagram)

Purpose:
Show the complete system flow from ESP32 to dashboard, including RBAC and alerts.

```mermaid
flowchart LR
  subgraph Edge[Edge Acquisition]
    ESP32[ESP32 Node]
    DHT[DHT22]
    MAX[MAX30102]
    DHT --> ESP32
    MAX --> ESP32
  end

  subgraph Firebase[Firebase]
    RTDB[Realtime DB]
    FS[Firestore]
    AUTH[Firebase Auth]
  end

  subgraph Server[Node.js + tRPC]
    API[API Router]
    RBAC[RBAC + Session Auth]
    AI[AI Insights]
    SMTP[SMTP Email]
  end

  subgraph Client[React Dashboard]
    UI[Monitoring UI]
    FACE[Face Recognition]
    ALERTS[Threshold Alerts]
  end

  ESP32 -->|HTTPS JSON| RTDB
  UI -->|Realtime subscribe| RTDB
  UI -->|tRPC calls| API
  API --> RBAC
  RBAC --> AUTH
  API --> FS
  API --> AI
  AI --> API
  API --> UI
  FACE -->|events.log| API
  ALERTS -->|sendAlertEmail| API
  API --> SMTP
```

# Figure 3.2 — Functional Architecture

Insert in: Section 3.2 (Functional Architecture)

Purpose:
Breaks down functional modules and interfaces.

```mermaid
flowchart LR
  subgraph ESP32
    SENS[Sensor Task] --> SHARED[Shared Globals]
    NET[Firebase Task] --> SHARED
    WEB[Settings Web Server] --> NVS[NVS]
  end
  subgraph Backend
    AUTH[Auth + Sessions]
    PEOPLE[People Router]
    EVENTS[Events/Alerts]
    AI[AI Router]
  end
  subgraph Client
    SUB[RTDB Subscriptions]
    VIS[Charts + UI]
    FACE[Face Recognition]
    ALERTS[Threshold Alerts]
  end

  ESP32 --> RTDB
  SUB --> VIS
  FACE --> EVENTS
  ALERTS --> Backend
  Backend --> Firestore
```

# Figure 3.3 — Hardware Architecture

Insert in: Section 3.3 (Hardware Architecture)

Purpose:
Shows hardware components and buses.

```mermaid
flowchart LR
  ESP32[ESP32-WROOM-32]
  DHT[DHT22]
  MAX[MAX30102]
  USB[USB 5V]
  ESP32 ---|3.3V| DHT
  ESP32 ---|I2C SDA/SCL| MAX
  USB --> ESP32
```

# Figure 3.4 — Software Architecture

Insert in: Section 3.5 (Software Architecture)

Purpose:
Shows module boundaries and data stores.

```mermaid
flowchart TB
  subgraph Client
    UI[React UI]
    FACE[face-api.js]
    FIRE[Firebase RTDB SDK]
  end
  subgraph Server
    TRPC[tRPC Routers]
    AUTH[Session Auth]
    AI[AI Insights]
  end
  subgraph Firebase
    RTDB[Realtime DB]
    FS[Firestore]
  end

  UI --> FIRE
  UI --> TRPC
  FACE --> TRPC
  TRPC --> FS
  TRPC --> RTDB
```

# Figure 3.5 — Processing Pipeline

Insert in: Section 3.6 (Processing Pipeline)

Purpose:
End-to-end telemetry flow and AI call sequence.

```mermaid
sequenceDiagram
  autonumber
  participant ESP as ESP32
  participant RTDB as Firebase RTDB
  participant UI as Dashboard
  participant API as tRPC API
  participant AI as AI Insights

  ESP->>RTDB: Push vitals JSON
  RTDB-->>UI: Realtime update
  UI->>API: getInsights(vitalsHistory)
  API->>AI: z-score + regression
  AI-->>API: status + forecast
  API-->>UI: insight payload
```

# Figure 3.6 — Database Structure

Insert in: Section 3.5 (Software Architecture) or Section 2.5 (Inputs/Outputs)

Purpose:
Document Firestore collections and RTDB paths.

```mermaid
flowchart LR
  subgraph Firestore
    USERS[users]
    PEOPLE[patients]
    EVENTS[detectionEvents]
    ALERTS[alertLogs]
    ROOMLOGS[roomActivityLogs]
  end
  subgraph RTDB
    RT_PAT["patients/{patientId}"]
    RT_ROOMS["rooms/{roomId}"]
    RT_EVENTS["detectionEvents/{userId} (mirror for real-time)"]
    RT_ALERTS["alertLogs/{userId} (mirror for real-time)"]
  end
```

# Figure 3.7 — Face Recognition Pipeline

Insert in: Section 3.5 (Software Architecture) or Section 4 (Methodology)

Purpose:
Show the browser-based face recognition flow and alert generation.

```mermaid
sequenceDiagram
  autonumber
  participant CAM as Webcam
  participant UI as Dashboard
  participant FACE as face-api.js
  participant API as tRPC API
  participant FS as Firestore
  participant RTDB as RTDB

  UI->>CAM: Start stream
  UI->>FACE: Load models (CDN)
  loop Every 600 ms
    CAM->>FACE: Video frame
    FACE->>FACE: Detect + descriptor
    FACE->>UI: Match decision (confidence)
    alt recognized
      UI->>API: events.log (person recognized)
      API->>FS: Store detection event
      API->>RTDB: Mirror event
    else unknown
      UI->>API: events.log (unknown person)
      API->>FS: Store detection event
      API->>RTDB: Mirror event
    end
  end
```

# Figure 4.1 — Methodology Workflow

Insert in: Section 4.2 (Methodology Diagram)

Purpose:
Visualize the required flow: problem → design → implementation → validation → analysis.

```mermaid
flowchart LR
  P[Problem Analysis] --> D[System Design]
  D --> I[Implementation]
  I --> V[Validation]
  V --> A[Analysis + Discussion]
```

# Figure 5.1 — Backend Service Overview

Insert in: Section 5.1 (System Overview)

Purpose:
Shows backend components and data integrations.

```mermaid
flowchart TB
  UI[React Client] -->|tRPC| API[Express + tRPC]
  API --> AUTH[Session Auth]
  API --> PEOPLE[People Router]
  API --> EVENTS[Events/Alerts]
  API --> AI[AI Router]
  API --> FS[Firestore]
  API --> RTDB[Realtime DB]
  API --> SMTP[SMTP Email]
```

# Figure 5.2 — Hardware Wiring/Schematics

Insert in: Section 5.4 (Hardware Schematics)

Purpose:
Provide exact wiring between ESP32, DHT22, and MAX30102.

Mermaid is insufficient for a true schematic. The figure should include:

- ESP32-WROOM-32 pinout (3.3V, GND, GPIO4, GPIO21, GPIO22)
- DHT22 with VCC, GND, DATA to GPIO4
- MAX30102 with VCC, GND, SDA to GPIO21, SCL to GPIO22
- Pull-up resistors on SDA, SCL, and INT (value labeled)
- Common 3.3V rail and ground

# Figure 6.1 — Validation Pipeline

Insert in: Section 6.1 (Experimental Protocol)

Purpose:
Show the validation workflow across subsystems.

```mermaid
flowchart LR
  H[Hardware Bench Test] --> E[Embedded Log Review]
  E --> F[Firebase Stream Check]
  F --> UI[Dashboard Load Test]
  UI --> API[Test Suite]
  API --> REPORT[Results + Error Analysis]
```

# Figure 6.2 — ESP32 Communication Flow

Insert in: Section 6.2 or 5.6

Purpose:
Visualize Wi-Fi states and Firebase task behavior.

```mermaid
stateDiagram-v2
  [*] --> Boot
  Boot --> WiFiConnect
  WiFiConnect --> FirebaseInit: connected
  WiFiConnect --> Reconnect: timeout
  FirebaseInit --> UploadLoop
  UploadLoop --> Reconnect: Wi-Fi lost
  Reconnect --> WiFiConnect
```

# Figure 9.1 — AI Pipeline

Insert in: Section 9 (AI Predictive Analytics)

Purpose:
Describe AI processing steps and outputs.

```mermaid
flowchart LR
  V[Vitals Window] --> Z[Z-Score Anomaly]
  V --> LR[Linear Regression Forecast]
  Z --> RULES[Rule-based Status]
  LR --> RULES
  RULES --> OUT[Status + Insight + Forecast]
```

# Figure 9.2 — AI Insights UI

Insert in: Section 9 (AI Predictive Analytics)

Purpose:
Mock the UI block that displays AI status, insight text, and forecast graph.

Mermaid is not suitable for UI layout. The figure should include:

- Status badge (stable/warning/critical)
- Insight text block
- Mini chart with 5-step forecast overlay
- Timestamp of last inference

# Use Case Diagrams

Insert in: Section 2.2 (Use Cases)

Purpose:
Visualizes the interactions between actors and the system across all subsystems.

## Figure 2.2 — Embedded Subsystem Use Cases
```mermaid
flowchart LR
  Tech((Technician))
  
  subgraph ESP32["ESP32 Embedded subsystem<br>"]


    direction LR
    UC1([Initial Configuration])
    UC2([Normal Operation])
    UC3([Wi-Fi Recovery])
    UC4([Remote Reconfiguration])
    UC5([Sensor Fault Detection])
  end
  
  Tech --- UC1
  Tech --- UC4
  UC2 --- Auto1(Auto-run)
  UC3 --- Auto1(Auto-run)
  UC5 --- Auto3(Auto-run)
```

## Figure 2.3 — Backend and Dashboard Use Cases
```mermaid
flowchart LR
  Staff((Medical Staff))
  Admin((Admin/Tech))
  
  subgraph Cloud["Cloud & Dashboard Services<br>"]
    direction LR
    UC6([Auth & RBAC])
    UC7([Data Sync])
    UC8([Alert Dispatch])
    UC9([Real-time Vitals])
    UC10([Face Tracking])
  end
  
  Staff --- UC6
  Staff --- UC9
  Staff --- UC10
  Admin --- UC7
  UC8 --- Trigger(System Trigger)
```

## Figure 2.4 — AI Subsystem Use Cases
```mermaid
flowchart LR
  Staff((Medical Staff))
  
  subgraph AI["AI Intelligence Layer<br>"]
    direction LR
    UC11([Anomaly Detection])
    UC12([Vital Forecasting])
  end
  
  Staff --- UC11
  Staff --- UC12
```

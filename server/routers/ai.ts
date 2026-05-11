
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

interface VitalsData {
  heartRate: number;
  spO2: number;
  timestamp: number;
}

interface RoomData {
  temperature: number;
  humidity: number;
  timestamp: number;
}

export const aiRouter = router({
  getInsights: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      vitalsHistory: z.array(z.object({
        heartRate: z.number(),
        spO2: z.number(),
        timestamp: z.number(),
      })).min(1),
      roomHistory: z.array(z.object({
        temperature: z.number(),
        humidity: z.number(),
        timestamp: z.number(),
      })).optional(),
    }))
    .query(async ({ input }) => {
      const { vitalsHistory, roomHistory } = input;
      
      // 1. Anomaly Detection (Statistical Z-Score)
      const detectAnomalies = (data: number[]) => {
        if (data.length < 5) return [];
        const n = data.length;
        const mean = data.reduce((a, b) => a + b) / n;
        const stdDev = Math.sqrt(data.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
        
        return data.map((val, idx) => {
          const zScore = stdDev === 0 ? 0 : Math.abs(val - mean) / stdDev;
          return zScore > 2.5; // 2.5 standard deviations is a common threshold for anomalies
        });
      };

      const hrAnomalies = detectAnomalies(vitalsHistory.map(v => v.heartRate));
      const spo2Anomalies = detectAnomalies(vitalsHistory.map(v => v.spO2));
      
      const hasHrAnomaly = hrAnomalies.some(a => a);
      const hasSpo2Anomaly = spo2Anomalies.some(a => a);

      // 2. Forecasting (Simple Linear Regression for next 5 mins)
      const forecast = (data: number[]) => {
        if (data.length < 2) return data;
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          sumX += i;
          sumY += data[i];
          sumXY += i * data[i];
          sumX2 += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        const predicted = [];
        for (let i = n; i < n + 5; i++) {
          predicted.push(Math.max(0, Math.round(slope * i + intercept)));
        }
        return predicted;
      };

      const hrForecast = forecast(vitalsHistory.map(v => v.heartRate));
      const spo2Forecast = forecast(vitalsHistory.map(v => v.spO2));

      // 3. Clinical Interpretation (Rule-based "AI")
      let status: "stable" | "warning" | "critical" = "stable";
      let insight = "Patient vitals are within normal statistical ranges. Trends indicate stability.";
      
      const latest = vitalsHistory[vitalsHistory.length - 1];
      
      if (latest.spO2 < 94 || hasSpo2Anomaly) {
        status = "warning";
        insight = "Oxygen saturation levels are showing unusual fluctuations or dropping below baseline. Recommend checking sensor placement or respiratory rate.";
      }
      
      if (latest.heartRate > 110 || latest.heartRate < 50 || hasHrAnomaly) {
        status = latest.heartRate > 130 ? "critical" : "warning";
        insight = `Heart rate is currently ${latest.heartRate} BPM, which is outside the expected baseline. The forecast suggests a ${hrForecast[4] > latest.heartRate ? "continued upward" : "downward"} trend.`;
      }

      if (latest.spO2 < 90) {
        status = "critical";
        insight = "CRITICAL: Oxygen saturation is dangerously low. Immediate clinical assessment required.";
      }

      return {
        status,
        insight,
        anomalies: {
          heartRate: hasHrAnomaly,
          spO2: hasSpo2Anomaly,
        },
        forecast: {
          heartRate: hrForecast,
          spO2: spo2Forecast,
        },
        timestamp: new Date().toISOString()
      };
    }),
});

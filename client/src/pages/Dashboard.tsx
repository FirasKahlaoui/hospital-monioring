import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useFaceDetection } from "@/hooks/useFaceDetection";
import { database } from "@/lib/firebase";
import { ref, onValue, query, limitToLast, orderByChild, startAt, endAt } from "firebase/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, AlertCircle, CheckCircle, Clock, Loader2, User, UserCheck, Shield, Users, HeartPulse, Activity, Thermometer, Droplets, Settings2, BellRing, TrendingUp, Sparkles, ChevronRight, LayoutDashboard, History, Filter, Monitor } from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { DateRangeFilter } from "@/components/DateRangeFilter";

type DetectionStatus = "idle" | "present" | "absent" | "unknown" | "unauthorized";

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

export default function Dashboard() {
  const { user } = useAuth();
  const { data: people } = trpc.people.list.useQuery();
  const logEventMutation = trpc.events.log.useMutation();
  const sendEmailMutation = trpc.people.sendAlertEmail.useMutation();
  
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>("idle");
  const [lastDetectionTime, setLastDetectionTime] = useState<Date | null>(null);
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentlyInRoom, setCurrentlyInRoom] = useState<{name: string, role: string, isAuthorized: boolean}[]>([]);
  const [activeTab, setActiveTab] = useState<"monitoring" | "camera" | "logs">("monitoring");

  // AI insight history — accumulates entries so insights never vanish
  const [insightHistory, setInsightHistory] = useState<
    { status: "stable" | "warning" | "critical"; insight: string; timestamp: Date }[]
  >([]);
  
  // Real-time Firebase data states
  const [currentVitals, setCurrentVitals] = useState<VitalsData | null>(null);
  const [currentRoomData, setCurrentRoomData] = useState<RoomData | null>(null);
  const [vitalsHistory, setVitalsHistory] = useState<VitalsData[]>([]);
  const [roomHistory, setRoomHistory] = useState<RoomData[]>([]);

  const aiInsights = trpc.ai.getInsights.useQuery(
    { 
      patientId: selectedPatientId, 
      vitalsHistory: vitalsHistory.slice(-20) 
    },
    { 
      enabled: !!selectedPatientId && vitalsHistory.length >= 5,
      refetchInterval: 15000 
    }
  );

  // Append new AI insights to the persistent history list
  useEffect(() => {
    if (!aiInsights.data?.insight) return;
    setInsightHistory(prev => {
      // Avoid duplicates: only add if the insight text changed
      if (prev.length > 0 && prev[0].insight === aiInsights.data!.insight) return prev;
      const entry = {
        status: aiInsights.data!.status as "stable" | "warning" | "critical",
        insight: aiInsights.data!.insight,
        timestamp: new Date(),
      };
      // Keep last 20 entries
      return [entry, ...prev].slice(0, 20);
    });
  }, [aiInsights.data?.insight]);

  // Threshold States
  const [thresholds, setThresholds] = useState({
    hrMax: 100,
    hrMin: 50,
    spo2Min: 94,
    tempMax: 30,
    tempMin: 18,
    humidityMax: 70,
    humidityMin: 20
  });

  const sendEmailAlert = async (subject: string, message: string) => {
    if (!selectedPatient || !people) return;
    
    const doctor = people.find(p => p.id === selectedPatient.assignedDoctorId);
    const nurse = people.find(p => p.id === selectedPatient.assignedNurseId);
    
    const recipients = [doctor?.email, nurse?.email].filter(Boolean) as string[];
    
    if (recipients.length === 0) {
      console.warn("[Dashboard] No assigned staff with email found for patient:", selectedPatient.name);
      return;
    }

    for (const email of recipients) {
      try {
        await sendEmailMutation.mutateAsync({
          recipientEmail: email,
          subject: `[CLINICAL ALERT] ${subject} - ${selectedPatient.name}`,
          message: `
Patient: ${selectedPatient.name}
Room: ${selectedPatient.roomId}
Time: ${new Date().toLocaleString()}

Alert Details:
${message}

Please check the monitoring dashboard immediately.
          `.trim()
        });
      } catch (e) {
        console.error("Failed to send email alert:", e);
      }
    }
  };

  const checkThresholds = (vitals: VitalsData | null, room: RoomData | null) => {
    if (!vitals && !room) return;
    
    const now = Date.now();
    const alertThrottle = 10000; // 10 seconds between same alert type

    if (vitals) {
      if (vitals.heartRate > thresholds.hrMax && (now - (lastEventTimeRef.current['hr-high'] || 0) > alertThrottle)) {
        toast.error(`Critical Heart Rate: ${vitals.heartRate} BPM (High)`, { duration: 5000 });
        if (now - (lastEmailTimeRef.current['hr-high'] || 0) > EMAIL_COOLDOWN) {
          sendEmailAlert("Critical Heart Rate", `Heart rate reached ${vitals.heartRate} BPM, exceeding the safe limit of ${thresholds.hrMax} BPM.`);
          lastEmailTimeRef.current['hr-high'] = now;
        }
        lastEventTimeRef.current['hr-high'] = now;
      }
      if (vitals.heartRate < thresholds.hrMin && (now - (lastEventTimeRef.current['hr-low'] || 0) > alertThrottle)) {
        toast.error(`Critical Heart Rate: ${vitals.heartRate} BPM (Low)`, { duration: 5000 });
        if (now - (lastEmailTimeRef.current['hr-low'] || 0) > EMAIL_COOLDOWN) {
          sendEmailAlert("Critical Heart Rate", `Heart rate dropped to ${vitals.heartRate} BPM, below the safe limit of ${thresholds.hrMin} BPM.`);
          lastEmailTimeRef.current['hr-low'] = now;
        }
        lastEventTimeRef.current['hr-low'] = now;
      }
      if (vitals.spO2 < thresholds.spo2Min && (now - (lastEventTimeRef.current['spo2-low'] || 0) > alertThrottle)) {
        toast.error(`Low Oxygen Saturation: ${vitals.spO2}%`, { duration: 5000 });
        if (now - (lastEmailTimeRef.current['spo2-low'] || 0) > EMAIL_COOLDOWN) {
          sendEmailAlert("Critical SpO2 Level", `Oxygen saturation dropped to ${vitals.spO2}%, which is below the safe threshold of ${thresholds.spo2Min}%.`);
          lastEmailTimeRef.current['spo2-low'] = now;
        }
        lastEventTimeRef.current['spo2-low'] = now;
      }
    }

    if (room) {
      if (room.temperature > thresholds.tempMax && (now - (lastEventTimeRef.current['temp-high'] || 0) > alertThrottle)) {
        toast.warning(`High Room Temperature: ${room.temperature}°C`, { duration: 5000 });
        lastEventTimeRef.current['temp-high'] = now;
      }
      if (room.temperature < thresholds.tempMin && (now - (lastEventTimeRef.current['temp-low'] || 0) > alertThrottle)) {
        toast.warning(`Low Room Temperature: ${room.temperature}°C`, { duration: 5000 });
        lastEventTimeRef.current['temp-low'] = now;
      }
    }
  };
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventTimeRef = useRef<{ [key: string]: number }>({});
  const lastEmailTimeRef = useRef<{ [key: string]: number }>({});
  const lastFaceSeenTimeRef = useRef<number>(0);

  // Alert Stabilization Counters
  const absenceCounterRef = useRef<number>(0);
  const unknownCounterRef = useRef<{ [key: string]: number }>({});
  const unauthCounterRef = useRef<{ [key: string]: number }>({});

  const EMAIL_COOLDOWN = 15 * 60 * 1000; // 15 minutes
  const STABILITY_THRESHOLD = 5; // Must be consistent for 5 frames (~3 seconds)

  const { modelsLoaded, detectFaces, findBestMatch } = useFaceDetection();

  // Refs to always give the detection interval fresh values without
  // restarting the camera when patient/assignment data changes.
  const selectedPatientRef = useRef<typeof selectedPatient | undefined>(undefined);
  const knownPeopleRef = useRef<typeof people>([]);
  const enrolledDescriptorsRef = useRef<Float32Array[]>([]);

  // Prepare the dataset of known faces and their descriptors
  const { knownPeople, enrolledDescriptors } = useMemo(() => {
    if (!people) {
      console.log("[Dashboard] People query returned no data yet");
      return { knownPeople: [], enrolledDescriptors: [] };
    }
    
    const kp: typeof people = [];
    const ed: Float32Array[] = [];
    
    console.log(`[Dashboard] Processing ${people.length} total people for recognition...`);

    people.forEach(p => {
      const desc = p.enrolledFaceDescriptor;
      if (!desc) return;

      let descriptor: Float32Array | null = null;
      
      try {
        // Case 1: TRPC/JSON serialized Buffer: { type: 'Buffer', data: [...] }
        if (typeof desc === 'object' && desc !== null && 'data' in desc && Array.isArray((desc as any).data)) {
          const uint8 = new Uint8Array((desc as any).data);
          const ab = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
          descriptor = new Float32Array(ab);
        } 
        // Case 2: Already a TypedArray or Buffer instance
        else if (desc instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(desc))) {
          const uint8 = new Uint8Array(desc as any);
          const ab = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
          descriptor = new Float32Array(ab);
        }
        // Case 3: Plain array of numbers
        else if (Array.isArray(desc)) {
          descriptor = new Float32Array(desc as number[]);
        }
        // Case 4: JSON string — could be "[0.12, ...]" or {"0":0.12,"1":...} (Float32Array serialised by MySQL)
        else if (typeof desc === 'string') {
          const parsed = JSON.parse(desc);
          if (Array.isArray(parsed)) {
            // Clean array: "[0.12, -0.34, ...]"
            descriptor = new Float32Array(parsed);
          } else if (parsed && typeof parsed === 'object' && 'data' in parsed && Array.isArray((parsed as any).data)) {
            // Stringified Buffer object: { type: 'Buffer', data: [...] }
            const uint8 = new Uint8Array((parsed as any).data);
            const ab = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
            descriptor = new Float32Array(ab);
          } else if (parsed && typeof parsed === 'object') {
            // Float32Array serialised by MySQL as {"0": x, "1": y, ...}
            const values = Object.values(parsed) as number[];
            descriptor = new Float32Array(values);
          }
        }
      } catch (e) {
        console.error(`[Dashboard] Failed to parse descriptor for ${p.name}:`, e);
      }
      
      if (descriptor && descriptor.length === 128) {
        kp.push(p);
        ed.push(descriptor);
      } else if (descriptor) {
        console.warn(`[Dashboard] Person ${p.name} has invalid descriptor length: ${descriptor.length}`);
      }
    });
    
    console.log(`[Dashboard] Successfully loaded ${kp.length} identities into neural engine`);
    return { knownPeople: kp, enrolledDescriptors: ed };
  }, [people]);

  const selectedPatient = people?.find((p) => String(p.id) === selectedPatientId);

  // Keep the refs in sync with the latest state/derived values so the
  // detection interval always reads up-to-date data.
  useEffect(() => {
    selectedPatientRef.current = selectedPatient;
  }, [selectedPatient]);

  useEffect(() => {
    knownPeopleRef.current = knownPeople;
    enrolledDescriptorsRef.current = enrolledDescriptors;
  }, [knownPeople, enrolledDescriptors]);

  // Logs history
  const [logRange, setLogRange] = useState<{start: Date | null, end: Date | null}>({start: null, end: null});
  const [vitalsLogs, setVitalsLogs] = useState<VitalsData[]>([]);
  const [roomLogs, setRoomLogs] = useState<RoomData[]>([]);

  useEffect(() => {
    if (!selectedPatient || activeTab !== "logs") return;

    // Use Firebase queries to limit data and prevent memory leaks
    let vitalsQuery = query(
      ref(database, `patients/${selectedPatient.firebaseId}`),
      orderByChild('timestamp')
    );

    if (logRange.start) {
      vitalsQuery = query(vitalsQuery, startAt(logRange.start.getTime()));
    }
    if (logRange.end) {
      vitalsQuery = query(vitalsQuery, endAt(logRange.end.getTime()));
    }

    // Always limit to the last 500 points to ensure performance
    const limitedVitalsQuery = query(vitalsQuery, limitToLast(500));

    const unsubscribeVitals = onValue(limitedVitalsQuery, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.values(snapshot.val()) as VitalsData[];
        setVitalsLogs(data.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setVitalsLogs([]);
      }
    });

    let roomQuery = query(
      ref(database, `rooms/${selectedPatient.roomId}`),
      orderByChild('timestamp')
    );

    if (logRange.start) {
      roomQuery = query(roomQuery, startAt(logRange.start.getTime()));
    }
    if (logRange.end) {
      roomQuery = query(roomQuery, endAt(logRange.end.getTime()));
    }

    const limitedRoomQuery = query(roomQuery, limitToLast(500));

    const unsubscribeRoom = onValue(limitedRoomQuery, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.values(snapshot.val()) as RoomData[];
        setRoomLogs(data.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setRoomLogs([]);
      }
    });

    return () => {
      unsubscribeVitals();
      unsubscribeRoom();
    };
  }, [selectedPatient?.id, activeTab, logRange]);

  // Firebase Realtime Subscriptions
  useEffect(() => {
    if (!selectedPatient || !selectedPatient.firebaseId) {
      setCurrentVitals(null);
      return;
    }

    const vitalsRef = ref(database, `patients/${selectedPatient.firebaseId}`);
    const unsubscribeVitals = onValue(vitalsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const entries = Object.values(data) as VitalsData[];
        if (entries.length > 0) {
          entries.sort((a, b) => b.timestamp - a.timestamp);
          const latest = entries[0];
          setCurrentVitals(latest);
          
          // Update history (keep last 20 readings)
          setVitalsHistory(prev => {
            const updated = [...prev, latest].sort((a, b) => a.timestamp - b.timestamp);
            return updated.slice(-20);
          });

          checkThresholds(latest, null);
        }
      } else {
        setCurrentVitals(null);
      }
    });

    return () => unsubscribeVitals();
  }, [selectedPatient?.firebaseId]);

  useEffect(() => {
    if (!selectedPatient || !selectedPatient.roomId) {
      setCurrentRoomData(null);
      return;
    }

    const roomRef = ref(database, `rooms/${selectedPatient.roomId}`);
    const unsubscribeRoom = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const entries = Object.values(data) as RoomData[];
        if (entries.length > 0) {
          entries.sort((a, b) => b.timestamp - a.timestamp);
          const latest = entries[0];
          setCurrentRoomData(latest);

          // Update history (keep last 20 readings)
          setRoomHistory(prev => {
            const updated = [...prev, latest].sort((a, b) => a.timestamp - b.timestamp);
            return updated.slice(-20);
          });

          checkThresholds(null, latest);
        }
      } else {
        setCurrentRoomData(null);
      }
    });

    return () => unsubscribeRoom();
  }, [selectedPatient?.roomId]);

  const startCamera = async () => {
    if (!selectedPatient?.enrolledFaceDescriptor) {
      toast.error("Patient must have enrolled face descriptor");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        startDetection();
      }
    } catch (error) {
      toast.error("Failed to access camera");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach((track) => track.stop());
      streamRef.current = null;
      setIsStreaming(false);
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setDetectionStatus("idle");
    setCurrentlyInRoom([]);
  };

  const startDetection = () => {
    if (!modelsLoaded || !selectedPatientRef.current) return;

    detectionIntervalRef.current = setInterval(async () => {
      // Always read from refs so we get the latest patient + assignments
      // even if they changed after monitoring started.
      const selectedPatient = selectedPatientRef.current;
      const knownPeople = knownPeopleRef.current ?? [];
      const enrolledDescriptors = enrolledDescriptorsRef.current;

      if (!videoRef.current || !canvasRef.current || !selectedPatient) return;

      setIsProcessing(true);
      try {
        const faces = await detectFaces(videoRef.current);
        const now = Date.now();
        const recognizedInFrame: {name: string, role: string, isAuthorized: boolean}[] = [];

        if (faces.length === 0) {
          setDetectionStatus("absent");
          setConfidenceScore(0);
          setLastDetectionTime(new Date());
          setCurrentlyInRoom([]);
        } else {
          lastFaceSeenTimeRef.current = now;
          let isPatientInFrame = false;
          let patientConfidence = 0;
          let unknownCount = 0;
          const seenIds = new Set<string>();
          const seenUnknown = { global: false };

          const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }

          for (const face of faces) {
            const match = findBestMatch(face.descriptor, enrolledDescriptors);
            let personName = "Unknown";
            let personRole = "other";
            let color = "#ef4444";

            if (match) {
              const person = knownPeople[match.index];
              personName = person.name;
              personRole = person.role;

              // Always re-compute authorization from the latest assignment
              // stored in selectedPatientRef — not from a stale closure.
              const authorizedIds = [
                selectedPatient.assignedDoctorId,
                selectedPatient.assignedNurseId,
              ].filter(Boolean);
              const isPersonAuthorized =
                person.id === selectedPatient.id ||
                authorizedIds.includes(person.id);

              if (person.id === selectedPatient.id) {
                isPatientInFrame = true;
                patientConfidence = match.confidence;
                color = "#10b981";
              } else {
                seenIds.add(person.id);

                if (!isPersonAuthorized) {
                  // Unauthorized Recognition Stabilization
                  unauthCounterRef.current[person.id] = (unauthCounterRef.current[person.id] || 0) + 1;

                  if (unauthCounterRef.current[person.id] >= STABILITY_THRESHOLD) {
                    const lastUnauthTime = lastEventTimeRef.current[`unauth-${person.id}`] || 0;
                    if (now - lastUnauthTime > 120000) {
                      await logEventMutation.mutateAsync({
                        personId: person.id,
                        eventType: "person recognized",
                        severity: "alert",
                        roomId: selectedPatient.roomId || "unknown",
                        description: `Unauthorized person ${person.name} (${person.role}) entered the room.`,
                        isAuthorized: 0,
                      });

                      if (now - (lastEmailTimeRef.current[`unauth-${person.id}`] || 0) > EMAIL_COOLDOWN) {
                        sendEmailAlert(
                          "Unauthorized Entry",
                          `${person.name} (${person.role}) has entered ${selectedPatient.name}'s room but is not assigned to this patient.`
                        );
                        lastEmailTimeRef.current[`unauth-${person.id}`] = now;
                      }
                      lastEventTimeRef.current[`unauth-${person.id}`] = now;
                    }
                  }
                } else {
                  // Reset unauth counter if person is now authorized
                  unauthCounterRef.current[person.id] = 0;
                }
              }

              recognizedInFrame.push({ name: person.name, role: person.role, isAuthorized: isPersonAuthorized });

              const lastRecTime = lastEventTimeRef.current[`rec-${person.id}`] || 0;
              if (now - lastRecTime > 120000) {
                await logEventMutation.mutateAsync({
                  personId: person.id,
                  eventType: "person recognized",
                  severity: "info",
                  roomId: selectedPatient.roomId || "unknown",
                  description: `${person.role} ${person.name} detected in room.`,
                });
                lastEventTimeRef.current[`rec-${person.id}`] = now;
              }
            } else {
              unknownCount++;
              seenUnknown.global = true;
              
              // Unknown Stabilization
              unknownCounterRef.current["global"] = (unknownCounterRef.current["global"] || 0) + 1;

              if (unknownCounterRef.current["global"] >= STABILITY_THRESHOLD) {
                const lastUnknownTime = lastEventTimeRef.current["unknown"] || 0;
                if (now - lastUnknownTime > 30000) {
                  await logEventMutation.mutateAsync({
                    eventType: "unknown person detected",
                    severity: "alert",
                    roomId: selectedPatient.roomId || "unknown",
                    description: "Unauthorized person detected in room.",
                    isAuthorized: 0
                  });

                  if (now - (lastEmailTimeRef.current['unknown'] || 0) > EMAIL_COOLDOWN) {
                    sendEmailAlert("Unknown Person Detected", `An unidentified individual has been detected in ${selectedPatient.name}'s room.`);
                    lastEmailTimeRef.current['unknown'] = now;
                  }
                  lastEventTimeRef.current["unknown"] = now;
                }
              }
            }

            if (ctx) {
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.strokeRect(face.box.x, face.box.y, face.box.width, face.box.height);
              
              ctx.fillStyle = color;
              ctx.font = "bold 16px Inter, sans-serif";
              const label = `${personName}${match ? ` (${(match.confidence * 100).toFixed(0)}%)` : ""}`;
              ctx.fillText(label, face.box.x, face.box.y - 10);
            }
          }

          // Add unknown persons to the room list
          for (let i = 0; i < unknownCount; i++) {
            recognizedInFrame.push({ name: "Unknown Person", role: "unknown", isAuthorized: false });
          }

          // Reset counters for those not seen
          for (const id in unauthCounterRef.current) {
            if (!seenIds.has(id)) unauthCounterRef.current[id] = 0;
          }
          if (!seenUnknown.global) unknownCounterRef.current["global"] = 0;

          setCurrentlyInRoom(recognizedInFrame);
          
          if (isPatientInFrame) {
            setDetectionStatus("present");
            setConfidenceScore(patientConfidence);
            absenceCounterRef.current = 0;
          } else {
            setDetectionStatus("absent");
            setConfidenceScore(0);
            
            // Patient Absence Stabilization
            absenceCounterRef.current++;
            if (absenceCounterRef.current >= STABILITY_THRESHOLD) {
              const lastAbsenceTime = lastEventTimeRef.current["absence"] || 0;
              if (now - lastAbsenceTime > 60000) {
                await logEventMutation.mutateAsync({
                  personId: selectedPatient.id,
                  eventType: "patient absent",
                  severity: "warning",
                  roomId: selectedPatient.roomId || "unknown",
                  description: "Patient not detected in camera frame",
                });
                
                if (now - (lastEmailTimeRef.current['absence'] || 0) > EMAIL_COOLDOWN) {
                  sendEmailAlert("Patient Missing", `The patient is no longer detected by the room camera. Immediate room check required.`);
                  lastEmailTimeRef.current['absence'] = now;
                }
                lastEventTimeRef.current["absence"] = now;
              }
            }
          }
          setLastDetectionTime(new Date());
        }
      } catch (err) {
        console.error("Detection error:", err);
      } finally {
        setIsProcessing(false);
      }
    }, 600);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Health Monitor</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" />
            Advanced Clinical Support System
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(user?.role === "admin" || user?.role === "doctor") && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-12 gap-2 border-slate-200 hover:bg-slate-50 shadow-sm transition-all active:scale-95 rounded-2xl">
                  <Settings2 className="w-4 h-4 text-slate-500" />
                  <span className="font-semibold text-slate-700">Thresholds</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[450px] rounded-3xl border-none shadow-2xl">
                <DialogHeader>
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                    <BellRing className="w-6 h-6 text-indigo-600" />
                  </div>
                  <DialogTitle className="text-2xl font-black text-slate-900">Monitor Thresholds</DialogTitle>
                  <DialogDescription className="text-slate-500 font-medium">
                    Define safety boundaries for automated alerting.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-6">
                  <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <HeartPulse className="w-4 h-4 text-rose-500" />
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Vital Signs</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <Label className="text-slate-600 font-bold">Heart Rate Range</Label>
                        <Badge variant="outline" className="bg-white font-mono text-indigo-600 border-indigo-100">
                          {thresholds.hrMin} - {thresholds.hrMax} BPM
                        </Badge>
                      </div>
                      <Slider 
                        defaultValue={[thresholds.hrMin, thresholds.hrMax]} 
                        max={180} min={40} step={1}
                        onValueChange={([min, max]) => setThresholds(t => ({ ...t, hrMin: min, hrMax: max }))}
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-end">
                        <Label className="text-slate-600 font-bold">Min SpO2 Level</Label>
                        <Badge variant="outline" className="bg-white font-mono text-emerald-600 border-emerald-100">
                          {thresholds.spo2Min}%
                        </Badge>
                      </div>
                      <Slider 
                        defaultValue={[thresholds.spo2Min]} 
                        max={100} min={85} step={1}
                        onValueChange={([val]) => setThresholds(t => ({ ...t, spo2Min: val }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Thermometer className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Environment</h4>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <Label className="text-slate-600 font-bold">Temperature Range</Label>
                        <Badge variant="outline" className="bg-white font-mono text-amber-600 border-amber-100">
                          {thresholds.tempMin}° - {thresholds.tempMax}°C
                        </Badge>
                      </div>
                      <Slider 
                        defaultValue={[thresholds.tempMin, thresholds.tempMax]} 
                        max={45} min={15} step={0.5}
                        onValueChange={([min, max]) => setThresholds(t => ({ ...t, tempMin: min, tempMax: max }))}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    className="w-full h-12 bg-slate-900 hover:bg-black rounded-xl font-bold" 
                    onClick={() => toast.success("Thresholds synchronized successfully")}
                  >
                    Save Monitoring Protocol
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/60 w-fit shadow-sm sticky top-4 z-50">
        <Button 
          variant={activeTab === "monitoring" ? "default" : "ghost"}
          className={`rounded-xl px-6 h-11 font-bold transition-all ${activeTab === "monitoring" ? 'bg-indigo-600 shadow-lg shadow-indigo-200 hover:bg-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
          onClick={() => setActiveTab("monitoring")}
        >
          <Monitor className="w-4 h-4 mr-2" /> Real-time Monitoring
        </Button>
        <Button 
          variant={activeTab === "camera" ? "default" : "ghost"}
          className={`rounded-xl px-6 h-11 font-bold transition-all ${activeTab === "camera" ? 'bg-indigo-600 shadow-lg shadow-indigo-200 hover:bg-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
          onClick={() => setActiveTab("camera")}
        >
          <Camera className="w-4 h-4 mr-2" /> Camera Feed
        </Button>
        <Button 
          variant={activeTab === "logs" ? "default" : "ghost"}
          className={`rounded-xl px-6 h-11 font-bold transition-all ${activeTab === "logs" ? 'bg-indigo-600 shadow-lg shadow-indigo-200 hover:bg-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
          onClick={() => setActiveTab("logs")}
        >
          <History className="w-4 h-4 mr-2" /> Historical Logs
        </Button>
      </div>

      {/* Real-time Monitoring Tab */}
      {activeTab === "monitoring" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Stats Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white border-none shadow-sm relative overflow-hidden rounded-3xl p-6 ring-1 ring-slate-100">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Heart Rate</p>
                <div className={`p-2 rounded-xl ${currentVitals && currentVitals.heartRate > thresholds.hrMax ? 'bg-rose-100 text-rose-600' : 'bg-indigo-50 text-indigo-500'}`}>
                  <HeartPulse className={`w-5 h-5 ${currentVitals && currentVitals.heartRate > thresholds.hrMax ? 'animate-pulse' : ''}`} />
                </div>
              </div>
              <div className="text-4xl font-black text-slate-900">
                {currentVitals ? `${currentVitals.heartRate}` : "--"}
                <span className="text-sm font-bold text-slate-400 ml-1.5">BPM</span>
              </div>
            </Card>

            <Card className="bg-white border-none shadow-sm relative overflow-hidden rounded-3xl p-6 ring-1 ring-slate-100">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">SpO2 Level</p>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-500">
                  <Activity className="w-5 h-5" />
                </div>
              </div>
              <div className="text-4xl font-black text-slate-900">
                {currentVitals ? `${currentVitals.spO2}` : "--"}
                <span className="text-sm font-bold text-slate-400 ml-1.5">%</span>
              </div>
            </Card>

            <Card className="bg-white border-none shadow-sm relative overflow-hidden rounded-3xl p-6 ring-1 ring-slate-100">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Room Temp</p>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-500">
                  <Thermometer className="w-5 h-5" />
                </div>
              </div>
              <div className="text-4xl font-black text-slate-900">
                {currentRoomData ? `${currentRoomData.temperature}` : "--"}
                <span className="text-sm font-bold text-slate-400 ml-1.5">°C</span>
              </div>
            </Card>

            <Card className="bg-white border-none shadow-sm relative overflow-hidden rounded-3xl p-6 ring-1 ring-slate-100">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Humidity</p>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-500">
                  <Droplets className="w-5 h-5" />
                </div>
              </div>
              <div className="text-4xl font-black text-slate-900">
                {currentRoomData ? `${currentRoomData.humidity}` : "--"}
                <span className="text-sm font-bold text-slate-400 ml-1.5">%</span>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <Tabs defaultValue="vitals" className="w-full">
                <Card className="border-none shadow-xl bg-white overflow-hidden rounded-3xl">
                  <CardHeader className="border-b border-slate-50 bg-slate-50/30 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <CardTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-indigo-500" />
                        Patient Analytics
                      </CardTitle>
                      <TabsList className="bg-slate-100/50 p-1 rounded-xl w-full md:w-auto">
                        <TabsTrigger value="vitals" className="rounded-lg font-bold">Vitals</TabsTrigger>
                        <TabsTrigger value="room" className="rounded-lg font-bold">Room</TabsTrigger>
                        <TabsTrigger value="ai" className="rounded-lg font-bold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> AI Insights
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <TabsContent value="vitals" className="m-0 focus-visible:ring-0">
                      <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={vitalsHistory}>
                            <defs>
                              <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorSpo2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="timestamp" hide />
                            <YAxis yAxisId="left" domain={[0, 180]} stroke="#6366f1" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#10b981" fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                            />
                            <Area yAxisId="left" type="monotone" dataKey="heartRate" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorHr)" name="Heart Rate" animationDuration={500} />
                            <Area yAxisId="right" type="monotone" dataKey="spO2" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSpo2)" name="SpO2" animationDuration={500} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </TabsContent>

                    <TabsContent value="room" className="m-0 focus-visible:ring-0">
                      <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={roomHistory}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="timestamp" hide />
                            <YAxis yAxisId="left" domain={[0, 60]} stroke="#f43f5e" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#3b82f6" fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                            />
                            <Line yAxisId="left" type="monotone" dataKey="temperature" stroke="#f43f5e" strokeWidth={4} dot={false} name="Temp (°C)" animationDuration={1000} />
                            <Line yAxisId="right" type="monotone" dataKey="humidity" stroke="#3b82f6" strokeWidth={4} dot={false} name="Humidity (%)" animationDuration={1000} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </TabsContent>

                    <TabsContent value="ai" className="m-0 focus-visible:ring-0">
                      {selectedPatient && vitalsHistory.length >= 5 ? (
                        <div className="space-y-4">
                          {/* Current status banner */}
                          <div className={`p-5 rounded-2xl border-2 transition-all ${
                            aiInsights?.data?.status === 'critical' ? 'bg-red-50 border-red-100 shadow-sm shadow-red-100' : 
                            aiInsights?.data?.status === 'warning' ? 'bg-amber-50 border-amber-100 shadow-sm shadow-amber-100' : 
                            'bg-indigo-50 border-indigo-100 shadow-sm shadow-indigo-100'
                          }`}>
                            <div className="flex items-center gap-3 mb-2">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md ${
                                aiInsights?.data?.status === 'critical' ? 'bg-red-500 shadow-red-200' : 
                                aiInsights?.data?.status === 'warning' ? 'bg-amber-500 shadow-amber-200' : 
                                'bg-indigo-500 shadow-indigo-200'
                              }`}>
                                <Sparkles className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Analysis</p>
                                <p className="text-base font-black capitalize">{aiInsights?.data?.status || 'Analyzing...'}</p>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed font-semibold italic">
                              "{aiInsights?.data?.insight || "Generating clinical insights..."}"
                            </p>
                          </div>

                          {/* Persistent insight history list */}
                          {insightHistory.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Insight History</p>
                              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                                {insightHistory.map((entry, i) => (
                                  <div
                                    key={i}
                                    className={`flex gap-3 p-3.5 rounded-xl border text-sm transition-all ${
                                      entry.status === 'critical' ? 'bg-red-50 border-red-100' :
                                      entry.status === 'warning'  ? 'bg-amber-50 border-amber-100' :
                                      'bg-slate-50 border-slate-100'
                                    }`}
                                  >
                                    <div className={`w-2 shrink-0 rounded-full mt-1 self-stretch ${
                                      entry.status === 'critical' ? 'bg-red-400' :
                                      entry.status === 'warning'  ? 'bg-amber-400' :
                                      'bg-indigo-400'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                                          entry.status === 'critical' ? 'text-red-600' :
                                          entry.status === 'warning'  ? 'text-amber-600' :
                                          'text-indigo-600'
                                        }`}>{entry.status}</span>
                                        <span className="text-[10px] font-medium text-slate-400 shrink-0">
                                          {entry.timestamp.toLocaleTimeString()}
                                        </span>
                                      </div>
                                      <p className="text-slate-600 font-medium leading-snug">{entry.insight}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <Activity className="w-8 h-8 text-slate-400" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900">Baseline Analysis</h3>
                          <p className="text-sm text-slate-500 max-w-xs mt-2 font-medium"> Establish a 5-minute data baseline to activate AI diagnostics.</p>
                        </div>
                      )}
                    </TabsContent>
                  </CardContent>
                </Card>
              </Tabs>
            </div>

            {/* Right Column: Presence & Room Staff */}
            <div className="lg:col-span-4 space-y-6">
              <Card className={`border-none shadow-lg transition-all duration-500 rounded-3xl ${
                detectionStatus === 'present' ? 'bg-emerald-50 ring-1 ring-emerald-200' : 
                detectionStatus === 'absent' && isStreaming ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-white ring-1 ring-slate-100'
              }`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">Patient Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 py-2">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                      detectionStatus === 'present' ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-200' :
                      detectionStatus === 'absent' && isStreaming ? 'bg-amber-500 text-white shadow-xl shadow-amber-200' :
                      'bg-slate-100 text-slate-400'
                    }`}>
                      {detectionStatus === 'present' ? <CheckCircle className="w-7 h-7" /> :
                       detectionStatus === 'absent' && isStreaming ? <Clock className="w-7 h-7" /> :
                       <Camera className="w-7 h-7" />}
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-slate-900 leading-tight">
                        {detectionStatus === 'present' ? "Present" :
                         detectionStatus === 'absent' && isStreaming ? "Absent" : "Standby"}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {isStreaming ? `Monitoring Room ${selectedPatient?.roomId || '...'}` : "Camera Standby"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg rounded-3xl ring-1 ring-slate-100">
                <CardHeader className="pb-3 border-b border-slate-50">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center justify-between">
                    Room Occupancy
                    <Users className="w-4 h-4 text-indigo-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 px-4">
                  <div className="space-y-3">
                    {currentlyInRoom.length > 0 ? (
                      currentlyInRoom.map((p, i) => (
                        <div key={i} className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all animate-in slide-in-from-right-2 duration-300 ${
                          p.isAuthorized ? 'bg-slate-50/50 border-slate-100' : 'bg-rose-50 border-rose-100'
                        }`} style={{animationDelay: `${i * 100}ms`}}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm ${
                            !p.isAuthorized ? 'bg-rose-500' :
                            p.role === 'doctor' ? 'bg-indigo-500' : 
                            p.role === 'nurse' ? 'bg-emerald-500' : 
                            p.role === 'patient' ? 'bg-slate-900' :
                            'bg-slate-400'
                          }`}>
                            {!p.isAuthorized ? <AlertCircle className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className={`text-sm font-bold ${p.isAuthorized ? 'text-slate-900' : 'text-rose-900'}`}>{p.name}</p>
                              {!p.isAuthorized && (
                                <Badge variant="destructive" className="text-[8px] h-4 px-1 rounded-sm uppercase font-black">Warning</Badge>
                              )}
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">{p.role}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 opacity-30">
                        <User className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Room Vacant</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Camera Feed Tab (Always mounted but hidden when not active) */}
      <div className={`animate-in fade-in slide-in-from-bottom-4 duration-500 ${activeTab === "camera" ? 'block' : 'hidden'}`}>
        <Card className="border-none shadow-2xl overflow-hidden bg-slate-900 ring-1 ring-slate-800 rounded-[2.5rem]">
          <div className="relative aspect-video lg:aspect-[21/9] group">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            
            {!isStreaming && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
                <div className="text-center">
                  <div className="w-24 h-24 bg-slate-800/50 rounded-3xl flex items-center justify-center mx-auto mb-8 ring-1 ring-white/10 shadow-2xl">
                    <Camera className="w-12 h-12 text-indigo-400" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3">Feed Inactive</h3>
                  <p className="text-slate-400 max-w-sm mx-auto font-medium">Connect to the room camera to enable AI-powered patient monitoring and security recognition.</p>
                </div>
              </div>
            )}

            {isStreaming && (
              <div className="absolute top-6 left-6 flex gap-3">
                <div className="bg-black/60 backdrop-blur-xl text-white px-4 py-2 rounded-2xl text-[10px] font-black tracking-widest flex items-center gap-2.5 border border-white/10 shadow-2xl">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                  LIVE TRANSMISSION
                </div>
                {isProcessing && (
                  <div className="bg-indigo-600/80 backdrop-blur-xl text-white px-4 py-2 rounded-2xl text-[10px] font-black tracking-widest flex items-center gap-2.5 border border-indigo-400/20 shadow-2xl">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    AI ENGINE ACTIVE
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="p-8 bg-white border-t border-slate-100">
            <div className="flex flex-col lg:flex-row gap-6 items-end">
              <div className="flex-1 w-full space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Patient Monitor Target</label>
                <Select value={selectedPatientId} onValueChange={setSelectedPatientId} disabled={isStreaming}>
                  <SelectTrigger className="h-14 border-slate-200 focus:ring-indigo-500 rounded-2xl shadow-sm bg-slate-50/50">
                    <SelectValue placeholder="Choose a patient to initialize feed..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-slate-100 shadow-2xl p-2">
                    {people?.filter(p => p.role === 'patient').map((patient) => (
                      <SelectItem key={patient.id} value={String(patient.id)} className="rounded-xl h-12">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">
                            {patient.roomId}
                          </div>
                          <span className="font-bold text-slate-700">{patient.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 w-full lg:w-auto">
                <Button
                  onClick={startCamera}
                  disabled={isStreaming || !selectedPatientId || !modelsLoaded || !selectedPatient?.enrolledFaceDescriptor}
                  className="h-14 px-10 bg-slate-900 hover:bg-black shadow-xl shadow-slate-200 transition-all active:scale-95 rounded-2xl font-black tracking-wide"
                >
                  <Camera className="w-5 h-5 mr-3" />
                  Link Stream
                </Button>
                <Button
                  onClick={stopCamera}
                  disabled={!isStreaming}
                  variant="outline"
                  className="h-14 px-8 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 text-slate-600 rounded-2xl font-bold transition-all"
                >
                  Terminate
                </Button>
              </div>
            </div>
            {!selectedPatient?.enrolledFaceDescriptor && selectedPatientId && (
              <div className="mt-6 p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3 text-rose-600 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-bold">Biometric Profile Missing: This patient cannot be recognized until a facial scan is enrolled in the Patients section.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Historical Logs Tab */}
      {activeTab === "logs" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="border-none shadow-sm bg-white p-6 rounded-3xl ring-1 ring-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Historical Insights</h3>
                <p className="text-slate-500 font-semibold mt-1">Analyze patient data trends over time.</p>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                <Filter className="w-4 h-4 text-slate-400 ml-2" />
                <DateRangeFilter onDateRangeChange={(start, end) => setLogRange({ start, end })} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6">
            <Card className="border-none shadow-xl bg-white overflow-hidden rounded-[2rem] ring-1 ring-slate-100">
              <CardHeader className="p-8 pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
                      <HeartPulse className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-black text-slate-900">Vitals History</CardTitle>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Heart Rate vs Oxygen Saturation</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-indigo-500" />
                      <span className="text-xs font-bold text-slate-600">HR (BPM)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-slate-600">SpO2 (%)</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 pt-4">
                <div className="h-[450px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={vitalsLogs}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="timestamp" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        axisLine={false} 
                        tickLine={false}
                        tickFormatter={(t) => new Date(t).toLocaleDateString() + ' ' + new Date(t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        minTickGap={50}
                      />
                      <YAxis yAxisId="left" stroke="#6366f1" fontSize={10} axisLine={false} tickLine={false} domain={[40, 180]} />
                      <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={10} axisLine={false} tickLine={false} domain={[80, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)' }}
                        labelFormatter={(t) => new Date(t).toLocaleString()}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="heartRate" stroke="#6366f1" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} name="Heart Rate" animationDuration={1500} />
                      <Line yAxisId="right" type="monotone" dataKey="spO2" stroke="#10b981" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} name="SpO2" animationDuration={1500} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl bg-white overflow-hidden rounded-[2rem] ring-1 ring-slate-100">
              <CardHeader className="p-8 pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
                      <Thermometer className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-black text-slate-900">Environment History</CardTitle>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Temperature vs Humidity</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-xs font-bold text-slate-600">Temp (°C)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-xs font-bold text-slate-600">Humidity (%)</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 pt-4">
                <div className="h-[450px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roomLogs}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="timestamp" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        axisLine={false} 
                        tickLine={false}
                        tickFormatter={(t) => new Date(t).toLocaleDateString() + ' ' + new Date(t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        minTickGap={50}
                      />
                      <YAxis yAxisId="left" stroke="#f59e0b" fontSize={10} axisLine={false} tickLine={false} domain={[15, 45]} />
                      <YAxis yAxisId="right" orientation="right" stroke="#0ea5e9" fontSize={10} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)' }}
                        labelFormatter={(t) => new Date(t).toLocaleString()}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="temperature" stroke="#f59e0b" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} name="Temperature" animationDuration={1500} />
                      <Line yAxisId="right" type="monotone" dataKey="humidity" stroke="#0ea5e9" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} name="Humidity" animationDuration={1500} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>

  );
}

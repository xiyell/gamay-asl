"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  Moon, Sun, Info, ScanFace, Activity, Lock, RefreshCcw,
  Settings2, Trash2, Volume2, VolumeX, Brain, List, Search,
  Mic, MicOff, Database, Plus, Save, Cpu, Layers, Delete
} from "lucide-react";

// --- Types ---

interface Landmark { x: number; y: number; z: number; }
interface Sample { label: string; landmarks: Landmark[]; }
interface TrainingSample { label: string; vector: number[]; }
interface CameraSettings { brightness: number; contrast: number; saturation: number; }
interface GestureLibraryItem {
  emoji: string;
  title: string;
  description: string;
  image: string;
}
interface VideoStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  detectedLabel: string;
  confidence: number;
  isLocked: boolean;
  settings: CameraSettings;
  isScanning: boolean;
}

// --- Inline UI Components ---

const Card = ({ className, children }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className || ""}`}>{children}</div>
);

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "destructive" | "outline" | "secondary" | "ghost", size?: "default" | "sm" | "icon" | "lg" }>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
      outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground"
    };
    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      icon: "h-10 w-10",
      lg: "h-14 px-8 text-lg"
    };
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 touch-manipulation ${variants[variant]} ${sizes[size]} ${className || ""}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
        ref={ref}
        {...props}
      />
    )
  }
);
Input.displayName = "Input";

const Separator = ({ className, orientation = "horizontal" }: { className?: string, orientation?: "horizontal" | "vertical" }) => (
  <div className={`shrink-0 bg-border ${orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]'} ${className || ""}`} />
);

const Slider = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      type="range"
      className={`w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary ${className || ""}`}
      ref={ref}
      {...props}
    />
  )
);
Slider.displayName = "Slider";

// --- Internal Components & Hooks ---

function ModeToggle() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(prefersDark);
    if (prefersDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  };
  return (
    <Button variant="outline" size="icon" onClick={toggleTheme} title="Toggle Dark/Light Mode">
      {isDark ? <Moon className="h-[1.2rem] w-[1.2rem] text-yellow-300" /> : <Sun className="h-[1.2rem] w-[1.2rem] text-orange-500" />}
    </Button>
  );
}

// --- SAFE IMAGE COMPONENT ---
const SignImage = ({ url, alt, emoji, className }: { url?: string, alt: string, emoji: string, className?: string }) => {
  const [error, setError] = useState(false);

  if (!url || error) {
    return (
      <div className={`flex items-center justify-center select-none bg-muted/20 rounded-md ${className}`}>
        <span className="leading-none" style={{ fontSize: '100%' }}>{emoji}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={`${className} object-contain min-w-[50px] min-h-[50px] block w-full h-full filter grayscale contrast-125 dark:invert drop-shadow-xl hover:scale-110 transition-transform duration-200`}
      onError={() => setError(true)}
    />
  );
};

// --- GESTURE LIBRARY ---
const GESTURE_LIBRARY: Record<string, GestureLibraryItem> = {
  "A": { emoji: "✊", title: "A", description: "Fist, thumb on side.", image: "/gesture/A-removebg-preview.png" },
  "B": { emoji: "✋", title: "B", description: "Flat hand, thumb tucked.", image: "/gesture/B-removebg-preview.png" },
  "C": { emoji: "🫳", title: "C", description: "Hand curved like a cup.", image: "/gesture/C-removebg-preview.png" },
  "D": { emoji: "☝️", title: "D", description: "Index up, others touching.", image: "/gesture/D-removebg-preview.png" },
  "E": { emoji: "👊", title: "E", description: "Fingers curled, thumb low.", image: "/gesture/E-removebg-preview.png" },
  "F": { emoji: "👌", title: "F", description: "Thumb & Index touching.", image: "/gesture/F-removebg-preview.png" },
  "G": { emoji: "👈", title: "G", description: "Pointing sideways.", image: "/gesture/G-removebg-preview.png" },
  "H": { emoji: "✌️", title: "H", description: "Two fingers sideways.", image: "/gesture/H-removebg-preview.png" },
  "I": { emoji: "🤙", title: "I", description: "Pinky straight up.", image: "/gesture/I-removebg-preview.png" },
  "J": { emoji: "🤙", title: "J", description: "Pinky swooping (Motion).", image: "/gesture/J-removebg-preview.png" },
  "K": { emoji: "🤞", title: "K", description: "Thumb between Index & Middle.", image: "/gesture/K-removebg-preview.png" },
  "L": { emoji: "👆", title: "L", description: "L shape with thumb/index.", image: "/gesture/L-removebg-preview.png" },
  "M": { emoji: "👊", title: "M", description: "Thumb under 3 fingers.", image: "/gesture/M-removebg-preview.png" },
  "N": { emoji: "👊", title: "N", description: "Thumb under 2 fingers.", image: "/gesture/N-removebg-preview.png" },
  "O": { emoji: "👌", title: "O", description: "Fingers and thumb touch.", image: "/gesture/O-removebg-preview.png" },
  "P": { emoji: "👇", title: "P", description: "Index down, middle down.", image: "/gesture/P-removebg-preview.png" },
  "Q": { emoji: "👇", title: "Q", description: "Index/Thumb down.", image: "/gesture/Q-removebg-preview.png" },
  "R": { emoji: "🤞", title: "R", description: "Index/Middle crossed.", image: "/gesture/R-removebg-preview.png" },
  "S": { emoji: "✊", title: "S", description: "Fist, thumb OVER fingers.", image: "/gesture/S-removebg-preview.png" },
  "T": { emoji: "✊", title: "T", description: "Thumb under Index.", image: "/gesture/T-removebg-preview.png" },
  "U": { emoji: "✌️", title: "U", description: "Index/Middle together.", image: "/gesture/U-removebg-preview.png" },
  "V": { emoji: "✌️", title: "V", description: "Index/Middle spread.", image: "/gesture/V-removebg-preview.png" },
  "W": { emoji: "🤟", title: "W", description: "3 Fingers spread.", image: "/gesture/W-removebg-preview.png" },
  "X": { emoji: "☝️", title: "X", description: "Index hooked.", image: "/gesture/X-removebg-preview.png" },
  "Y": { emoji: "🤙", title: "Y", description: "Thumb & Pinky out.", image: "/gesture/Y-removebg-preview.png" },
  "Z": { emoji: "☝️", title: "Z", description: "Index draws Z (Motion).", image: "/gesture/z-removebg-preview.png" },
  "1": { emoji: "☝️", title: "1", description: "Index up.", image: "/gesture/1-removebg-preview.png" },
  "2": { emoji: "✌️", title: "2", description: "Index/Middle up.", image: "/gesture/2-removebg-preview.png" },
  "3": { emoji: "🤟", title: "3", description: "Thumb/Index/Middle.", image: "/gesture/3-removebg-preview.png" },
  "4": { emoji: "🖐", title: "4", description: "4 Fingers, thumb tucked.", image: "/gesture/4-removebg-preview.png" },
  "5": { emoji: "✋", title: "5", description: "All fingers spread.", image: "/gesture/5-removebg-preview.png" },
  "I Love You": { emoji: "🤘", title: "ILU", description: "Thumb, Index, Pinky.", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Sign_language_I_love_you.svg/228px-Sign_language_I_love_you.svg.png" },
  "OK": { emoji: "👌", title: "OK", description: "Thumb/Index ring.", image: "/gesture/F-removebg-preview.png" }
};

// --- Advanced Math Helpers ---
const dist = (p1: Landmark, p2: Landmark) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const getFingerState = (landmarks: Landmark[], fingerName: string) => {
  const fingerMap: Record<string, number> = {
    "Index": 1, "Middle": 2, "Ring": 3, "Pinky": 4,
  };
  const idx = fingerMap[fingerName];
  const tip = landmarks[idx * 4 + 4];
  const pip = landmarks[idx * 4 + 2];
  const wrist = landmarks[0];
  // Strict extension check (Tip must be further from wrist than PIP)
  return dist(tip, wrist) > dist(pip, wrist) * 1.25;
};

const isThumbExtended = (landmarks: Landmark[]) => {
  const thumbTip = landmarks[4];
  const thumbIP = landmarks[3];
  const thumbMCP = landmarks[2];
  const pinkyMCP = landmarks[17];

  // Check 1: Distance from palm (Pinky base)
  const isFarFromPalm = dist(thumbTip, pinkyMCP) > dist(thumbMCP, pinkyMCP) * 1.4;
  // Check 2: Straightness of thumb
  const isStraight = dist(thumbTip, thumbMCP) > dist(thumbIP, thumbMCP) * 1.05;

  return isFarFromPalm && isStraight;
};

// --- SMART RECOGNITION LOGIC (REFINED v4) ---
const recognizeGeometricGesture = (landmarks: Landmark[]) => {
  if (!landmarks || landmarks.length === 0) return null;

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const indexPIP = landmarks[6];
  const indexMCP = landmarks[5];
  const middleTip = landmarks[12];
  const middleMCP = landmarks[9];
  const ringTip = landmarks[16];
  const ringMCP = landmarks[13];
  const pinkyTip = landmarks[20];
  const pinkyMCP = landmarks[17];

  const indexExt = getFingerState(landmarks, "Index");
  const middleExt = getFingerState(landmarks, "Middle");
  const ringExt = getFingerState(landmarks, "Ring");
  const pinkyExt = getFingerState(landmarks, "Pinky");
  const thumbExt = isThumbExtended(landmarks);

  // 1. "OK" (Priority)
  // Index and Thumb touching, others extended
  if (middleExt && ringExt && pinkyExt) {
    if (dist(thumbTip, indexTip) < 0.05) return "OK";
  }

  // 2. "C" vs "O" (Curved Hand)
  // Fingers are NOT fully extended, but not fully closed
  if (!middleExt && !ringExt && !pinkyExt) {
    const thumbIndexDist = dist(thumbTip, indexTip);
    const handOpenness = dist(indexTip, wrist);

    // Check if fingers are curved (Tip roughly same distance to wrist as MCP)
    const isCurved = dist(indexTip, wrist) < dist(indexMCP, wrist) * 1.5;

    if (isCurved) {
      if (thumbIndexDist < 0.05) return "O"; // Closed loop
      if (thumbIndexDist > 0.05 && thumbIndexDist < 0.18) return "C"; // Open C
    }
  }

  // 3. One Finger Up Group (1, D, L, Z)
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    if (thumbExt) return "L";

    // D: Thumb touches Middle/Ring tip
    if (dist(thumbTip, middleTip) < 0.06 || dist(thumbTip, ringTip) < 0.06) return "D";

    // Z: Handled by motion, but static Z is basically a 1
    return "1";
  }

  // 4. Two Fingers Up Group (2, V, R, U, K)
  if (indexExt && middleExt && !ringExt && !pinkyExt) {

    // K Check: Thumb pushed UP between index and middle
    if (thumbTip.y < indexMCP.y && dist(thumbTip, indexPIP) < 0.08) {
      return "K";
    }

    // R Check: Fingers Crossed
    // Logic: Compare X distance. If Index X > Middle X (for right hand), they are crossed.
    // We use absolute difference logic to account for handedness implicitly via relative positions
    const tipDiffX = indexTip.x - middleTip.x;
    const mcpDiffX = indexMCP.x - middleMCP.x;

    // If the sign flips between knuckles and tips, they are crossed
    if (Math.sign(tipDiffX) !== Math.sign(mcpDiffX) && Math.abs(tipDiffX) > 0.015) {
      return "R";
    }

    // U Check: Fingers parallel and touching
    if (dist(indexTip, middleTip) < 0.045) return "U";

    // V / 2 Check: Fingers spread
    // 3 Check override: If thumb is OUT, it implies 3
    if (thumbExt) return "3";

    return "2";
  }

  // 5. Three Fingers Up Group (W, 3)
  if (indexExt && middleExt && ringExt && !pinkyExt) {
    return "W"; // Standard W
  }

  // 3: Thumb, Index, Middle (Thumb must be clearly out)
  if (thumbExt && indexExt && middleExt && !ringExt && !pinkyExt) {
    return "3";
  }

  // 6. Pinky Only (I, J, Y)
  if (!indexExt && !middleExt && !ringExt && pinkyExt) {
    if (thumbExt) return "Y"; // Phone gesture
    return "I"; // Static I. (J is handled by motion)
  }

  // 7. I Love You (Thumb, Index, Pinky)
  if (thumbExt && indexExt && !middleExt && !ringExt && pinkyExt) {
    return "I Love You";
  }

  // 8. Four/Five Fingers (4, 5)
  if (indexExt && middleExt && ringExt && pinkyExt) {
    // 4: Thumb tucked inside palm (Tip close to Index MCP)
    if (!thumbExt || dist(thumbTip, indexMCP) < 0.08) return "4";
    return "5";
  }

  // 9. The Fist Group (A, E, S, T, M, N)
  // All fingers curled
  if (!indexExt && !middleExt && !ringExt && !pinkyExt) {

    // E: Thumb curled, tips touching palm
    // Thumb tip is vertically similar to Index MCP, but pulled in
    if (thumbTip.y > indexMCP.y && dist(thumbTip, indexMCP) < 0.1) return "E";

    // S: Thumb WRAPPED over fingers (Crosses Middle Finger MCP)
    if (Math.abs(thumbTip.x - middleMCP.x) < 0.05 && thumbTip.y < indexMCP.y) return "S";

    // T: Thumb tucked UNDER Index finger (Between Index/Middle)
    // Thumb tip is close to Index MCP/PIP
    if (dist(thumbTip, indexMCP) < 0.06) return "T";

    // M: Thumb under 3 fingers (Tip past Ring Finger)
    // Compare X coordinates
    if ((thumbTip.x > ringMCP.x && wrist.x < ringMCP.x) || (thumbTip.x < ringMCP.x && wrist.x > ringMCP.x)) return "M";

    // N: Thumb under 2 fingers (Tip past Middle Finger)
    if ((thumbTip.x > middleMCP.x && wrist.x < middleMCP.x) || (thumbTip.x < middleMCP.x && wrist.x > middleMCP.x)) return "N";

    // A: Thumb on the side, vertical
    // Default fist state
    return "A";
  }

  return null;
};

// --- KNN Logic ---
const calculateEuclideanDistance = (v1: number[], v2: number[]): number => {
  if (v1.length !== v2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) sum += Math.pow(v1[i] - v2[i], 2);
  return Math.sqrt(sum);
};

const K = 5;

const predictKNN = (inputVector: number[], trainingData: TrainingSample[]): { label: string, confidence: number } | null => {
  if (trainingData.length === 0 || inputVector.length === 0) return null;
  const distances = trainingData.map(sample => ({
    label: sample.label,
    distance: calculateEuclideanDistance(inputVector, sample.vector)
  }));
  distances.sort((a, b) => a.distance - b.distance);
  const neighbors = distances.slice(0, Math.min(K, trainingData.length));
  const votes: Record<string, { weight: number, count: number }> = {};
  let totalWeight = 0;
  neighbors.forEach(n => {
    const weight = 1 / (n.distance + 0.0001);
    if (!votes[n.label]) votes[n.label] = { weight: 0, count: 0 };
    votes[n.label].weight += weight;
    votes[n.label].count += 1;
    totalWeight += weight;
  });
  let winner: string | null = null;
  let maxWeight = -Infinity;
  Object.keys(votes).forEach(label => {
    if (votes[label].weight > maxWeight) {
      maxWeight = votes[label].weight;
      winner = label;
    }
  });
  if (!winner) return null;
  const confidence = totalWeight > 0 ? (maxWeight / totalWeight) : 0;
  return { label: winner, confidence: Math.min(confidence * 100, 100) };
};

// --- Drawing Helper ---
const drawLandmarks = (ctx: CanvasRenderingContext2D | null, landmarks: Landmark[]) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineWidth = 2;
  const connections = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  ctx.strokeStyle = "#00FF00";
  connections.forEach(([i, j]) => {
    ctx.beginPath();
    ctx.moveTo(landmarks[i].x * ctx.canvas.width, landmarks[i].y * ctx.canvas.height);
    ctx.lineTo(landmarks[j].x * ctx.canvas.width, landmarks[j].y * ctx.canvas.height);
    ctx.stroke();
  });
  landmarks.forEach((p, i) => {
    const x = p.x * ctx.canvas.width;
    const y = p.y * ctx.canvas.height;
    ctx.fillStyle = (i % 4 === 0 && i !== 0) ? "#FFFF00" : "#FF0000";
    ctx.strokeStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, (i % 4 === 0 && i !== 0) ? 5 : 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });
};

// --- useLandmarker Hook ---

function useLandmarker({
  videoRef,
  canvasRef,
  onFrameProcessed
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onFrameProcessed: (vector: number[], rawData: Landmark[]) => void
}) {
  const [status, setStatus] = useState("Loading Model...");
  const [isScanning, setIsScanning] = useState(false);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number | null>(null);
  const onFrameProcessedRef = useRef(onFrameProcessed);

  const lastPredictionTime = useRef(0);
  const PREDICTION_INTERVAL = 50;

  useEffect(() => {
    onFrameProcessedRef.current = onFrameProcessed;
  }, [onFrameProcessed]);

  const extractVector = (landmarks: Landmark[]) => {
    return landmarks.flatMap(p => [p.x, p.y, p.z]);
  };

  const predictWebcam = useCallback(() => {
    if (!landmarkerRef.current || !videoRef.current || !canvasRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const now = Date.now();
    if (now - lastPredictionTime.current < PREDICTION_INTERVAL) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    lastPredictionTime.current = now;
    setIsScanning(true);
    const startTimeMs = performance.now();
    try {
      if (landmarkerRef.current) {
        const results = landmarkerRef.current.detectForVideo(video, startTimeMs);
        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0] as Landmark[];
          drawLandmarks(ctx, landmarks);
          const vector = extractVector(landmarks);
          onFrameProcessedRef.current(vector, landmarks);
        } else {
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          onFrameProcessedRef.current([], []);
        }
      }
    } catch (e) {
      console.warn(e);
    }
    setTimeout(() => setIsScanning(false), 50);
    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [videoRef, canvasRef]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isCancelled = false;
    const initLandmarker = async () => {
      if (typeof window === 'undefined' || !navigator.mediaDevices) return;
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        if (!isCancelled) setStatus("Starting Camera...");
        startCamera();
      } catch (error) {
        console.error(error);
        if (!isCancelled) setStatus("Failed to load AI.");
      }
    };
    const startCamera = async () => {
      if (videoRef.current && navigator.mediaDevices) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" }
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
              predictWebcam();
              if (!isCancelled) setStatus("Ready");
            };
          }
        } catch (err) {
          console.error(err);
          if (!isCancelled) setStatus("Camera Error");
        }
      }
    };
    initLandmarker();
    return () => {
      isCancelled = true;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [predictWebcam, videoRef]);
  return { status, isScanning };
}

// --- usePredictionModel Hook ---

function usePredictionModel() {
  const [modelType, setModelType] = useState<"none" | "geometric" | "ml">("geometric");
  const [detectedLabel, setDetectedLabel] = useState("");
  const [debugStatus, setDebugStatus] = useState("Waiting...");
  const [confidence, setConfidence] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  const trainingDataRef = useRef<TrainingSample[]>([]);
  const [mlDataSize, setMlDataSize] = useState(0);
  const [trainedClasses, setTrainedClasses] = useState<string[]>([]);

  const bufferRef = useRef<string[]>([]);
  const lastSuccessfulDetectionTime = useRef<number>(0);
  const prevIndexPos = useRef<{ x: number, y: number } | null>(null);
  const motionBuffer = useRef<number[]>([]);

  // Increased buffer size for consistency (was 5, now 10)
  const PREDICTION_BUFFER_SIZE = 10;
  const SCAN_DELAY_MS = 800;

  const loadMLModel = (data: TrainingSample[]) => {
    trainingDataRef.current = data;
    setMlDataSize(data.length);
    const unique = Array.from(new Set(data.map(d => d.label)));
    setTrainedClasses(unique);
  };

  const clearModel = () => {
    trainingDataRef.current = [];
    setMlDataSize(0);
    setTrainedClasses([]);
    setModelType("geometric"); // Fallback
  };

  const predict = (inputVector: number[], rawLandmarks: Landmark[]): string | null => {
    if (modelType === "none" || !rawLandmarks || rawLandmarks.length === 0) {
      setDebugStatus("No Hand");
      setConfidence(0);
      setIsLocked(false);
      bufferRef.current = [];
      setDetectedLabel("");
      return null;
    }

    if (Date.now() - lastSuccessfulDetectionTime.current < SCAN_DELAY_MS) {
      setIsLocked(true);
      return detectedLabel;
    }
    setIsLocked(false);

    let result: string | null = null;

    if (modelType === "geometric") {
      result = recognizeGeometricGesture(rawLandmarks);

      // Z Motion Logic
      if (result === "1" || result === "D") {
        const indexTip = rawLandmarks[8];
        if (prevIndexPos.current) {
          const dx = Math.abs(indexTip.x - prevIndexPos.current.x);
          const dy = Math.abs(indexTip.y - prevIndexPos.current.y);
          const velocity = Math.sqrt(dx * dx + dy * dy);
          motionBuffer.current.push(velocity);
          if (motionBuffer.current.length > 5) motionBuffer.current.shift();
          const avgVel = motionBuffer.current.reduce((a, b) => a + b, 0) / motionBuffer.current.length;
          // Increased threshold to prevent detecting Z on shaky hands
          if (avgVel > 0.04) result = "Z";
        }
        prevIndexPos.current = { x: indexTip.x, y: indexTip.y };
      } else {
        motionBuffer.current = [];
      }
    } else if (modelType === "ml") {
      if (trainingDataRef.current.length >= K) {
        const wrist = rawLandmarks[0];
        const normalizedInput = rawLandmarks.flatMap(p => [
          p.x - wrist.x, p.y - wrist.y, p.z - wrist.z
        ]);
        const mlPrediction = predictKNN(normalizedInput, trainingDataRef.current);
        if (mlPrediction) result = mlPrediction.label;
      } else {
        setDebugStatus(`Need ${K}+ samples`);
        return null;
      }
    }

    setDebugStatus(result ? `Found: ${result}` : "Unknown");

    if (!result) {
      setConfidence(0);
      return null;
    }

    bufferRef.current.push(result);
    if (bufferRef.current.length > PREDICTION_BUFFER_SIZE) {
      bufferRef.current.shift();
    }

    const counts: Record<string, number> = {};
    bufferRef.current.forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
    const winner = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, "");
    const winCount = counts[winner];
    const calcConfidence = Math.round((winCount / bufferRef.current.length) * 100);

    setConfidence(calcConfidence);

    // Consistency Check: Require >70% of buffer to match
    if (winCount > PREDICTION_BUFFER_SIZE * 0.7) {
      if (winner !== detectedLabel) {
        lastSuccessfulDetectionTime.current = Date.now();
      }
      return winner;
    }

    return null;
  };

  return {
    modelType,
    setModelType,
    detectedLabel,
    setDetectedLabel,
    predict,
    debugStatus,
    confidence,
    isLocked,
    trainingDataRef,
    mlDataSize,
    loadMLModel,
    clearModel,
    trainedClasses
  };
}

// --- useTextToSpeech Hook ---
function useTextToSpeech() {
  const [enabled, setEnabled] = useState(true);
  const lastSpokenRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);
  const speak = (text: string) => {
    if (!enabled || !text) return;
    const now = Date.now();
    if (text === lastSpokenRef.current && now - lastTimeRef.current < 2000) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utter);
    lastSpokenRef.current = text;
    lastTimeRef.current = now;
  };
  const toggle = () => setEnabled((prev) => !prev);
  return { enabled, toggle, speak };
}

// --- useSpeechToSign Hook ---
function useSpeechToSign() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) setTranscript(finalTranscript);
      };
      recognition.onend = () => {
        if (isListening) recognition.start();
      };
      recognitionRef.current = recognition;
    } else {
      setIsSupported(false);
    }
  }, [isListening]);

  const toggleListen = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
      setTranscript("");
    }
  };
  return { isListening, transcript, toggleListen, isSupported, setTranscript };
}

// --- useDataCollection Hook ---
function useDataCollection(trainingDataRef: React.MutableRefObject<TrainingSample[]>) {
  const [collecting, setCollecting] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const activeLabelRef = useRef("");
  const dataBufferRef = useRef<Sample[]>([]);
  const lastSampleTimeRef = useRef<number>(0);
  const SAMPLE_COOLDOWN_MS = 200;

  const startCollecting = (lbl: string) => {
    if (!lbl) return alert("Enter label");
    activeLabelRef.current = lbl;
    setCollecting(true);
    dataBufferRef.current = [];
    setSampleCount(0);
    lastSampleTimeRef.current = 0;
  }
  const stopCollecting = () => setCollecting(false);

  const addSample = (vec: number[], raw: Landmark[]) => {
    const now = Date.now();
    if (collecting && raw.length > 0 && (now - lastSampleTimeRef.current > SAMPLE_COOLDOWN_MS)) {
      dataBufferRef.current.push({ label: activeLabelRef.current, landmarks: raw });
      setSampleCount(dataBufferRef.current.length);
      lastSampleTimeRef.current = now;
    }
  }

  const addToModel = () => {
    if (dataBufferRef.current.length === 0) return null;
    const newTrainingData: TrainingSample[] = dataBufferRef.current.map(sample => {
      const wrist = sample.landmarks[0];
      const normalizedVector = sample.landmarks.flatMap(p => [
        p.x - wrist.x, p.y - wrist.y, p.z - wrist.z
      ]);
      return { label: sample.label, vector: normalizedVector };
    });
    trainingDataRef.current = [...trainingDataRef.current, ...newTrainingData];
    setCollecting(false);
    dataBufferRef.current = [];
    setSampleCount(0);
    return trainingDataRef.current;
  };

  const saveDataset = () => {
    const fullDataset = trainingDataRef.current;
    if (fullDataset.length === 0) return alert("No data.");
    const blob = new Blob([JSON.stringify(fullDataset)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "custom_ml_dataset.json";
    a.click();
  }

  const loadDataset = (onLoad: (data: TrainingSample[]) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target?.result as string) as TrainingSample[];
            onLoad(data);
          } catch (error) {
            alert("Failed to parse.");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return { collecting, sampleCount, startCollecting, stopCollecting, addSample, saveDataset, addToModel, loadDataset };
}

// --- Voice to Sign Player ---
function VoiceSignPlayer({ transcript, isListening, toggleListen }: { transcript: string, isListening: boolean, toggleListen: () => void }) {
  const [currentSign, setCurrentSign] = useState<GestureLibraryItem | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!transcript) return;
    const words = transcript.trim().toUpperCase().split(/\s+/);
    const newQueue: string[] = [];
    words.forEach(word => {
      const libKey = Object.keys(GESTURE_LIBRARY).find(k => k.toUpperCase() === word);
      if (libKey) newQueue.push(libKey);
      else {
        word.split("").forEach(char => {
          if (GESTURE_LIBRARY[char]) newQueue.push(char);
        });
      }
    });
    if (newQueue.length > 0) {
      setQueue(newQueue);
      setIsPlaying(true);
      setCurrentIndex(0);
    }
  }, [transcript]);

  useEffect(() => {
    if (!isPlaying || queue.length === 0) return;
    const interval = setInterval(() => {
      if (currentIndex < queue.length) {
        const key = queue[currentIndex];
        setCurrentSign(GESTURE_LIBRARY[key]);
        setCurrentIndex(prev => prev + 1);
      } else {
        setIsPlaying(false);
        setCurrentSign(null);
        setCurrentIndex(0);
        clearInterval(interval);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, queue]);

  return (
    <Card className="flex flex-col h-full overflow-hidden border-2 border-primary/20 shadow-xl bg-card">
      <div className="p-4 border-b bg-muted/20 flex justify-between items-center">
        <h3 className="font-bold text-lg uppercase flex items-center gap-2 text-primary">
          <Mic className="w-5 h-5" /> Voice to Sign
        </h3>
        <Button
          size="sm"
          variant={isListening ? "destructive" : "outline"}
          onClick={toggleListen}
          className={`font-semibold ${isListening ? "animate-pulse" : ""}`}
        >
          {isListening ? <><MicOff className="w-4 h-4 mr-2" /> Stop</> : <><Mic className="w-4 h-4 mr-2" /> Listen</>}
        </Button>
      </div>
      <div className="flex-grow bg-background flex flex-col items-center justify-center relative p-8 min-h-[300px]">
        {currentSign ? (
          <div className="text-center animate-in zoom-in duration-200 flex flex-col items-center">
            <div className="mb-4 drop-shadow-2xl filter hover:brightness-110 transition-all select-none">
              <div className="relative w-40 h-40 md:w-64 md:h-64 flex items-center justify-center">
                <SignImage
                  url={currentSign.image}
                  alt={currentSign.title}
                  emoji={currentSign.emoji}
                  className="w-full h-full text-[120px] md:text-[150px]"
                />
              </div>
            </div>
            <div className="bg-card text-primary px-8 py-3 rounded-full text-2xl md:text-3xl font-black shadow-lg border border-primary/20">
              {currentSign.title}
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground flex flex-col items-center gap-6">
            {isListening ? (
              <p className="text-xl font-medium animate-pulse text-primary">Listening...</p>
            ) : (
              <div className="flex flex-col items-center">
                <MicOff className="w-16 h-16 opacity-20 mb-2" />
                <p className="text-sm">Tap Listen</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-4 border-t bg-muted/10 min-h-[80px]">
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-2">
          <Activity className="w-3 h-3" /> Transcript
        </p>
        <p className="text-lg font-medium text-foreground leading-relaxed">
          {transcript || <span className="text-muted-foreground/40 italic">...</span>}
        </p>
      </div>
    </Card>
  );
}

// --- Main Component ---

export default function ASLRecorder() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const predictor = usePredictionModel();
  const collector = useDataCollection(predictor.trainingDataRef);
  const tts = useTextToSpeech();
  const speech = useSpeechToSign();

  const [inputLabel, setInputLabel] = useState("");
  const [sentence, setSentence] = useState("");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [camSettings, setCamSettings] = useState<CameraSettings>({
    brightness: 100, contrast: 100, saturation: 100
  });

  const filteredLibrary = useMemo(() => {
    const entries = Object.entries(GESTURE_LIBRARY);
    if (!searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter(([key, item]) =>
      key.toLowerCase().includes(query) ||
      item.title.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const resetCamSettings = () => setCamSettings({ brightness: 100, contrast: 100, saturation: 100 });

  const lastAddedTimeRef = useRef<number>(0);
  const SENTENCE_ADD_COOLDOWN = 1000;

  // --- NEW: BACKSPACE FUNCTION ---
  const handleBackspace = () => {
    setSentence(prev => {
      const words = prev.trim().split(" ");
      if (words.length <= 1) return "";
      return words.slice(0, -1).join(" ");
    });
  };

  const handleFrame = useCallback((vector: number[], rawData: Landmark[]) => {
    if (collector.collecting) collector.addSample(vector, rawData);
    if (predictor.modelType !== "none") {
      const result = predictor.predict(vector, rawData);
      if (result && result !== predictor.detectedLabel) {
        predictor.setDetectedLabel(result);
        tts.speak(result);
      }
      if (result && predictor.confidence > 80 && !predictor.isLocked) {
        const now = Date.now();
        if (now - lastAddedTimeRef.current > SENTENCE_ADD_COOLDOWN) {
          const sentenceParts = sentence.trim().split(/\s+/);
          const lastWord = sentenceParts[sentenceParts.length - 1];
          setSentence(prev => lastWord === result ? prev : `${prev.trim()} ${result}`);
          lastAddedTimeRef.current = now;
        }
      }
    }
  }, [collector, predictor, tts, sentence]);

  const { status: cameraStatus, isScanning } = useLandmarker({
    videoRef,
    canvasRef,
    onFrameProcessed: handleFrame
  });

  const handleAddToModel = () => {
    const updatedData = collector.addToModel();
    if (updatedData) {
      predictor.setModelType("ml");
      predictor.loadMLModel(updatedData);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center py-4 px-2 md:px-4 bg-background text-foreground transition-colors font-sans overflow-x-hidden">

      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-[1600px] mb-4 px-2">
        <div className="flex flex-col">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">GAMAY</h1>
          <p className="text-xs md:text-sm text-muted-foreground">ASL Trainer</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsFeedbackOpen(true)}>
            <Info className="w-4 h-4" />
          </Button>
          <ModeToggle />
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 w-full max-w-[1600px] mb-20">

        {/* SECTION 1: Video & Translation */}
        <div className="lg:col-span-2 flex flex-col items-center gap-4 lg:order-2">
          <VideoStage
            videoRef={videoRef}
            canvasRef={canvasRef}
            detectedLabel={predictor.detectedLabel}
            confidence={predictor.confidence}
            isLocked={predictor.isLocked}
            settings={camSettings}
            isScanning={isScanning}
          />

          <div className="flex gap-2 md:gap-6 text-xs md:text-sm bg-muted/50 px-4 py-2 rounded-full border shadow-sm items-center w-full justify-between md:justify-center flex-wrap">
            <span className="flex items-center gap-2">
              <ScanFace className="w-4 h-4 text-primary" />
              {cameraStatus}
            </span>
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              Conf: <span className="font-bold">{predictor.confidence}%</span>
            </span>
          </div>

          <div className="w-full">
            <SentenceDisplay
              sentence={sentence}
              onClear={() => setSentence("")}
              onBackspace={handleBackspace} // Passed here
            />
          </div>

          <div className="w-full flex flex-col gap-4 p-4 border rounded-lg bg-card/50">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                Audio
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={tts.toggle}
                className={tts.enabled ? "text-green-600 border-green-200" : "text-muted-foreground"}
              >
                {tts.enabled ? <><Volume2 className="w-4 h-4 mr-2" /> On</> : <><VolumeX className="w-4 h-4 mr-2" /> Off</>}
              </Button>
            </div>
            <Separator />

            {/* EXPANDED TRAINING STUDIO */}
            <details className="text-sm text-muted-foreground cursor-pointer group" open>
              <summary className="hover:text-primary transition-colors font-medium text-base p-2 border rounded-md flex items-center justify-between select-none bg-secondary/10">
                <span className="flex items-center gap-2"><Cpu className="w-4 h-4" /> Training Studio</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${collector.collecting ? 'bg-red-500/20 text-red-500' : 'bg-muted'}`}>
                  {collector.collecting ? 'REC' : 'IDLE'}
                </span>
              </summary>

              <div className="mt-4 space-y-4 p-4 border rounded bg-background">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">1. Label Sign</label>
                    <Input
                      placeholder="e.g. 'Hello'"
                      value={inputLabel}
                      onChange={(e) => setInputLabel(e.target.value)}
                      disabled={collector.collecting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">2. Capture</label>
                    <Button
                      className="w-full"
                      variant={collector.collecting ? "destructive" : "secondary"}
                      onClick={() => collector.collecting ? collector.stopCollecting() : collector.startCollecting(inputLabel)}
                      disabled={!inputLabel}
                    >
                      {collector.collecting ? `Stop Recording (${collector.sampleCount})` : "Hold to Record"}
                    </Button>
                  </div>
                </div>

                <Button
                  variant="default"
                  onClick={handleAddToModel}
                  disabled={collector.sampleCount === 0 || collector.collecting}
                  className="w-full h-12 text-lg"
                >
                  <Plus className="w-5 h-5 mr-2" /> Add to Model
                </Button>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={collector.saveDataset}><Save className="w-3 h-3 mr-2" /> Save File</Button>
                  <Button variant="outline" size="sm" onClick={() => collector.loadDataset(predictor.loadMLModel)}><Database className="w-3 h-3 mr-2" /> Load File</Button>
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* SECTION 2: Info & Settings & NEW MODEL CONTROL */}
        <div className="lg:col-span-1 flex flex-col gap-4 lg:order-1">
          <GestureInfoCard label={predictor.detectedLabel} />

          {/* NEW: Model Controller */}
          <Card className="p-4 flex flex-col gap-4 border-l-4 border-l-purple-500">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Brain className="w-4 h-4 text-purple-600" /> Model Mode
              </h3>
              <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-lg">
                <button
                  onClick={() => predictor.setModelType("geometric")}
                  className={`text-xs font-bold py-2 rounded-md transition-all ${predictor.modelType === 'geometric' ? 'bg-background shadow text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                >
                  Geometric
                </button>
                <button
                  onClick={() => predictor.setModelType("ml")}
                  className={`text-xs font-bold py-2 rounded-md transition-all ${predictor.modelType === 'ml' ? 'bg-purple-600 text-white shadow' : 'text-muted-foreground hover:bg-background/50'}`}
                >
                  Machine Learning
                </button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                  <Layers className="w-3 h-3" /> Active Classes
                </h4>
                <span className="text-[10px] bg-primary/10 text-primary px-2 rounded-full">{predictor.trainedClasses.length}</span>
              </div>

              <div className="max-h-[150px] overflow-y-auto space-y-1 bg-muted/20 p-2 rounded-md custom-scrollbar">
                {predictor.trainedClasses.length > 0 ? (
                  predictor.trainedClasses.map(cls => (
                    <div key={cls} className="text-xs flex justify-between items-center bg-background p-1.5 rounded border">
                      <span className="font-semibold">{cls}</span>
                      <span className="text-[10px] text-muted-foreground">Trained</span>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-center italic text-muted-foreground py-4">No custom signs trained yet.</p>
                )}
              </div>

              {predictor.trainedClasses.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full text-destructive text-xs h-7" onClick={predictor.clearModel}>
                  <Trash2 className="w-3 h-3 mr-2" /> Clear Model
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Settings2 className="w-4 h-4" /> Camera
              </h3>
              <Button variant="ghost" size="icon" onClick={resetCamSettings} className="h-6 w-6">
                <RefreshCcw className="w-3 h-3" />
              </Button>
            </div>
            <div className="space-y-3">
              {['brightness', 'contrast', 'saturation'].map((s) => (
                <div key={s} className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                    <span>{s}</span>
                    <span>{camSettings[s as keyof CameraSettings]}%</span>
                  </div>
                  <Slider
                    min={s === 'saturation' ? "0" : "50"} max="200"
                    value={camSettings[s as keyof CameraSettings]}
                    onChange={(e) => setCamSettings(prev => ({ ...prev, [s]: parseInt(e.target.value) }))}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* SECTION 3: Voice & Library */}
        <div className="lg:col-span-1 flex flex-col gap-4 h-auto lg:h-[calc(100vh-100px)] lg:sticky lg:top-6 lg:order-3">
          <div className="flex-shrink-0 h-auto min-h-[300px]">
            <VoiceSignPlayer
              transcript={speech.transcript}
              isListening={speech.isListening}
              toggleListen={speech.toggleListen}
            />
          </div>

          <Card className="flex flex-col flex-grow overflow-hidden border-primary/20 shadow-lg min-h-[300px]">
            <div className="p-4 border-b bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase flex items-center gap-2 text-primary">
                  <List className="w-4 h-4" /> Library
                </h3>
                <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {filteredLibrary.length}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-9 bg-background/50 h-8 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-2 space-y-2 custom-scrollbar bg-muted/5">
              {filteredLibrary.length > 0 ? (
                filteredLibrary.map(([key, item]) => (
                  <div
                    key={key}
                    className={`p-3 rounded-xl border transition-all flex items-center gap-3 cursor-default
                      ${predictor.detectedLabel === key
                        ? 'bg-primary border-primary text-white shadow-lg translate-x-1'
                        : 'bg-card hover:border-primary/40 hover:bg-muted/30'}`}
                  >
                    <div className="w-12 h-12 flex-shrink-0 bg-white/10 rounded-md p-1 flex items-center justify-center">
                      <SignImage
                        url={item.image}
                        alt={item.title}
                        emoji={item.emoji}
                        className="w-full h-full text-2xl"
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-sm truncate">{item.title}</span>
                      <span className="text-[10px] line-clamp-1 opacity-70">
                        {item.description}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full opacity-30 text-center p-6">
                  <p className="text-sm font-bold uppercase">No matches</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="pb-32" />

      {isFeedbackOpen && (
        <FeedbackModal onClose={() => setIsFeedbackOpen(false)}>
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Feedback & Guide</h2>
            <p className="mb-2">1. Hold your hand steady for 2 seconds.</p>
            <p className="mb-2">2. Keep hand within the camera frame.</p>
            <p className="mb-4">3. Detection is slowed down for accuracy.</p>
          </div>
        </FeedbackModal>
      )}

    </div>
  );
}

// --- Sub-Components ---

function FeedbackModal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <div className="p-4 flex justify-end border-t">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function VideoStage({ videoRef, canvasRef, detectedLabel, confidence, isLocked, settings, isScanning }: VideoStageProps) {
  const videoStyle = settings ? {
    filter: `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%)`,
    opacity: detectedLabel ? '0.7' : '1.0'
  } : {};

  return (
    <Card className="w-full aspect-[4/3] max-w-[640px] shadow-lg border rounded-lg overflow-hidden relative bg-black shrink-0 group">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover transition-all duration-200 will-change-transform"
        autoPlay
        playsInline
        muted
        style={videoStyle}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="absolute top-2 right-2">
        {isScanning && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />}
      </div>
      {detectedLabel && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-1 animate-in fade-in zoom-in duration-200 pointer-events-none">
          <div className={`px-6 py-2 text-white rounded-full shadow-lg text-xl font-bold whitespace-nowrap flex items-center gap-2 ${isLocked ? "bg-green-600" : "bg-purple-600/90"}`}>
            {isLocked && <Lock className="w-4 h-4 animate-pulse" />}
            {detectedLabel}
          </div>
          <div className="w-32 h-1.5 bg-gray-700/50 rounded-full overflow-hidden backdrop-blur-sm">
            <div
              className={`h-full transition-all duration-300 ${confidence > 80 ? 'bg-green-500' : 'bg-yellow-500'}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function GestureInfoCard({ label }: { label: string }) {
  const info = GESTURE_LIBRARY[label] || {
    emoji: "👋",
    title: "Ready",
    description: "Hold sign for 2 seconds",
    image: ""
  };

  if (label && !GESTURE_LIBRARY[label]) {
    info.title = label;
    info.description = `Custom gesture detected.`;
    info.emoji = "✨";
    info.image = "";
  }

  return (
    <Card className="h-full min-h-[200px] p-6 flex flex-col items-center text-center justify-center bg-card transition-all duration-300">
      <div className="mb-4 animate-in zoom-in duration-300 select-none drop-shadow-lg">
        <div className="relative w-40 h-40 md:w-56 md:h-56 flex items-center justify-center">
          <SignImage
            url={info.image}
            alt={info.title}
            emoji={info.emoji}
            className="w-full h-full text-[60px] md:text-[80px]"
          />
        </div>
      </div>
      <h2 className="text-xl md:text-2xl font-bold mb-2 text-primary">{info.title}</h2>
      <div className="flex items-start gap-2 text-left bg-muted/50 p-3 rounded-lg w-full">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
          {info.description}
        </p>
      </div>
    </Card>
  );
}

function SentenceDisplay({ sentence, onClear, onBackspace }: { sentence: string, onClear: () => void, onBackspace: () => void }) {
  return (
    <Card className="h-full min-h-[100px] flex flex-col relative overflow-hidden">
      <div className="p-3 border-b flex justify-between items-center bg-muted/20">
        <label className="font-semibold flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4" /> Live Translation
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onBackspace} disabled={!sentence} className="h-7 text-xs">
            <Delete className="w-3 h-3 mr-2" /> Backspace
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!sentence} className="h-7 text-xs">
            <Trash2 className="w-3 h-3 mr-2" /> Clear
          </Button>
        </div>
      </div>
      <div className="flex-grow p-4 bg-muted/10 overflow-y-auto">
        {sentence ? (
          <p className="text-lg md:text-xl font-mono leading-relaxed break-words whitespace-pre-wrap">
            {sentence}
          </p>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 italic text-center p-2">
            <p className="text-xs">Waiting for signs...</p>
          </div>
        )}
      </div>
      {sentence && (
        <div className="p-1 bg-green-500/10 border-t flex items-center justify-center gap-2 text-[10px] text-green-600 font-medium">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          Active
        </div>
      )}
    </Card>
  );
}
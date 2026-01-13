# GAMAY System Architecture Improvements

To significantly boost the robustness and accuracy of the recognition engine, I propose the following core system upgrades:

## 1. Hand-Scale Normalization (Critical for Accuracy)
**The Problem:** Currently, our math uses fixed numbers (e.g., `if distance < 0.05`).
- If you move your hand **closer** to the camera, it becomes "huge," and distances increase, causing the system to think your fingers are spread.
- If you move **further**, the hand becomes "tiny," and distances shrink, causing it to think your fingers are touching/closed.
**The Solution:**
- Implement a `scaleFactor`.
- In every frame, measure the distance between the **Wrist** and the **Middle Finger Knuckle (MCP)**.
- Divide all other measurements by this "Reference Length".
- **Result:** The system becomes "Scale Invariant." It will work perfectly whether you are 1 foot or 5 feet away from the camera.

## 2. Temporal Landmark Smoothing (Jitter Reduction)
**The Problem:** Webcams have noise. In low light, the skeleton "jitters" or shakes even if your hand is still. This causes flickering predictions (e.g., swapping between "V" and "U").
**The Solution:**
- Implement a `LowPassFilter` or `WeightedMovingAverage`.
- Instead of using the raw landmarks from the current frame, we use:
  `Current_Smoothed = (Prev_Smoothed * 0.5) + (New_Raw_Frame * 0.5)`
- **Result:** The skeleton will look liquid-smooth. Glitches will be filtered out before detection even happens.

## 3. Web Worker Offloading (Performance)
**The Problem:** The AI runs on the same "thread" as the UI buttons and animations. If the AI thinks too hard, the UI freezes/stutters.
**The Solution:**
- Move `MediaPipe` and the `KNN` math into a background `Worker`.
- **Result:** The interface remains silky smooth (60fps) no matter how old the computer is, while the AI crunches numbers in the background.

## 4. Optical Flow Verification
**The Problem:** Static shapes sometimes look like motion gestures (e.g., "Scanning" triggers "Wave").
**The Solution:**
- Track the "Velocity" of the Wrist point.
- If the hand is moving too fast (blurred), pause detection automatically until it stabilizes.
- **Result:** drastically reduces false positives during transition movements (moving from Sign A to Sign B).

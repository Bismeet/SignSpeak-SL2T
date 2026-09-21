/**
 * Lightweight, rule-based wave gesture detector for greeting ("Hello! 👋").
 *
 * Runs client-side on MediaPipe normalized hand landmarks without modifying
 * or retraining the ISL ONNX classifier.
 *
 * Requirements:
 *  1. Detect visible hand(s) with confidence >= minHandScore.
 *  2. Check that the hand is open (not a closed fist or pointing gesture).
 *  3. Track horizontal oscillation (side-to-side hand movement).
 *  4. Require enough repeated directional changes within a sliding time window.
 *  5. Enforce cooldown period to prevent duplicate triggers.
 *  6. Reset tracking if hand leaves the frame or stops moving.
 */

import type { FrameLandmarks, Handedness, HandLandmarks, Landmark } from '@/lib/types';

export interface WaveDetectorConfig {
  /** Minimum confidence score for a hand to be considered valid (0..1). */
  minHandScore: number;
  /** Minimum number of extended fingers (out of index, middle, ring, pinky). */
  minOpenFingers: number;
  /** Ratio of tip-to-wrist vs pip-to-wrist distance required for a finger to count as extended. */
  minExtensionRatio: number;
  /** Minimum horizontal movement (normalized coords 0..1) to count as a directional stroke. */
  minStrokeDeltaX: number;
  /** Number of directional reversals required within the window to trigger a wave. */
  minOscillations: number;
  /** Sliding time window in milliseconds to accumulate oscillations. */
  windowMs: number;
  /** Cooldown period in milliseconds after a trigger before another wave can fire. */
  cooldownMs: number;
  /** Max allowed time gap between frames in milliseconds before resetting tracking. */
  maxFrameGapMs: number;
  /** Whether the hand must be roughly upright (wrist below knuckles in image space). */
  requireUpright: boolean;
}

export const DEFAULT_WAVE_CONFIG: WaveDetectorConfig = {
  minHandScore: 0.5,
  minOpenFingers: 3,
  minExtensionRatio: 1.1,
  minStrokeDeltaX: 0.06,
  minOscillations: 3,
  windowMs: 1200,
  cooldownMs: 3000,
  maxFrameGapMs: 500,
  requireUpright: true,
};

// MediaPipe hand landmark indices
const WRIST = 0;
const FINGERS = [
  { name: 'index', tip: 8, pip: 6, mcp: 5 },
  { name: 'middle', tip: 12, pip: 10, mcp: 9 },
  { name: 'ring', tip: 16, pip: 14, mcp: 13 },
  { name: 'pinky', tip: 20, tip_pip: 18, pip: 18, mcp: 17 },
] as const;

/** Euclidean distance between two landmarks in 2D normalized space. */
export function dist2d(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Checks whether a single finger is extended outward from the wrist.
 * For an extended finger, tip is significantly further from the wrist than the PIP joint.
 */
export function isFingerExtended(
  wrist: Landmark,
  pip: Landmark,
  tip: Landmark,
  minRatio: number = 1.1,
): boolean {
  const dTip = dist2d(tip, wrist);
  const dPip = dist2d(pip, wrist);
  if (dPip < 1e-6) return false;
  return dTip / dPip >= minRatio;
}

/**
 * Checks if a hand is open (not a closed fist, pointing finger, or pinch).
 * Requires at least `minOpenFingers` out of index, middle, ring, pinky to be extended.
 */
export function isOpenHand(
  hand: HandLandmarks,
  config: WaveDetectorConfig = DEFAULT_WAVE_CONFIG,
): boolean {
  if (hand.landmarks.length < 21) return false;
  const wrist = hand.landmarks[WRIST];
  if (!wrist) return false;

  // Check upright orientation: in screen coordinates (0 at top, 1 at bottom),
  // an upright hand has its wrist lower (larger y) than the middle MCP knuckle.
  if (config.requireUpright) {
    const middleMcp = hand.landmarks[9];
    if (middleMcp && wrist.y < middleMcp.y - 0.05) {
      return false;
    }
  }

  let extendedCount = 0;
  for (const finger of FINGERS) {
    const pip = hand.landmarks[finger.pip];
    const tip = hand.landmarks[finger.tip];
    if (pip && tip && isFingerExtended(wrist, pip, tip, config.minExtensionRatio)) {
      extendedCount += 1;
    }
  }

  return extendedCount >= config.minOpenFingers;
}

/**
 * Computes the center of the palm from the wrist and MCP knuckle landmarks.
 * This is very stable and unaffected by finger wiggles.
 */
export function computePalmCenter(landmarks: Landmark[]): { x: number; y: number } {
  if (landmarks.length < 21) return { x: 0, y: 0 };
  // Indices: 0 (wrist), 5 (index MCP), 9 (middle MCP), 13 (ring MCP), 17 (pinky MCP)
  const indices = [0, 5, 9, 13, 17];
  let sx = 0;
  let sy = 0;
  for (const idx of indices) {
    const lm = landmarks[idx];
    if (lm) {
      sx += lm.x;
      sy += lm.y;
    }
  }
  return { x: sx / indices.length, y: sy / indices.length };
}

interface SingleHandState {
  lastPalmX: number | null;
  currentDirection: 1 | -1 | 0; // 1: moving right, -1: moving left, 0: neutral
  peakX: number;
  reversals: Array<{ x: number; timestampMs: number }>;
  lastSeenMs: number;
}

function createSingleHandState(): SingleHandState {
  return {
    lastPalmX: null,
    currentDirection: 0,
    peakX: 0,
    reversals: [],
    lastSeenMs: 0,
  };
}

export interface WaveDetectionResult {
  detected: boolean;
  handedness?: Handedness;
  timestampMs: number;
}

/**
 * State machine for detecting wave gestures across video frames.
 */
export class WaveDetector {
  private config: WaveDetectorConfig;
  private handStates: Record<Handedness, SingleHandState>;
  private lastTriggerMs: number = 0;

  constructor(customConfig?: Partial<WaveDetectorConfig>) {
    this.config = { ...DEFAULT_WAVE_CONFIG, ...customConfig };
    this.handStates = {
      Left: createSingleHandState(),
      Right: createSingleHandState(),
    };
  }

  /**
   * Resets internal tracking state and cooldown.
   */
  public reset(): void {
    this.handStates.Left = createSingleHandState();
    this.handStates.Right = createSingleHandState();
    this.lastTriggerMs = 0;
  }

  /**
   * Clears accumulated directional reversals and stroke tracking without clearing cooldown.
   * Suppresses accidental wave triggers when another sign gesture is active.
   */
  public resetReversals(): void {
    this.handStates.Left.reversals = [];
    this.handStates.Left.currentDirection = 0;
    this.handStates.Left.lastPalmX = null;
    this.handStates.Right.reversals = [];
    this.handStates.Right.currentDirection = 0;
    this.handStates.Right.lastPalmX = null;
  }

  /**
   * Returns current configuration.
   */
  public getConfig(): WaveDetectorConfig {
    return { ...this.config };
  }

  /**
   * Updates configuration options.
   */
  public updateConfig(newConfig: Partial<WaveDetectorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Evaluates a video frame for wave gestures.
   *
   * @param frame Current frame landmarks with hands and timestampMs.
   * @returns WaveDetectionResult indicating whether a wave was recognized.
   */
  public update(frame: FrameLandmarks): WaveDetectionResult {
    const timestampMs = frame.timestampMs;

    // Check cooldown
    if (this.lastTriggerMs > 0 && timestampMs - this.lastTriggerMs < this.config.cooldownMs) {
      // In cooldown: maintain state but do not accumulate reversals
      return { detected: false, timestampMs };
    }

    const seenHandedness = new Set<Handedness>();

    for (const hand of frame.hands) {
      if (hand.score < this.config.minHandScore) continue;
      const handedness: Handedness = hand.handedness ?? 'Right';
      seenHandedness.add(handedness);

      const state = this.handStates[handedness];

      // Reset if too long since this hand was last tracked
      if (state.lastSeenMs > 0 && timestampMs - state.lastSeenMs > this.config.maxFrameGapMs) {
        state.lastPalmX = null;
        state.currentDirection = 0;
        state.reversals = [];
      }
      state.lastSeenMs = timestampMs;

      // Verify that the hand is open (not a closed fist or pointing gesture)
      if (!isOpenHand(hand, this.config)) {
        // Hand closed or invalid orientation: clear active reversals to prevent false triggers
        state.reversals = [];
        state.currentDirection = 0;
        state.lastPalmX = null;
        continue;
      }

      // Hand is open and tracked: track horizontal movement
      const palm = computePalmCenter(hand.landmarks);
      const x = palm.x;

      if (state.lastPalmX === null) {
        state.lastPalmX = x;
        state.peakX = x;
        state.currentDirection = 0;
        continue;
      }

      state.lastPalmX = x;

      const minDelta = this.config.minStrokeDeltaX - 1e-4;

      if (state.currentDirection === 0) {
        if (x - state.peakX >= minDelta) {
          state.currentDirection = 1;
          state.peakX = x;
        } else if (state.peakX - x >= minDelta) {
          state.currentDirection = -1;
          state.peakX = x;
        }
      } else if (state.currentDirection === 1) {
        // Currently moving right
        if (x > state.peakX) {
          state.peakX = x;
        } else if (state.peakX - x >= minDelta) {
          // Reversal: was moving right, now moved left by minStrokeDeltaX
          state.reversals.push({ x: state.peakX, timestampMs });
          state.currentDirection = -1;
          state.peakX = x;
        }
      } else if (state.currentDirection === -1) {
        // Currently moving left
        if (x < state.peakX) {
          state.peakX = x;
        } else if (x - state.peakX >= minDelta) {
          // Reversal: was moving left, now moved right by minStrokeDeltaX
          state.reversals.push({ x: state.peakX, timestampMs });
          state.currentDirection = 1;
          state.peakX = x;
        }
      }

      // Prune reversals outside sliding time window
      state.reversals = state.reversals.filter(
        (r) => timestampMs - r.timestampMs <= this.config.windowMs,
      );

      // Check if threshold reached
      if (state.reversals.length >= this.config.minOscillations) {
        this.lastTriggerMs = timestampMs;
        // Reset state for this hand to prevent re-triggering
        state.reversals = [];
        state.currentDirection = 0;
        state.lastPalmX = null;

        return {
          detected: true,
          handedness,
          timestampMs,
        };
      }
    }

    // Clean up hands that disappeared
    for (const handedness of ['Left', 'Right'] as const) {
      if (!seenHandedness.has(handedness)) {
        const state = this.handStates[handedness];
        if (state.lastSeenMs > 0 && timestampMs - state.lastSeenMs > this.config.maxFrameGapMs) {
          state.lastPalmX = null;
          state.currentDirection = 0;
          state.reversals = [];
        }
      }
    }

    return { detected: false, timestampMs };
  }
}

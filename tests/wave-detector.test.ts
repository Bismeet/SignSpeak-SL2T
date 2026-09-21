import { describe, expect, it } from 'vitest';
import {
  computePalmCenter,
  DEFAULT_WAVE_CONFIG,
  dist2d,
  isFingerExtended,
  isOpenHand,
  WaveDetector,
} from '@/lib/vision/wave-detector';
import type { FrameLandmarks, Handedness, HandLandmarks, Landmark } from '@/lib/types';

/**
 * Creates a synthetic HandLandmarks object with 21 landmarks.
 */
function createSyntheticHand(options: {
  palmX: number;
  palmY?: number;
  isOpen?: boolean;
  isPointing?: boolean;
  handedness?: Handedness;
  score?: number;
}): HandLandmarks {
  const {
    palmX,
    palmY = 0.5,
    isOpen = true,
    isPointing = false,
    handedness = 'Right',
    score = 0.95,
  } = options;

  const landmarks: Landmark[] = new Array(21).fill(null).map(() => ({ x: palmX, y: palmY, z: 0 }));

  // Landmark 0: Wrist (below knuckles in screen coords)
  landmarks[0] = { x: palmX, y: palmY + 0.15, z: 0 };

  // Thumb: 1, 2, 3, 4
  landmarks[1] = { x: palmX - 0.04, y: palmY + 0.10, z: 0 };
  landmarks[2] = { x: palmX - 0.07, y: palmY + 0.06, z: 0 };
  landmarks[3] = { x: palmX - 0.09, y: palmY + 0.03, z: 0 };
  landmarks[4] = { x: palmX - 0.11, y: palmY, z: 0 };

  // Helper for 4 fingers
  const fingerDefs = [
    { mcp: 5, pip: 6, dip: 7, tip: 8, dx: -0.04, openTipY: palmY - 0.12, closedTipY: palmY + 0.08 }, // Index
    { mcp: 9, pip: 10, dip: 11, tip: 12, dx: 0.0, openTipY: palmY - 0.14, closedTipY: palmY + 0.08 }, // Middle
    { mcp: 13, pip: 14, dip: 15, tip: 16, dx: 0.04, openTipY: palmY - 0.12, closedTipY: palmY + 0.08 }, // Ring
    { mcp: 17, pip: 18, dip: 19, tip: 20, dx: 0.08, openTipY: palmY - 0.09, closedTipY: palmY + 0.08 }, // Pinky
  ];

  fingerDefs.forEach((f, idx) => {
    landmarks[f.mcp] = { x: palmX + f.dx, y: palmY + 0.05, z: 0 };
    landmarks[f.pip] = { x: palmX + f.dx, y: palmY, z: 0 };
    landmarks[f.dip] = { x: palmX + f.dx, y: palmY - 0.04, z: 0 };

    // When isPointing is true, only index (idx 0) is open, others closed
    const fingerOpen = isPointing ? idx === 0 : isOpen;
    landmarks[f.tip] = {
      x: palmX + f.dx,
      y: fingerOpen ? f.openTipY : f.closedTipY,
      z: 0,
    };
  });

  return {
    handedness,
    score,
    landmarks,
  };
}

function createFrame(hand: HandLandmarks | null, timestampMs: number): FrameLandmarks {
  return {
    hands: hand ? [hand] : [],
    pose: null,
    timestampMs,
  };
}

describe('WaveDetector - Geometry & Hand Checks', () => {
  it('identifies open hand vs closed fist vs pointing gesture', () => {
    const openHand = createSyntheticHand({ palmX: 0.5, isOpen: true });
    const fist = createSyntheticHand({ palmX: 0.5, isOpen: false });
    const pointing = createSyntheticHand({ palmX: 0.5, isPointing: true });

    expect(isOpenHand(openHand)).toBe(true);
    expect(isOpenHand(fist)).toBe(false);
    expect(isOpenHand(pointing)).toBe(false);
  });

  it('computes stable palm center', () => {
    const hand = createSyntheticHand({ palmX: 0.42 });
    const center = computePalmCenter(hand.landmarks);
    // Center of MCP knuckles + wrist around x=0.42
    expect(center.x).toBeCloseTo(0.42 + 0.016, 1);
  });

  it('computes 2D distance accurately', () => {
    const a: Landmark = { x: 0.1, y: 0.2, z: 0 };
    const b: Landmark = { x: 0.4, y: 0.6, z: 0 };
    expect(dist2d(a, b)).toBeCloseTo(0.5, 5);
  });
});

describe('WaveDetector - Detection Requirements', () => {
  it('Scenario 1: repeated wave triggers detection', () => {
    const detector = new WaveDetector();

    // Side-to-side wave pattern: 0.40 -> 0.50 -> 0.38 -> 0.52 -> 0.40
    // Direction reversals:
    //  - Stroke 1: moving right to peak ~0.50
    //  - Stroke 2: moves left to ~0.38 (Reversal 1)
    //  - Stroke 3: moves right to ~0.52 (Reversal 2)
    //  - Stroke 4: moves left to ~0.40 (Reversal 3 -> trigger)
    const positions = [
      // Rightward stroke 1
      0.40, 0.43, 0.47, 0.50,
      // Leftward stroke 2
      0.46, 0.42, 0.38,
      // Rightward stroke 3
      0.43, 0.48, 0.52,
      // Leftward stroke 4
      0.47, 0.43, 0.39,
    ];

    let triggered = false;
    let triggerTimestamp = 0;

    positions.forEach((x, index) => {
      const timestamp = 1000 + index * 50; // 50ms intervals
      const frame = createFrame(createSyntheticHand({ palmX: x, isOpen: true }), timestamp);
      const res = detector.update(frame);
      if (res.detected) {
        triggered = true;
        triggerTimestamp = res.timestampMs;
      }
    });

    expect(triggered).toBe(true);
    expect(triggerTimestamp).toBeGreaterThanOrEqual(1000);
  });

  it('Scenario 2: stationary hand does not trigger', () => {
    const detector = new WaveDetector();

    let triggered = false;
    // 40 frames over 2000ms with hand holding steady at ~0.50
    for (let i = 0; i < 40; i++) {
      const jitter = (i % 2 === 0 ? 0.003 : -0.003);
      const timestamp = 1000 + i * 50;
      const frame = createFrame(
        createSyntheticHand({ palmX: 0.50 + jitter, isOpen: true }),
        timestamp,
      );
      const res = detector.update(frame);
      if (res.detected) triggered = true;
    }

    expect(triggered).toBe(false);
  });

  it('Scenario 3: single movement does not trigger', () => {
    const detector = new WaveDetector();

    let triggered = false;
    // Single monotonic movement across screen from 0.25 to 0.70
    const monotonicX = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];
    monotonicX.forEach((x, i) => {
      const timestamp = 1000 + i * 50;
      const frame = createFrame(createSyntheticHand({ palmX: x, isOpen: true }), timestamp);
      const res = detector.update(frame);
      if (res.detected) triggered = true;
    });

    expect(triggered).toBe(false);
  });

  it('Scenario 4: closed fist does not trigger', () => {
    const detector = new WaveDetector();

    // Same wave trajectory as Scenario 1, but with closed fist
    const positions = [
      0.40, 0.43, 0.47, 0.50,
      0.46, 0.42, 0.38,
      0.43, 0.48, 0.52,
      0.47, 0.43, 0.39,
    ];

    let triggered = false;
    positions.forEach((x, index) => {
      const timestamp = 1000 + index * 50;
      const frame = createFrame(createSyntheticHand({ palmX: x, isOpen: false }), timestamp);
      const res = detector.update(frame);
      if (res.detected) triggered = true;
    });

    expect(triggered).toBe(false);
  });

  it('Scenario 5: missing hand resets tracking', () => {
    const detector = new WaveDetector();

    // Partial wave: 2 strokes (reversals = 1)
    const initialPositions = [0.40, 0.45, 0.50, 0.45, 0.40, 0.38];
    initialPositions.forEach((x, index) => {
      const timestamp = 1000 + index * 50;
      detector.update(createFrame(createSyntheticHand({ palmX: x, isOpen: true }), timestamp));
    });

    // Hand leaves camera for 800ms (> maxFrameGapMs of 500ms)
    detector.update(createFrame(null, 1500));
    detector.update(createFrame(null, 2100));

    // Hand returns and does a single stroke from 0.38 to 0.50
    let triggeredAfterReturn = false;
    const returnPositions = [0.38, 0.42, 0.46, 0.50];
    returnPositions.forEach((x, index) => {
      const timestamp = 2200 + index * 50;
      const res = detector.update(
        createFrame(createSyntheticHand({ palmX: x, isOpen: true }), timestamp),
      );
      if (res.detected) triggeredAfterReturn = true;
    });

    // Because state was reset upon hand disappearance, the stroke count starts from 0
    expect(triggeredAfterReturn).toBe(false);
  });

  it('Scenario 6: cooldown prevents duplicate triggers', () => {
    const detector = new WaveDetector({ cooldownMs: 2000 });

    const waveCycle = [
      0.40, 0.45, 0.50,
      0.45, 0.40, 0.38,
      0.43, 0.48, 0.52,
      0.47, 0.43, 0.39,
    ];

    let triggerCount = 0;
    let t = 1000;

    // Cycle 1: Triggers wave
    waveCycle.forEach((x) => {
      t += 50;
      const res = detector.update(
        createFrame(createSyntheticHand({ palmX: x, isOpen: true }), t),
      );
      if (res.detected) triggerCount += 1;
    });

    expect(triggerCount).toBe(1);

    // Continuous waving during the 2000ms cooldown window (e.g. t = 1700 to 2500)
    for (let i = 0; i < 2; i++) {
      waveCycle.forEach((x) => {
        t += 50;
        const res = detector.update(
          createFrame(createSyntheticHand({ palmX: x, isOpen: true }), t),
        );
        if (res.detected) triggerCount += 1;
      });
    }

    // Still only 1 trigger because cooldown suppressed continuous waving
    expect(triggerCount).toBe(1);

    // Fast-forward past cooldown (t > trigger + 2000ms)
    t += 2500;

    // Subsequent wave cycle after cooldown
    waveCycle.forEach((x) => {
      t += 50;
      const res = detector.update(
        createFrame(createSyntheticHand({ palmX: x, isOpen: true }), t),
      );
      if (res.detected) triggerCount += 1;
    });

    // Now a 2nd trigger is accepted
    expect(triggerCount).toBe(2);
  });

  it('Scenario 8: resetReversals() clears pending oscillations to prevent hijacking during signing', () => {
    const detector = new WaveDetector();

    // Partial wave (2 strokes: right then left)
    const partialWave = [0.40, 0.45, 0.50, 0.44, 0.38];
    let t = 1000;
    partialWave.forEach((x) => {
      t += 50;
      detector.update(createFrame(createSyntheticHand({ palmX: x, isOpen: true }), t));
    });

    // An ISL sign is detected -> caller resets reversals
    detector.resetReversals();

    // Now a single additional stroke occurs (would have triggered 3rd reversal if not reset)
    const extraStroke = [0.44, 0.49, 0.53];
    let triggered = false;
    extraStroke.forEach((x) => {
      t += 50;
      const res = detector.update(createFrame(createSyntheticHand({ palmX: x, isOpen: true }), t));
      if (res.detected) triggered = true;
    });

    // Must NOT trigger wave because reversals were cleared
    expect(triggered).toBe(false);
  });
});


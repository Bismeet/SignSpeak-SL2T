/**
 * Feature-extraction invariants.
 *
 * The parity test proves the two implementations agree. This file proves the vector means
 * what the documentation says it means — that it is scale-invariant, that a missing hand
 * contributes zeros rather than garbage, and that the blocks land at the documented
 * offsets. Those are the properties a model trained on the vector actually depends on, and
 * they are worth asserting independently of Python.
 */

import { describe, expect, it } from 'vitest';

import { FEATURE_VECTOR_LENGTH } from '@/lib/types';
import {
  FEATURE_LAYOUT_DESCRIPTION,
  HAND,
  HAND_LANDMARK_COUNT,
  POSE,
  computeLandmarkCompleteness,
  countUsableLandmarks,
  extractFeatureVector,
  handCentroid,
  isHandComplete,
  MIN_USABLE_LANDMARKS_PER_HAND,
  normaliseHand,
  palmNormal,
  selectHandSlots,
  type FeatureVector,
} from '@/lib/vision/features';
import { applyOcclusionSimulation } from '@/lib/vision/use-sign-recognition';

type Landmark = { x: number; y: number; z: number };

/** An open right hand, roughly to scale, with the wrist at the origin. */
const OPEN_HAND: Landmark[] = [
  { x: 0.0, y: 0.0, z: 0.0 },
  { x: -0.25, y: -0.12, z: 0.02 },
  { x: -0.38, y: -0.28, z: 0.02 },
  { x: -0.46, y: -0.42, z: 0.01 },
  { x: -0.5, y: -0.55, z: 0.0 },
  { x: -0.16, y: -0.5, z: 0.0 },
  { x: -0.18, y: -0.72, z: 0.0 },
  { x: -0.19, y: -0.85, z: 0.0 },
  { x: -0.19, y: -0.95, z: 0.0 },
  { x: 0.0, y: -0.52, z: 0.0 },
  { x: 0.0, y: -0.78, z: 0.0 },
  { x: 0.0, y: -0.93, z: 0.0 },
  { x: 0.0, y: -1.03, z: 0.0 },
  { x: 0.15, y: -0.5, z: 0.0 },
  { x: 0.17, y: -0.74, z: 0.0 },
  { x: 0.18, y: -0.87, z: 0.0 },
  { x: 0.18, y: -0.96, z: 0.0 },
  { x: 0.28, y: -0.45, z: 0.0 },
  { x: 0.31, y: -0.64, z: 0.0 },
  { x: 0.32, y: -0.75, z: 0.0 },
  { x: 0.32, y: -0.83, z: 0.0 },
];

function transform(
  landmarks: Landmark[],
  { scale = 1, dx = 0, dy = 0 }: { scale?: number; dx?: number; dy?: number },
): Landmark[] {
  return landmarks.map((landmark) => ({
    x: landmark.x * scale + dx,
    y: landmark.y * scale + dy,
    z: landmark.z * scale,
  }));
}

/**
 * Mirror a hand across the vertical axis — a right hand becomes a left hand.
 *
 * Deliberately separate from `transform({ scale: -1 })`: negating both x and y is a 180
 * degree rotation, which preserves the palm-normal direction, so it would not exercise the
 * handedness signal at all.
 */
function mirror(landmarks: Landmark[]): Landmark[] {
  return landmarks.map((landmark) => ({ x: -landmark.x, y: landmark.y, z: landmark.z }));
}

function frame(hands: Array<{ handedness: 'Left' | 'Right'; score: number; landmarks: Landmark[] }>, pose: Landmark[] | null = null) {
  return {
    hands,
    pose: pose ? { landmarks: pose } : null,
    timestampMs: 0,
  };
}

function poseWithShoulders(leftX: number, rightX: number, y = 0.55): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: POSE.POSE_LANDMARK_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
  landmarks[POSE.LEFT_SHOULDER] = { x: leftX, y, z: 0 };
  landmarks[POSE.RIGHT_SHOULDER] = { x: rightX, y, z: 0 };
  return landmarks;
}

function block(vector: FeatureVector, from: number, to: number): number[] {
  return Array.from(vector.vector.slice(from, to + 1));
}

describe('vector shape', () => {
  it('is always exactly the contract length', () => {
    const cases = [
      frame([]),
      frame([{ handedness: 'Right', score: 0.9, landmarks: OPEN_HAND }]),
      frame([
        { handedness: 'Left', score: 0.9, landmarks: OPEN_HAND },
        { handedness: 'Right', score: 0.9, landmarks: OPEN_HAND },
      ]),
    ];
    for (const input of cases) {
      expect(extractFeatureVector(input).vector).toHaveLength(FEATURE_VECTOR_LENGTH);
    }
  });

  it('contains only finite numbers', () => {
    const result = extractFeatureVector(
      frame([{ handedness: 'Right', score: 0.9, landmarks: transform(OPEN_HAND, { scale: 0.0001 }) }]),
    );
    for (const value of result.vector) expect(Number.isFinite(value)).toBe(true);
  });

  it('is all zeros except the pose flag when nothing is detected', () => {
    const result = extractFeatureVector(frame([]));
    expect(result.handCount).toBe(0);
    expect(result.bestHandScore).toBe(0);
    expect(result.vector[158]).toBe(0);
    expect(result.vector.reduce((sum, value) => sum + Math.abs(value), 0)).toBe(0);
  });
});

describe('block layout matches the documentation', () => {
  const result = extractFeatureVector(
    frame(
      [
        { handedness: 'Left', score: 0.8, landmarks: mirror(OPEN_HAND) },
        { handedness: 'Right', score: 0.9, landmarks: OPEN_HAND },
      ],
      poseWithShoulders(0.36, 0.64),
    ),
  );

  it('sets both presence flags', () => {
    expect(result.vector[126]).toBe(1);
    expect(result.vector[127]).toBe(1);
  });

  it('sets the pose flag', () => {
    expect(result.vector[158]).toBe(1);
  });

  it('puts the left hand in the first landmark block and the right in the second', () => {
    // The left hand was mirrored, so its thumb-side landmarks have the opposite x sign.
    const leftBlock = block(result, 0, 62);
    const rightBlock = block(result, 63, 125);
    expect(leftBlock).not.toEqual(rightBlock);
    // Index 4 is the thumb tip; mirroring flips its x.
    expect(Math.sign(leftBlock[4 * 3] as number)).toBe(-Math.sign(rightBlock[4 * 3] as number));
  });

  it('leaves the landmark block at zero when the hand is absent', () => {
    const oneHand = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: OPEN_HAND }]));
    expect(oneHand.vector[126]).toBe(0);
    expect(oneHand.vector[127]).toBe(1);
    expect(block(oneHand, 0, 62).every((value) => value === 0)).toBe(true);
  });

  it('writes five fingertip distances and five extension angles per hand', () => {
    const tips = block(result, 138, 147);
    const angles = block(result, 148, 157);
    expect(tips.filter((value) => value > 0)).toHaveLength(10);
    expect(angles.filter((value) => value > 0)).toHaveLength(10);
    // An open hand's fingers are close to straight, so every angle is near PI.
    for (const angle of angles) expect(angle).toBeGreaterThan(2.5);
  });

  it('produces a unit palm normal', () => {
    for (const slot of [0, 1]) {
      const normal = block(result, 132 + slot * 3, 134 + slot * 3);
      const length = Math.hypot(normal[0] as number, normal[1] as number, normal[2] as number);
      expect(length).toBeCloseTo(1, 5);
    }
  });

  it('documents every block it writes', () => {
    const covered = new Set<string>();
    for (const entry of FEATURE_LAYOUT_DESCRIPTION) {
      for (const index of entry.range.split('-').map(Number)) covered.add(String(index));
    }
    expect(covered.has('0')).toBe(true);
    expect(covered.has('126')).toBe(true);
    expect(covered.has('158')).toBe(true);
    // The last block must be the pose flag, which is index 158.
    expect(FEATURE_LAYOUT_DESCRIPTION.at(-1)?.range).toBe('158');
  });
});

describe('normalisation invariants', () => {
  it('is invariant to hand size and camera distance', () => {
    const small = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: transform(OPEN_HAND, { scale: 0.2 }) }]));
    const large = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: transform(OPEN_HAND, { scale: 5 }) }]));

    for (let index = 0; index < 126; index += 1) {
      expect(small.vector[index] as number).toBeCloseTo(large.vector[index] as number, 4);
    }
  });

  it('is invariant to translation', () => {
    const a = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: transform(OPEN_HAND, { dx: 0.2, dy: -0.1 }) }]));
    const b = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: OPEN_HAND }]));
    for (let index = 0; index < 126; index += 1) {
      expect(a.vector[index] as number).toBeCloseTo(b.vector[index] as number, 5);
    }
  });

  it('puts the wrist at the origin of the normalised hand', () => {
    const normalised = normaliseHand(transform(OPEN_HAND, { dx: 0.3, dy: 0.2, scale: 3 }));
    expect(normalised[0]).toBeCloseTo(0, 6);
    expect(normalised[1]).toBeCloseTo(0, 6);
    expect(normalised[2]).toBeCloseTo(0, 6);
  });

  it('scales the middle finger MCP to unit distance from the wrist', () => {
    const normalised = normaliseHand(OPEN_HAND);
    const x = normalised[HAND.MIDDLE_MCP * 3] as number;
    const y = normalised[HAND.MIDDLE_MCP * 3 + 1] as number;
    const z = normalised[HAND.MIDDLE_MCP * 3 + 2] as number;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
  });

  it('does not rotate, because palm orientation is a distinguishing ISL parameter', () => {
    // A hand rotated 45 degrees must produce a different vector. If someone adds rotation
    // normalisation, this test fails — which is the point (decision D-08).
    const upright = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: OPEN_HAND }]));
    const rotatedLandmarks = OPEN_HAND.map((landmark) => {
      const angle = Math.PI / 4;
      return {
        x: landmark.x * Math.cos(angle) - landmark.y * Math.sin(angle),
        y: landmark.x * Math.sin(angle) + landmark.y * Math.cos(angle),
        z: landmark.z,
      };
    });
    const rotated = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: rotatedLandmarks }]));

    let maxDifference = 0;
    for (let index = 0; index < 126; index += 1) {
      maxDifference = Math.max(maxDifference, Math.abs((upright.vector[index] as number) - (rotated.vector[index] as number)));
    }
    expect(maxDifference).toBeGreaterThan(0.1);
  });

  it('survives a degenerate hand without producing NaN', () => {
    const identical = Array.from({ length: HAND_LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const result = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: identical }]));
    for (const value of result.vector) expect(Number.isFinite(value)).toBe(true);
    // Palm normal is undefined for a degenerate hand, so it must be zero, not NaN.
    expect(block(result, 132, 137).every((value) => value === 0)).toBe(true);
  });

  it('replaces non-finite coordinates with zero', () => {
    const withNaN = OPEN_HAND.map((landmark, index) =>
      index === 0 ? { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: 0 } : landmark,
    );
    const result = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: withNaN }]));
    for (const value of result.vector) expect(Number.isFinite(value)).toBe(true);
  });

  it('treats an incomplete hand as absent', () => {
    const result = extractFeatureVector(
      frame([{ handedness: 'Right', score: 0.99, landmarks: OPEN_HAND.slice(0, 20) }]),
    );
    expect(result.handCount).toBe(0);
    expect(result.vector[127]).toBe(0);
  });
});

describe('hand slot selection', () => {
  it('places hands in fixed left/right slots regardless of input order', () => {
    const left = { handedness: 'Left' as const, score: 0.7, landmarks: mirror(OPEN_HAND) };
    const right = { handedness: 'Right' as const, score: 0.9, landmarks: OPEN_HAND };

    const a = extractFeatureVector(frame([left, right]));
    const b = extractFeatureVector(frame([right, left]));
    expect(Array.from(a.vector)).toEqual(Array.from(b.vector));
  });

  it('keeps the higher-scoring hand when two share a handedness', () => {
    const weak = { handedness: 'Right' as const, score: 0.3, landmarks: transform(OPEN_HAND, { dx: 0.5 }) };
    const strong = { handedness: 'Right' as const, score: 0.97, landmarks: OPEN_HAND };

    const [left, right] = selectHandSlots([weak, strong]);
    expect(left).toBeNull();
    expect(right?.score).toBe(0.97);

    const [left2, right2] = selectHandSlots([strong, weak]);
    expect(left2).toBeNull();
    expect(right2?.score).toBe(0.97);
  });

  it('reports the best handedness score across both hands', () => {
    const result = extractFeatureVector(
      frame([
        { handedness: 'Left', score: 0.62, landmarks: mirror(OPEN_HAND) },
        { handedness: 'Right', score: 0.88, landmarks: OPEN_HAND },
      ]),
    );
    expect(result.bestHandScore).toBeCloseTo(0.88, 6);
    expect(result.handCount).toBe(2);
  });

  it('ignores an incomplete hand when choosing a slot', () => {
    const [left, right] = selectHandSlots([
      { handedness: 'Left', score: 0.99, landmarks: OPEN_HAND.slice(0, 10) },
      { handedness: 'Right', score: 0.5, landmarks: OPEN_HAND },
    ]);
    expect(left).toBeNull();
    expect(right?.score).toBe(0.5);
  });
});

describe('pose handling', () => {
  it('normalises the hand centroid by shoulder width', () => {
    // Index 130/131 is the RIGHT hand's centroid (128/129 belongs to the left slot).
    const handAt = transform(OPEN_HAND, { dx: 0.5, dy: 0.5 });
    const wide = extractFeatureVector(
      frame([{ handedness: 'Right', score: 0.9, landmarks: handAt }], poseWithShoulders(0.2, 0.8)),
    );
    const narrow = extractFeatureVector(
      frame([{ handedness: 'Right', score: 0.9, landmarks: handAt }], poseWithShoulders(0.45, 0.55)),
    );

    expect(wide.vector[158]).toBe(1);
    expect(narrow.vector[158]).toBe(1);
    // Same physical hand position, different apparent shoulder width: the wider shoulders
    // must produce a smaller normalised offset. That is what makes the feature robust to
    // how close the person is standing to the camera.
    expect(Math.abs(wide.vector[130] as number)).toBeGreaterThan(0);
    expect(Math.abs(wide.vector[130] as number)).toBeLessThan(Math.abs(narrow.vector[130] as number));
  });

  it('leaves the centroid block at zero when there is no pose', () => {
    const result = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: OPEN_HAND }]));
    expect(block(result, 128, 131).every((value) => value === 0)).toBe(true);
    expect(result.vector[158]).toBe(0);
  });

  it('leaves the centroid block at zero when the shoulders coincide', () => {
    const result = extractFeatureVector(
      frame([{ handedness: 'Right', score: 0.9, landmarks: OPEN_HAND }], poseWithShoulders(0.5, 0.5)),
    );
    expect(block(result, 128, 131).every((value) => value === 0)).toBe(true);
    expect(result.vector[158]).toBe(0);
  });

  it('handles a truncated pose array without an index error', () => {
    const truncated = poseWithShoulders(0.36, 0.64).slice(0, 5);
    const result = extractFeatureVector(frame([{ handedness: 'Right', score: 0.9, landmarks: OPEN_HAND }], truncated));
    expect(result.vector[158]).toBe(0);
  });

  it('does not treat a pose-only frame as having hands', () => {
    const result = extractFeatureVector(frame([], poseWithShoulders(0.36, 0.64)));
    expect(result.handCount).toBe(0);
    expect(result.vector[158]).toBe(1);
  });
});

describe('small helpers', () => {
  it('handCentroid averages the landmarks', () => {
    const centroid = handCentroid([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: 0 },
    ]);
    expect(centroid.x).toBeCloseTo(0.5, 6);
    expect(centroid.y).toBeCloseTo(1, 6);
  });

  it('handCentroid ignores unusable landmarks', () => {
    const centroid = handCentroid([
      { x: 0, y: 0, z: 0 },
      { x: Number.NaN, y: 10, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]);
    expect(centroid.x).toBeCloseTo(0.5, 6);
  });

  it('handCentroid returns zero for an empty list', () => {
    expect(handCentroid([])).toEqual({ x: 0, y: 0 });
  });

  it('palmNormal returns zero for an incomplete hand', () => {
    expect(palmNormal(OPEN_HAND.slice(0, 5))).toEqual([0, 0, 0]);
  });

  it('palmNormal flips sign when the hand is mirrored', () => {
    const right = palmNormal(OPEN_HAND);
    const left = palmNormal(mirror(OPEN_HAND));
    // Mirroring flips the handedness of the palm plane, which is exactly the signal the
    // normal exists to capture: it is what lets a model tell a left hand from a right one.
    expect(right[2]).not.toBe(0);
    expect(Math.sign(left[2])).toBe(-Math.sign(right[2]));
  });

  it('palmNormal is unchanged by a 180 degree rotation, unlike a mirror', () => {
    // Documents why `mirror()` is separate from `transform({ scale: -1 })`. A 180 degree
    // rotation negates both x and y, which leaves the cross product's z sign alone.
    const rotated = transform(OPEN_HAND, { scale: -1 });
    expect(Math.sign(palmNormal(rotated)[2])).toBe(Math.sign(palmNormal(OPEN_HAND)[2]));
  });
});

describe('landmark completeness and occlusion simulation', () => {
  it('counts 21 usable landmarks on a clean open hand', () => {
    const hand = { handedness: 'Right' as const, score: 0.95, landmarks: OPEN_HAND };
    expect(countUsableLandmarks(hand)).toBe(21);
    expect(isHandComplete(hand)).toBe(true);
    expect(computeLandmarkCompleteness([hand])).toBe(1.0);
  });

  it('detects missing coordinates as unusable', () => {
    const corrupted = OPEN_HAND.map((lm, i) =>
      i < 5 ? { x: Number.NaN, y: lm.y, z: lm.z } : lm,
    );
    const hand = { handedness: 'Right' as const, score: 0.95, landmarks: corrupted };
    expect(countUsableLandmarks(hand)).toBe(16);
    expect(MIN_USABLE_LANDMARKS_PER_HAND).toBe(18);
    expect(isHandComplete(hand)).toBe(false);
    expect(computeLandmarkCompleteness([hand])).toBe(16 / 21);
  });

  it('detects low-visibility landmarks as unusable', () => {
    const lowVis = OPEN_HAND.map((lm, i) =>
      i < 4 ? { ...lm, visibility: 0.2 } : { ...lm, visibility: 0.9 },
    );
    const hand = { handedness: 'Right' as const, score: 0.95, landmarks: lowVis };
    expect(countUsableLandmarks(hand)).toBe(17);
    expect(isHandComplete(hand)).toBe(false);
  });

  it('applyOcclusionSimulation drops 10 distal landmarks and triggers incomplete status', () => {
    const cleanFrame = frame([{ handedness: 'Right', score: 0.95, landmarks: OPEN_HAND }]);
    const occludedFrame = applyOcclusionSimulation(cleanFrame);

    expect(occludedFrame.hands).toHaveLength(1);
    const occludedHand = occludedFrame.hands[0]!;
    // 10 distal landmarks are marked with visibility: 0, leaving 11 usable
    const usableCount = countUsableLandmarks(occludedHand);
    expect(usableCount).toBe(11);
    expect(isHandComplete(occludedHand)).toBe(false);

    const completeness = computeLandmarkCompleteness(occludedFrame.hands);
    expect(completeness).toBeCloseTo(11 / 21, 4);
    expect(completeness).toBeLessThan(0.85);
  });
});


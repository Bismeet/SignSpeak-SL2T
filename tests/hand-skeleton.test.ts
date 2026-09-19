/**
 * Hand-skeleton overlay (`lib/vision/hand-skeleton.ts`).
 *
 * The overlay is drawn from the same `FrameLandmarks` objects that feed the `ss-features-v1`
 * extractor, so a bug here can only ever produce wrong pixels — it cannot change a
 * prediction. That is exactly why it needs its own tests: wrong pixels are silent, and the
 * two failure modes that matter both still look plausible on screen.
 *
 *   1. **Mirroring.** The `<video>` preview is flipped in CSS so the user sees themselves
 *      naturally, never mirrored. If the canvas bitmap is flipped as well, every skeleton is
 *      drawn on the wrong side of the frame and reads as a tracking fault. The bitmap must be
 *      mirrored *exactly once*, by this module, and never again by CSS.
 *   2. **Missing points.** MediaPipe returns a short or partly-empty array the moment a hand
 *      leaves the frame. An unconditional `landmarks[17].x` throws inside the animation frame
 *      and takes the whole analysis loop down while the camera is still on.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FINGERTIP_INDICES,
  HAND_CONNECTIONS,
  drawHandOverlay,
  drawSkeleton,
  colorForHand,
  LEFT_HAND_COLOR,
  RIGHT_HAND_COLOR,
} from '@/lib/vision/hand-skeleton';
import type { FrameLandmarks, HandLandmarks, Landmark } from '@/lib/types';

/* ------------------------------------------------------------------------------------
 * Stub 2D context
 * ---------------------------------------------------------------------------------- */

interface DrawCall {
  op: string;
  args: number[];
}

interface StubContext {
  ctx: CanvasRenderingContext2D;
  calls: DrawCall[];
  /** Every value assigned to `shadowBlur`, in order. */
  shadowBlurs: number[];
}

/** Records the calls the module makes instead of rasterising them. */
function stubContext(): StubContext {
  const calls: DrawCall[] = [];
  const shadowBlurs: number[] = [];
  const ops: Record<string, unknown> = {};

  for (const op of ['save', 'restore', 'beginPath', 'fill', 'stroke']) {
    ops[op] = () => {
      calls.push({ op, args: [] });
    };
  }
  for (const op of ['moveTo', 'lineTo', 'arc', 'clearRect', 'fillRect']) {
    ops[op] = (...args: number[]) => {
      calls.push({ op, args });
    };
  }

  let shadowBlur = 0;
  const target: Record<string, unknown> = {
    ...ops,
    strokeStyle: '',
    fillStyle: '',
    shadowColor: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    get shadowBlur() {
      return shadowBlur;
    },
    set shadowBlur(value: number) {
      shadowBlur = value;
      shadowBlurs.push(value);
    },
  };

  return { ctx: target as unknown as CanvasRenderingContext2D, calls, shadowBlurs };
}

const WIDTH = 400;
const HEIGHT = 300;

/** 21 landmarks marching diagonally, so every index has a distinct, predictable position. */
function hand(handedness: HandLandmarks['handedness'] = 'Left', count = 21): HandLandmarks {
  return {
    handedness,
    score: 0.95,
    landmarks: Array.from({ length: count }, (_, index) => ({
      x: (index + 1) / 100,
      y: (index + 1) / 200,
      z: 0,
    })),
  };
}

/** Where the module must put landmark `index`, given the mirroring rule. */
function expectedPoint(index: number): { x: number; y: number } {
  return { x: (1 - (index + 1) / 100) * WIDTH, y: ((index + 1) / 200) * HEIGHT };
}

function arcs(calls: DrawCall[]): DrawCall[] {
  return calls.filter((call) => call.op === 'arc');
}

/** Indexed access that fails loudly, instead of `undefined` leaking into every assertion. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`no entry at index ${index} (length ${list.length})`);
  return value;
}

/** The third `arc` argument: the radius in pixels. */
function radius(call: DrawCall): number {
  return call.args[2] ?? 0;
}

function draw(handToDraw: HandLandmarks, overrides: Partial<{ strokeWeight: number; diagnostic: boolean }> = {}) {
  const stub = stubContext();
  drawSkeleton(stub.ctx, handToDraw, WIDTH, HEIGHT, {
    strokeWeight: 1,
    ...overrides,
  });
  return stub;
}

/** A frame in which only the shoulders matter, for the pose-marker tests. */
function poseFrame(): FrameLandmarks {
  return {
    hands: [],
    pose: {
      landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
    },
    timestampMs: 0,
  };
}

/* ------------------------------------------------------------------------------------
 * Connectivity and palette
 * ---------------------------------------------------------------------------------- */

describe('hand connectivity', () => {
  it('touches every one of the 21 landmarks MediaPipe produces', () => {
    const touched = new Set<number>();
    for (const [from, to] of HAND_CONNECTIONS) {
      touched.add(from);
      touched.add(to);
    }
    expect([...touched].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 21 }, (_, index) => index),
    );
  });

  it('never references a landmark outside 0..20', () => {
    for (const [from, to] of HAND_CONNECTIONS) {
      expect(Number.isInteger(from) && from >= 0 && from <= 20, `bad index ${from}`).toBe(true);
      expect(Number.isInteger(to) && to >= 0 && to <= 20, `bad index ${to}`).toBe(true);
    }
  });

  it('includes the palm webbing that makes a skeleton read as a hand', () => {
    const pairs = HAND_CONNECTIONS.map(([from, to]) => `${from}-${to}`);
    // The wrist-to-palm and inter-finger spans. Without these the fingers float as five
    // disconnected sticks and the overlay stops looking like a hand at all.
    for (const required of ['0-5', '0-17', '5-9', '9-13', '13-17']) {
      expect(pairs, `missing connection ${required}`).toContain(required);
    }
  });

  it('haloes the five fingertips and nothing else', () => {
    expect([...FINGERTIP_INDICES].sort((a, b) => a - b)).toEqual([4, 8, 12, 16, 20]);
  });
});

describe('hand colour', () => {
  it('gives each handedness its own colour', () => {
    expect(colorForHand(hand('Left'))).toBe(LEFT_HAND_COLOR);
    expect(colorForHand(hand('Right'))).toBe(RIGHT_HAND_COLOR);
    expect(LEFT_HAND_COLOR).not.toBe(RIGHT_HAND_COLOR);
  });
});

/* ------------------------------------------------------------------------------------
 * drawSkeleton
 * ---------------------------------------------------------------------------------- */

describe('drawSkeleton mirroring', () => {
  it('mirrors x exactly once, so it lines up with the CSS-flipped preview', () => {
    const single: HandLandmarks = {
      handedness: 'Right',
      score: 1,
      landmarks: [{ x: 0.25, y: 0.5, z: 0 }],
    };

    const { calls } = draw(single, { diagnostic: true });
    const dot = at(arcs(calls), 0);

    // 0.25 of the way across the *camera* frame is 0.75 of the way across the *preview*.
    expect(dot.args[0]).toBeCloseTo(0.75 * WIDTH, 6);
    expect(dot.args[1]).toBeCloseTo(0.5 * HEIGHT, 6);
  });

  it('mirrors every landmark, not just the wrist', () => {
    const { calls } = draw(hand('Left'), { diagnostic: true });
    const dots = arcs(calls);

    for (const index of [0, 4, 9, 20]) {
      const expected = expectedPoint(index);
      const dot = at(dots, index);
      expect(dot.args[0], `x of landmark ${index}`).toBeCloseTo(expected.x, 6);
      expect(dot.args[1], `y of landmark ${index}`).toBeCloseTo(expected.y, 6);
    }
  });
});

describe('drawSkeleton robustness', () => {
  it('draws nothing but does not throw when every landmark is missing', () => {
    const empty: HandLandmarks = { handedness: 'Left', score: 0, landmarks: [] };

    const stub = stubContext();
    expect(() =>
      drawSkeleton(stub.ctx, empty, WIDTH, HEIGHT, {
        strokeWeight: 1,
        diagnostic: true,
      }),
    ).not.toThrow();
    expect(stub.calls.filter((call) => call.op === 'moveTo')).toHaveLength(0);
    expect(arcs(stub.calls)).toHaveLength(0);
  });

  it('skips NaN and undefined points instead of crashing the animation frame', () => {
    const broken: HandLandmarks = {
      handedness: 'Right',
      score: 0.4,
      landmarks: [
        { x: Number.NaN, y: 0.5, z: 0 },
        undefined as unknown as Landmark,
        { x: 0.5, y: 0.5, z: 0 },
      ],
    };

    const stub = stubContext();
    expect(() =>
      drawSkeleton(stub.ctx, broken, WIDTH, HEIGHT, {
        strokeWeight: 1,
        diagnostic: true,
      }),
    ).not.toThrow();

    // One usable point: its coloured dot and its white core, but no bone — a bone needs two
    // valid ends, so every connection is skipped.
    expect(arcs(stub.calls).filter((call) => radius(call) === 4)).toHaveLength(1);
    expect(stub.calls.filter((call) => call.op === 'moveTo')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------------------
 * drawHandOverlay
 * ---------------------------------------------------------------------------------- */

describe('drawSkeleton styling', () => {
  it('draws a ring on each fingertip and nothing else', () => {
    const { calls } = draw(hand('Left'));
    const rings = arcs(calls).filter((call) => radius(call) >= 9);

    const fingertips = [...FINGERTIP_INDICES];
    expect(rings).toHaveLength(fingertips.length);
    rings.forEach((ring, position) => {
      const expected = expectedPoint(at(fingertips, position));
      expect(ring.args[0]).toBeCloseTo(expected.x, 6);
      expect(ring.args[1]).toBeCloseTo(expected.y, 6);
      expect(radius(ring)).toBeGreaterThanOrEqual(9);
      expect(radius(ring)).toBeLessThanOrEqual(16);
    });
  });

  it('is frame-rate independent — the overlay never animates on its own', () => {
    // docs/ui-ux-specification.md §1 forbids auto-playing animation, and the skeleton used
    // to breathe its fingertip halo on a sine of the frame clock. `drawSkeleton` no longer
    // takes a clock at all, so two calls with identical input must be byte-identical.
    const first = draw(hand('Left'));
    const second = draw(hand('Left'));

    expect(second.calls).toEqual(first.calls);
    expect(second.shadowBlurs).toEqual(first.shadowBlurs);
  });

  it('scales the halo with the weight slider, and zero weight really is zero', () => {
    const off = draw(hand('Left'), { strokeWeight: 0 });
    const bright = draw(hand('Left'), { strokeWeight: 2 });

    // 14 px of halo per unit of weight, and no other source of blur.
    expect(Math.max(...off.shadowBlurs)).toBe(0);
    expect(Math.max(...bright.shadowBlurs)).toBe(28);
  });

  it('treats the diagnostic points as an extra layer, not a replacement', () => {
    const without = draw(hand('Left'), { diagnostic: false });
    const withPoints = draw(hand('Left'), { diagnostic: true });

    // 21 joint dots plus 21 white cores, on top of the bones and fingertip halos that both
    // modes share, so turning the settings switch off never empties the overlay.
    expect(arcs(withPoints.calls).length - arcs(without.calls).length).toBe(42);
    expect(without.calls.filter((call) => call.op === 'moveTo').length).toBe(
      withPoints.calls.filter((call) => call.op === 'moveTo').length,
    );
  });
});

describe('drawHandOverlay', () => {
  function overlay(frame: FrameLandmarks, options: { diagnostic?: boolean; videoOpacity?: number } = {}) {
    const stub = stubContext();
    drawHandOverlay(stub.ctx, frame, WIDTH, HEIGHT, {
      strokeWeight: 1,
      videoOpacity: 1,
      ...options,
    });
    return stub;
  }

  const frameWith = (hands: HandLandmarks[]): FrameLandmarks => ({
    hands,
    pose: null,
    timestampMs: 0,
  });

  it('clears the previous frame before drawing the new one', () => {
    const { calls } = overlay(frameWith([hand('Left')]));
    const first = at(calls, 0);
    expect(first.op).toBe('clearRect');
    expect(first.args).toEqual([0, 0, WIDTH, HEIGHT]);
  });

  it('draws one skeleton per detected hand', () => {
    const two = overlay(frameWith([hand('Left'), hand('Right')]));
    const one = overlay(frameWith([hand('Left')]));

    const bones = (stub: StubContext) => stub.calls.filter((call) => call.op === 'moveTo').length;
    expect(bones(one)).toBe(HAND_CONNECTIONS.length);
    expect(bones(two)).toBe(HAND_CONNECTIONS.length * 2);
  });

  it('skips a hand entry that carries no landmarks', () => {
    const { calls } = overlay(frameWith([{ handedness: 'Left', score: 0, landmarks: [] }]));
    expect(calls.filter((call) => call.op === 'moveTo')).toHaveLength(0);
    expect(arcs(calls)).toHaveLength(0);
  });

  it('dims the picture only when the feed is faded', () => {
    expect(overlay(frameWith([]), { videoOpacity: 1 }).calls.filter((c) => c.op === 'fillRect'))
      .toHaveLength(0);
    expect(overlay(frameWith([]), { videoOpacity: 0.4 }).calls.filter((c) => c.op === 'fillRect'))
      .toHaveLength(1);
  });

  it('marks the shoulders only in diagnostic mode', () => {
    // Only the shoulders are marked, so the hand list is empty and every arc comes from the
    // pose. Landmark 11 is the left shoulder and 12 the right.
    expect(arcs(overlay(poseFrame(), { diagnostic: true }).calls)).toHaveLength(2);
    expect(arcs(overlay(poseFrame(), { diagnostic: false }).calls)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------------------
 * Wiring guards (same source-scan technique as tests/device-status.test.ts)
 * ---------------------------------------------------------------------------------- */

function readSource(...segments: string[]): string {
  return readFileSync(resolve(__dirname, '..', ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('the overlay is mirrored once, not twice', () => {
  it('leaves the preview flipped but the canvas unflipped', () => {
    const panel = readSource('components', 'camera', 'CameraPanel.tsx');
    const canvas = panel.match(/<canvas[\s\S]*?\/>/)?.[0] ?? '';

    expect(canvas, 'the overlay canvas is missing from the panel').toContain('overlayCanvasRef');
    // A CSS flip here, on top of the module's own mirroring, cancels it out and draws the
    // skeleton on the wrong side of the frame — which reads as a tracking fault, not a
    // rendering one.
    expect(canvas).not.toContain('scale-x-[-1]');
    // The preview itself must stay mirrored, or the user sees themselves backwards.
    expect(panel).toMatch(/<video[\s\S]*?scale-x-\[-1\]/);
  });

  it('always draws the skeleton instead of gating it behind a setting', () => {
    const panel = readSource('components', 'camera', 'CameraPanel.tsx');
    const canvas = panel.match(/<canvas[\s\S]*?\/>/)?.[0] ?? '';

    // The skeleton is the overlay, so it must not be conditionally hidden. The setting it used to
    // depend on now adds the diagnostic joint dots on top (see the module's `diagnostic`).
    expect(canvas).not.toMatch(/'hidden'/);
    expect(canvas).not.toContain('showLandmarkOverlay');
    expect(panel).toContain("update('showLandmarkOverlay'");
  });

  it('draws the overlay from the same frame that is classified', () => {
    const hook = readSource('lib', 'vision', 'use-sign-recognition.ts');
    const drawIndex = hook.indexOf('drawOverlay(frame, video)');
    const classifyIndex = hook.indexOf('await ensureClassifier()');

    expect(drawIndex, 'the loop never draws the overlay').toBeGreaterThan(-1);
    expect(classifyIndex, 'the classify call was moved or renamed').toBeGreaterThan(-1);
    // Drawn first, so the visualiser keeps working while the model is still loading or has
    // failed. The same `frame` object then reaches the feature extractor untouched, so the
    // overlay can never change what is classified.
    expect(drawIndex).toBeLessThan(classifyIndex);
  });
});
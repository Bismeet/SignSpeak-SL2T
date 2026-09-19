/**
 * Hand-skeleton overlay rendering (unit-tested separately in tests/hand-skeleton.test.ts).
 *
 * Consumes the SAME FrameLandmarks objects that feed the ss-features-v1
 * ONNX inference loop. No landmark extraction or classification here.
 *
 * The overlay is deliberately **static**. It previously drew a neon bloom and a
 * time-varying pulsing halo on every fingertip; both are gone, for two independent
 * reasons:
 *
 *   1. Auto-playing animation is forbidden by docs/ui-ux-specification.md §1 ("no
 *      auto-playing animations except user-initiated clip playback"). A decorative pulse
 *      over a live camera is exactly that, and it never carried information — the same
 *      state was already in the tracking indicator and the FPS readout.
 *   2. Legibility. A coloured bloom disappears against a bright, cluttered camera
 *      background. A *dark* halo behind a saturated stroke is what makes the skeleton
 *      readable over a white hospital wall, and it does not depend on frame timing.
 *
 * Handedness is still carried by hue (left vs right), because handedness is a real
 * phonological distinction in ISL and must not be flattened.
 */
import type { FrameLandmarks, HandLandmarks, Landmark } from '@/lib/types';

/** MediaPipe hand connectivity (21 landmarks). */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
] as const;

/** Fingertip indices get an enlarged ring so they are easy to aim. */
export const FINGERTIP_INDICES: ReadonlySet<number> = new Set([4, 8, 12, 16, 20]);

/**
 * Left and right hands are drawn in two distinguishable clinical accents — medical blue
 * and teal — rather than the neon cyan/magenta pair this replaces. Both are readable on
 * a camera background and neither is a "glow" colour.
 */
export const LEFT_HAND_COLOR = 'rgb(96, 165, 250)';
export const LEFT_HAND_COLOR_SOFT = 'rgba(96, 165, 250, 0.55)';
export const RIGHT_HAND_COLOR = 'rgb(45, 212, 191)';
export const RIGHT_HAND_COLOR_SOFT = 'rgba(45, 212, 191, 0.55)';
export const POINT_CORE = '#ffffff';

/** Dark halo behind the stroke, so the skeleton reads over a bright camera image. */
const HALO_COLOR = 'rgba(0, 0, 0, 0.55)';

/** Fixed radius of the fingertip ring. Static by design — see the file header. */
const FINGERTIP_RING_RADIUS = 10;

export interface SkeletonStyle {
  /** Multiplier on the halo strength; driven by the overlay weight slider. */
  strokeWeight: number;
  lineWidth?: number;
  /**
   * Extra diagnostic layer, from Settings > "Show hand landmarks": joint dots, landmark
   * cores and shoulder markers.
   *
   * The bones and the fingertip rings are the standard overlay and are drawn either way,
   * so turning the diagnostic layer off never leaves an empty overlay.
   */
  diagnostic?: boolean;
}

export function colorForHand(hand: HandLandmarks): string {
  return hand.handedness === 'Left' ? LEFT_HAND_COLOR : RIGHT_HAND_COLOR;
}

function softColorForHand(hand: HandLandmarks): string {
  return hand.handedness === 'Left' ? LEFT_HAND_COLOR_SOFT : RIGHT_HAND_COLOR_SOFT;
}

function pointFor(lm: Landmark, w: number, h: number): { x: number; y: number } {
  // Mirror to match the CSS-mirrored video preview.
  return { x: (1 - lm.x) * w, y: lm.y * h };
}

function valid(lm: Landmark | undefined): lm is Landmark {
  return Boolean(lm) && Number.isFinite(lm!.x) && Number.isFinite(lm!.y);
}

/** Draw one hand skeleton. Skips missing points safely. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  hand: HandLandmarks,
  width: number,
  height: number,
  style: SkeletonStyle,
): void {
  const color = colorForHand(hand);
  const soft = softColorForHand(hand);
  const lineWidth = style.lineWidth ?? 2.5;
  const halo = Math.max(0, 14 * style.strokeWeight);
  const pts = hand.landmarks.map((lm) => (valid(lm) ? pointFor(lm, width, height) : null));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = HALO_COLOR;
  ctx.shadowBlur = halo;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    const p = pts[a];
    const q = pts[b];
    if (!p || !q) continue;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.restore();

  // Diagnostic joint nodes: one dot per landmark plus a white core so the exact point is
  // readable. Off by default (Settings > "Show hand landmarks").
  if (style.diagnostic) {
    ctx.save();
    ctx.shadowColor = HALO_COLOR;
    ctx.shadowBlur = halo;
    ctx.fillStyle = color;
    for (const p of pts) {
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = POINT_CORE;
    for (const p of pts) {
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Static fingertip rings. No pulse: the radius is constant across frames.
  ctx.save();
  ctx.strokeStyle = soft;
  ctx.fillStyle = color;
  ctx.shadowColor = HALO_COLOR;
  ctx.shadowBlur = halo;
  ctx.lineWidth = 1.6;
  for (const index of FINGERTIP_INDICES) {
    const p = pts[index];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, FINGERTIP_RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = POINT_CORE;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
  }
  ctx.restore();
}

/** Full overlay: optional dimming backdrop + every hand + shoulder markers. */
export function drawHandOverlay(
  ctx: CanvasRenderingContext2D,
  frame: FrameLandmarks,
  width: number,
  height: number,
  options: SkeletonStyle & { videoOpacity: number },
): void {
  ctx.clearRect(0, 0, width, height);
  const dim = 1 - Math.min(1, Math.max(0, options.videoOpacity));
  if (dim > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(9, 10, 15, ${(0.88 * dim).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  for (const hand of frame.hands) {
    if (!hand || !Array.isArray(hand.landmarks) || hand.landmarks.length === 0) continue;
    drawSkeleton(ctx, hand, width, height, options);
  }
  if (frame.pose && options.diagnostic) {
    ctx.save();
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
    ctx.shadowColor = HALO_COLOR;
    ctx.shadowBlur = 14 * Math.max(0, options.strokeWeight);
    ctx.lineWidth = 1.5;
    for (const index of [11, 12]) {
      const lm = frame.pose.landmarks[index];
      if (!valid(lm)) continue;
      const p = pointFor(lm, width, height);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

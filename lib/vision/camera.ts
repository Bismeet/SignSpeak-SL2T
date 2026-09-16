/**
 * Camera access with exhaustive, user-facing error handling.
 *
 * Every failure mode in `docs/technical-architecture.md` §6 is mapped to a plain-language
 * cause, a fix, and a working alternative so no permission state is ever a dead end.
 *
 * Frames never leave this module: the stream is handed to MediaPipe and to the preview
 * element only. Nothing is recorded, encoded or uploaded (NFR-01).
 */

import type { CameraStatus } from '@/lib/types';

export interface CameraFailure {
  status: Exclude<CameraStatus, 'idle' | 'requesting' | 'streaming' | 'paused'>;
  /** Short heading for the error panel. */
  title: string;
  /** One sentence: what went wrong. */
  cause: string;
  /** One sentence: what the user should do. */
  fix: string;
  /** True when a retry button should be offered. */
  retryable: boolean;
  /** Raw error name, for the developer console only. */
  technical?: string;
}

/** Is the page running in a secure context (required for getUserMedia)? */
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  // localhost counts as a secure context, which is why the local demo path works.
  return window.isSecureContext === true;
}

export function hasMediaDevices(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export function cameraSupported(): boolean {
  return isSecureContext() && hasMediaDevices();
}

/** Map a `getUserMedia` rejection into a `CameraFailure`. */
export function describeCameraError(error: unknown): CameraFailure {
  const name = error instanceof Error ? error.name : typeof error === 'string' ? error : '';
  const message = error instanceof Error ? error.message : '';

  if (!isSecureContext()) {
    return {
      status: 'insecure-context',
      title: 'Camera needs a secure connection',
      cause: 'The page is not running over HTTPS, so the browser blocks camera access.',
      fix: 'Open SignSpeak over https:// or on localhost, then try again.',
      retryable: false,
      technical: name,
    };
  }

  if (!hasMediaDevices()) {
    return {
      status: 'unsupported',
      title: 'This browser cannot use the camera',
      cause: 'The browser does not expose the camera API SignSpeak needs.',
      fix: 'Use Chrome, Edge or Safari on desktop or Android. The phrase board and typing still work.',
      retryable: false,
      technical: name,
    };
  }

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        status: 'denied',
        title: 'Camera permission was declined',
        cause: 'SignSpeak cannot detect signs without access to the camera.',
        fix: 'Allow camera access in the address bar, then press Try again. You can also use the phrase board or type instead.',
        retryable: true,
        technical: name,
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        status: 'not-found',
        title: 'No camera found',
        cause: 'This device has no camera available to the browser.',
        fix: 'Connect a camera and press Try again, or continue with the phrase board.',
        retryable: true,
        technical: name,
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        status: 'in-use',
        title: 'Camera is busy',
        cause: 'Another app or browser tab is already using the camera.',
        fix: 'Close the other app or tab that is using the camera, then press Try again.',
        retryable: true,
        technical: name,
      };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        status: 'error',
        title: 'Camera settings are not supported',
        cause: 'The camera cannot provide a video mode SignSpeak can use.',
        fix: 'Try a different camera, or continue with the phrase board.',
        retryable: true,
        technical: name,
      };
    case 'AbortError':
      return {
        status: 'error',
        title: 'Camera start was interrupted',
        cause: 'The camera stopped responding while it was starting.',
        fix: 'Press Try again.',
        retryable: true,
        technical: name,
      };
    default:
      return {
        status: 'error',
        title: 'Camera could not start',
        cause: message || 'An unexpected camera error occurred.',
        fix: 'Press Try again, or continue with the phrase board and typing.',
        retryable: true,
        technical: name,
      };
  }
}

export interface CameraConstraintsOptions {
  /** Target capture width. Lower values improve FPS on low-end phones (risk R7). */
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
}

/** The constraints SignSpeak requests. 640x480 is the sweet spot for MediaPipe on phones. */
export function buildConstraints(options: CameraConstraintsOptions = {}): MediaStreamConstraints {
  const { width = 640, height = 480, facingMode = 'user' } = options;
  return {
    audio: false,
    video: {
      facingMode,
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 30, max: 30 },
    },
  };
}

export interface CameraStartResult {
  ok: true;
  stream: MediaStream;
  track: MediaStreamTrack;
}

export interface CameraStartFailure {
  ok: false;
  failure: CameraFailure;
}

/**
 * Request the camera. Always call this from a user gesture so the permission prompt
 * is meaningful and the app never opens the camera on page load.
 */
export async function startCamera(
  options: CameraConstraintsOptions = {},
): Promise<CameraStartResult | CameraStartFailure> {
  if (!cameraSupported()) {
    const failure = describeCameraError(new Error('unsupported'));
    return { ok: false, failure };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(options));
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stopStream(stream);
      return {
        ok: false,
        failure: {
          status: 'not-found',
          title: 'No video track',
          cause: 'The camera returned a stream without video.',
          fix: 'Press Try again, or continue with the phrase board.',
          retryable: true,
        },
      };
    }
    return { ok: true, stream, track };
  } catch (error) {
    return { ok: false, failure: describeCameraError(error) };
  }
}

/** Stop every track in a stream. Safe to call with a null/undefined stream. */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Stopping an already-ended track throws in some browsers; nothing to do.
    }
  }
}

/**
 * Watch for the camera being revoked outside the app (T-PERM-08: state must update
 * within 2 seconds). Returns an unsubscribe function.
 */
export function watchTrackEnded(
  track: MediaStreamTrack,
  onEnded: () => void,
): () => void {
  const handler = () => onEnded();
  track.addEventListener('ended', handler);
  return () => track.removeEventListener('ended', handler);
}

/**
 * Rough frames-per-second meter. Used to warn when the pipeline drops below the 8 FPS
 * threshold from `docs/technical-architecture.md` §6 (risk R7).
 */
export class FpsMeter {
  private samples: number[] = [];

  constructor(private readonly windowSize = 30) {}

  /** Record a frame timestamp; returns the current smoothed FPS. */
  tick(timestampMs: number): number {
    this.samples.push(timestampMs);
    if (this.samples.length > this.windowSize) this.samples.shift();
    if (this.samples.length < 2) return 0;
    const first = this.samples[0] as number;
    const last = this.samples[this.samples.length - 1] as number;
    const elapsed = last - first;
    if (elapsed <= 0) return 0;
    return ((this.samples.length - 1) * 1000) / elapsed;
  }

  reset(): void {
    this.samples = [];
  }
}

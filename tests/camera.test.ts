/**
 * Camera error mapping, constraint building and the FPS meter (T-PERM-01..08).
 *
 * The invariant that matters: **every** camera failure produces a cause, a fix and a
 * working alternative. A permission state that dead-ends would strand a patient in a
 * hospital with no way to communicate, which is the failure this whole application exists
 * to prevent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FpsMeter,
  buildConstraints,
  cameraSupported,
  describeCameraError,
  hasMediaDevices,
  isSecureContext,
  startCamera,
  stopStream,
  watchTrackEnded,
} from '@/lib/vision/camera';
import { config } from '@/lib/config';

function namedError(name: string, message = ''): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** Force a secure context, since jsdom reports `isSecureContext` inconsistently. */
function setSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
}

describe('context detection', () => {
  afterEach(() => {
    setSecureContext(true);
  });

  it('reports a secure context correctly', () => {
    setSecureContext(true);
    expect(isSecureContext()).toBe(true);
    setSecureContext(false);
    expect(isSecureContext()).toBe(false);
  });

  it('requires both a secure context and mediaDevices to consider the camera supported', () => {
    setSecureContext(true);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve({}) },
    });
    expect(hasMediaDevices()).toBe(true);
    expect(cameraSupported()).toBe(true);

    setSecureContext(false);
    expect(cameraSupported()).toBe(false);
  });

  it('reports no mediaDevices when the browser does not expose them', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    expect(hasMediaDevices()).toBe(false);
    expect(cameraSupported()).toBe(false);
  });
});

describe('error mapping', () => {
  beforeEach(() => {
    setSecureContext(true);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve({}) },
    });
  });

  const cases: Array<[string, string, boolean]> = [
    ['NotAllowedError', 'denied', true],
    ['PermissionDeniedError', 'denied', true],
    ['SecurityError', 'denied', true],
    ['NotFoundError', 'not-found', true],
    ['DevicesNotFoundError', 'not-found', true],
    ['NotReadableError', 'in-use', true],
    ['TrackStartError', 'in-use', true],
    ['OverconstrainedError', 'error', true],
    ['ConstraintNotSatisfiedError', 'error', true],
    ['AbortError', 'error', true],
    ['SomethingElseError', 'error', true],
  ];

  it.each(cases)('maps %s to %s', (name, status, retryable) => {
    const failure = describeCameraError(namedError(name, 'boom'));
    expect(failure.status).toBe(status);
    expect(failure.retryable).toBe(retryable);
    expect(failure.technical).toBe(name);
  });

  it('gives every failure a title, a cause and a fix', () => {
    const names = [
      'NotAllowedError',
      'NotFoundError',
      'NotReadableError',
      'OverconstrainedError',
      'AbortError',
      'Unknown',
    ];
    for (const name of names) {
      const failure = describeCameraError(namedError(name));
      expect(failure.title.length, name).toBeGreaterThan(5);
      expect(failure.cause.length, name).toBeGreaterThan(10);
      expect(failure.fix.length, name).toBeGreaterThan(10);
    }
  });

  it('always names a working alternative so no failure is a dead end', () => {
    const names = [
      'NotAllowedError',
      'NotFoundError',
      'NotReadableError',
      'OverconstrainedError',
      'AbortError',
      'Unknown',
    ];
    for (const name of names) {
      const failure = describeCameraError(namedError(name));
      expect(
        /phrase board|typing|type instead|Try again|try again/i.test(failure.fix),
        `${name}: fix "${failure.fix}" offers no next step`,
      ).toBe(true);
    }
  });

  it('prioritises the insecure-context explanation over the error name', () => {
    setSecureContext(false);
    const failure = describeCameraError(namedError('NotAllowedError'));
    expect(failure.status).toBe('insecure-context');
    expect(failure.retryable).toBe(false);
    expect(failure.fix).toMatch(/https/i);
  });

  it('reports an unsupported browser when mediaDevices is missing', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const failure = describeCameraError(namedError('NotAllowedError'));
    expect(failure.status).toBe('unsupported');
    expect(failure.retryable).toBe(false);
    expect(failure.fix).toMatch(/phrase board|typing/i);
  });

  it('accepts a bare string error name', () => {
    expect(describeCameraError('NotAllowedError').status).toBe('denied');
  });

  it('accepts a non-error value without throwing', () => {
    const failure = describeCameraError(undefined);
    expect(failure.status).toBe('error');
    expect(failure.title).toBeTruthy();
  });

  it('surfaces the raw message for an unexpected error', () => {
    const failure = describeCameraError(namedError('WeirdError', 'the device exploded'));
    expect(failure.cause).toBe('the device exploded');
  });
});

describe('constraints', () => {
  it('requests a video-only 640x480 stream at 30 fps by default', () => {
    const constraints = buildConstraints();
    expect(constraints.audio).toBe(false);
    const video = constraints.video as MediaTrackConstraints;
    expect(video.facingMode).toBe('user');
    expect(video.width).toEqual({ ideal: 640 });
    expect(video.height).toEqual({ ideal: 480 });
    expect(video.frameRate).toEqual({ ideal: 30, max: 30 });
  });

  it('never requests audio, under any option combination', () => {
    // NFR-01: the microphone must only be opened by an explicit speech action.
    for (const options of [{}, { width: 320 }, { facingMode: 'environment' as const }]) {
      expect(buildConstraints(options).audio).toBe(false);
    }
  });

  it('honours a reduced resolution for low-end devices (risk R7)', () => {
    const video = buildConstraints({ width: 320, height: 240 }).video as MediaTrackConstraints;
    expect(video.width).toEqual({ ideal: 320 });
    expect(video.height).toEqual({ ideal: 240 });
  });

  it('defaults to the configured capture size', () => {
    const video = buildConstraints().video as MediaTrackConstraints;
    expect((video.width as { ideal: number }).ideal).toBe(config.captureWidth);
    expect((video.height as { ideal: number }).ideal).toBe(config.captureHeight);
  });

  it('can use the rear camera', () => {
    const video = buildConstraints({ facingMode: 'environment' }).video as MediaTrackConstraints;
    expect(video.facingMode).toBe('environment');
  });
});

describe('startCamera', () => {
  beforeEach(() => {
    setSecureContext(true);
  });

  it('returns the stream and track on success', async () => {
    const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const result = await startCamera();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.track).toBe(track);
  });

  it('maps a rejection into a failure rather than throwing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(namedError('NotAllowedError')) },
    });

    const result = await startCamera();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.status).toBe('denied');
  });

  it('stops the stream and reports not-found when no video track is returned', async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [],
          getTracks: () => [{ stop }],
        }),
      },
    });

    const result = await startCamera();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.status).toBe('not-found');
    expect(stop).toHaveBeenCalled();
  });

  it('fails cleanly when the browser cannot support the camera at all', async () => {
    setSecureContext(false);
    const result = await startCamera();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.status).toBe('insecure-context');
  });
});

describe('stopStream', () => {
  it('stops every track', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    stopStream({ getTracks: () => [{ stop: stopA }, { stop: stopB }] } as unknown as MediaStream);
    expect(stopA).toHaveBeenCalled();
    expect(stopB).toHaveBeenCalled();
  });

  it('survives a track that throws when stopped', () => {
    const stop = vi.fn(() => {
      throw new Error('already ended');
    });
    expect(() =>
      stopStream({ getTracks: () => [{ stop }] } as unknown as MediaStream),
    ).not.toThrow();
  });

  it('is a no-op for null and undefined', () => {
    expect(() => stopStream(null)).not.toThrow();
    expect(() => stopStream(undefined)).not.toThrow();
  });
});

describe('watchTrackEnded', () => {
  it('calls back when the track ends and unsubscribes cleanly (T-PERM-08)', () => {
    const listeners = new Map<string, () => void>();
    const track = {
      addEventListener: (name: string, handler: () => void) => listeners.set(name, handler),
      removeEventListener: (name: string) => listeners.delete(name),
    } as unknown as MediaStreamTrack;

    const onEnded = vi.fn();
    const unsubscribe = watchTrackEnded(track, onEnded);

    listeners.get('ended')?.();
    expect(onEnded).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(listeners.has('ended')).toBe(false);
  });
});

describe('FpsMeter', () => {
  it('reports zero until it has two samples', () => {
    const meter = new FpsMeter();
    expect(meter.tick(0)).toBe(0);
    expect(meter.tick(16)).toBeGreaterThan(0);
  });

  it('computes a sensible frame rate', () => {
    const meter = new FpsMeter();
    let fps = 0;
    for (let index = 0; index < 10; index += 1) fps = meter.tick(index * 20);
    // 20 ms apart is 50 fps.
    expect(fps).toBeCloseTo(50, 0);
  });

  it('does not divide by zero when timestamps do not advance', () => {
    const meter = new FpsMeter();
    meter.tick(100);
    expect(meter.tick(100)).toBe(0);
  });

  it('only remembers the configured window', () => {
    const meter = new FpsMeter(3);
    meter.tick(0);
    meter.tick(10);
    meter.tick(20);
    meter.tick(30);
    // Window is [10, 20, 30] -> 2 intervals over 20 ms -> 100 fps.
    expect(meter.tick(40)).toBeGreaterThan(0);
  });

  it('resets', () => {
    const meter = new FpsMeter();
    meter.tick(0);
    meter.tick(16);
    meter.reset();
    expect(meter.tick(1000)).toBe(0);
  });
});

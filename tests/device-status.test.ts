/**
 * Device status tests.
 *
 * These exist because of a real bug: `cameraPill()` was correct and well tested in
 * isolation, but **nothing ever called `setCamera`**, so the header pill was permanently
 * stuck on "Camera off" while the camera was streaming. The microphone half worked because
 * `lib/speech/use-asr.ts` does publish its state.
 *
 * A pure-function test cannot catch that. Testing it properly would mean rendering the
 * recognition hook, which pulls in MediaPipe and a real video element, so the wiring is
 * guarded with a source scan — the same technique this suite already uses for the
 * conversation reducer's storage ban, the inference backend's payload and the speech
 * capability detection's user-agent ban. It is a blunt guard, but it fails loudly if someone
 * removes the publish call, which is exactly the regression that happened.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cameraPill, micPill } from '@/lib/state/device-status';
import type { CameraStatus } from '@/lib/types';

function readSource(...segments: string[]): string {
  const source = readFileSync(resolve(__dirname, '..', ...segments), 'utf8');
  // Strip comments so the explanatory prose does not trip the assertions.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const ALL_CAMERA_STATUSES: CameraStatus[] = [
  'idle',
  'requesting',
  'streaming',
  'paused',
  'denied',
  'not-found',
  'in-use',
  'unsupported',
  'insecure-context',
  'error',
];

describe('camera pill copy', () => {
  it('gives every camera status a label, a tone and an icon', () => {
    for (const status of ALL_CAMERA_STATUSES) {
      const pill = cameraPill(status);
      expect(pill.label.length, `no label for ${status}`).toBeGreaterThan(3);
      expect(['neutral', 'success', 'warning', 'danger']).toContain(pill.tone);
      expect(['camera', 'camera-off']).toContain(pill.icon);
    }
  });

  it('says "Camera on" only while actually streaming', () => {
    expect(cameraPill('streaming').label).toBe('Camera on');
    expect(cameraPill('streaming').tone).toBe('success');
    expect(cameraPill('streaming').icon).toBe('camera');
  });

  it('does not claim the camera is on for any other status', () => {
    // The privacy-critical assertion: nothing except `streaming` may read as "on".
    for (const status of ALL_CAMERA_STATUSES.filter((entry) => entry !== 'streaming')) {
      expect(cameraPill(status).label, `${status} must not read as on`).not.toBe('Camera on');
      expect(cameraPill(status).tone, `${status} must not look successful`).not.toBe('success');
    }
  });

  it('uses the crossed-out camera icon for every status where the camera is not live', () => {
    // `requesting` is deliberately excluded: it shows the plain camera icon because a
    // permission prompt is on screen and the camera is on its way up.
    const notLive = ALL_CAMERA_STATUSES.filter(
      (entry) => entry !== 'streaming' && entry !== 'requesting',
    );
    for (const status of notLive) {
      expect(cameraPill(status).icon, `${status} should show a crossed-out camera`).toBe(
        'camera-off',
      );
    }
  });

  it('shows the camera as off when idle, never as unavailable', () => {
    // "Camera unavailable" for an untouched camera would suggest something is broken.
    expect(cameraPill('idle').label).toBe('Camera off');
    expect(cameraPill('idle').tone).toBe('neutral');
  });

  it('distinguishes a blocked camera from a broken one', () => {
    expect(cameraPill('denied').label).toMatch(/blocked/i);
    expect(cameraPill('denied').tone).toBe('danger');
    for (const status of ['not-found', 'in-use', 'error', 'unsupported', 'insecure-context'] as CameraStatus[]) {
      expect(cameraPill(status).label).toMatch(/unavailable/i);
    }
  });
});

describe('microphone pill copy', () => {
  it('says "Mic listening" only while listening', () => {
    expect(micPill('listening').label).toBe('Mic listening');
    expect(micPill('listening').icon).toBe('mic');
    for (const status of ['idle', 'denied', 'unsupported', 'error'] as const) {
      expect(micPill(status).label).not.toBe('Mic listening');
      expect(micPill(status).icon).toBe('mic-off');
    }
  });

  it('defaults to a neutral "Mic off" rather than an alarm', () => {
    expect(micPill('idle').label).toBe('Mic off');
    expect(micPill('idle').tone).toBe('neutral');
  });
});

describe('the header pill is actually wired up', () => {
  it('the recognition hook publishes its camera state to the shared context', () => {
    // Regression guard for the bug described at the top of this file.
    const source = readSource('lib', 'vision', 'use-sign-recognition.ts');
    expect(source).toMatch(/useDeviceStatus\(\)/);
    expect(source).toMatch(/setCamera\(/);
  });

  it('the recognition hook clears the published state on unmount', () => {
    // Otherwise navigating away mid-stream leaves the header claiming a live camera.
    const source = readSource('lib', 'vision', 'use-sign-recognition.ts');
    expect(source).toMatch(/setCamera\('idle'\)/);
  });

  it('the collection tool publishes its camera state too', () => {
    const source = readSource('components', 'collect', 'CollectionTool.tsx');
    expect(source).toMatch(/useDeviceStatus\(\)/);
    expect(source).toMatch(/setCamera\(/);
    expect(source).toMatch(/setCamera\('idle'\)/);
  });

  it('the speech hook publishes the microphone state', () => {
    const source = readSource('lib', 'speech', 'use-asr.ts');
    expect(source).toMatch(/useDeviceStatus\(\)/);
    expect(source).toMatch(/setMic\(/);
  });

  it('the header reads both statuses from the shared context', () => {
    const source = readSource('components', 'layout', 'AppShell.tsx');
    expect(source).toMatch(/useDeviceStatus\(\)/);
    expect(source).toMatch(/cameraPill\(/);
    expect(source).toMatch(/micPill\(/);
  });

  it('the provider wraps the application once, at the root', () => {
    const source = readSource('app', 'layout.tsx');
    expect(source).toMatch(/DeviceStatusProvider/);
    // Two providers would give the header and the panels separate state that silently
    // disagrees — the same class of bug in a harder-to-spot form.
    expect(source.match(/<DeviceStatusProvider/g) ?? []).toHaveLength(1);
  });
});

describe('the camera stream is attached to a mounted video element', () => {
  /**
   * Regression guard for a real bug found by running the app in Chrome.
   *
   * `CameraPanel` renders its `<video>` only once `camera` is 'streaming' or 'paused'.
   * The hook originally assigned `video.srcObject` inside `start()`, which runs while the
   * status is still 'requesting' — so `videoRef.current` was null, the stream was attached
   * to nothing, the preview stayed blank, the tracking loop saw zero frames, and
   * recognition could never produce a result. Every unit test passed regardless, because
   * none of them rendered the hook against the panel.
   */
  const source = readSource('lib', 'vision', 'use-sign-recognition.ts');

  it('assigns srcObject inside an effect, not in the start callback', () => {
    expect(source).toMatch(/srcObject/);
    // The assignment must live in a useEffect that depends on the camera status, so it runs
    // after the element has been rendered.
    const attachEffects = source.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    const attaches = attachEffects.filter((block) => block.includes('srcObject'));
    expect(attaches.length, 'no useEffect assigns srcObject').toBeGreaterThan(0);
    for (const block of attaches) {
      expect(block, 'the attach effect must re-run when the camera status changes').toMatch(
        /snapshot\.camera/,
      );
    }
  });

  it('does not attach srcObject outside an effect', () => {
    // Strip every effect body, then check no stray `srcObject =` assignment remains in the
    // start/stop callbacks. A leftover imperative attach is what silently did nothing.
    const withoutEffects = source.replace(/useEffect\([\s\S]*?\n  \}, \[[^\]]*\]\);/g, '');
    const strayAssignments = withoutEffects.match(/\.srcObject\s*=/g) ?? [];
    // `stop()` legitimately clears it to null; anything else is the bug returning.
    expect(strayAssignments.length).toBeLessThanOrEqual(1);
  });

  it('the panel renders the video only when the camera is active', () => {
    // This is the precondition that makes the effect necessary. If the panel ever renders
    // the video unconditionally, the effect becomes harmless but the comment explaining it
    // would be wrong, so the coupling is worth asserting.
    const panel = readSource('components', 'camera', 'CameraPanel.tsx');
    expect(panel).toMatch(/const active = camera === 'streaming' \|\| camera === 'paused'/);
    expect(panel).toMatch(/if \(!active\)/);
  });
});

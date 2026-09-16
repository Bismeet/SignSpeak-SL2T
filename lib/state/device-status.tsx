'use client';

/**
 * Device status context.
 *
 * Lets the camera panel and the speech panel report their state once, so the persistent
 * header pills (docs/ui-ux-specification.md §4: "Clear permission indicators: persistent
 * small camera/mic status pills in header") always tell the truth about what is active.
 *
 * This context deliberately stores **only** status enums — never frames, audio, or
 * landmark data.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CameraStatus } from '@/lib/types';

export type MicStatus = 'idle' | 'listening' | 'denied' | 'unsupported' | 'error';

interface DeviceStatusValue {
  camera: CameraStatus;
  /** True when the camera is actively delivering frames. */
  cameraActive: boolean;
  cameraPaused: boolean;
  setCamera: (status: CameraStatus) => void;
  mic: MicStatus;
  setMic: (status: MicStatus) => void;
}

const DeviceStatusContext = createContext<DeviceStatusValue | null>(null);

export function DeviceStatusProvider({ children }: { children: ReactNode }) {
  const [camera, setCameraState] = useState<CameraStatus>('idle');
  const [mic, setMic] = useState<MicStatus>('idle');

  const setCamera = useCallback((status: CameraStatus) => setCameraState(status), []);

  const value = useMemo<DeviceStatusValue>(
    () => ({
      camera,
      cameraActive: camera === 'streaming',
      cameraPaused: camera === 'paused',
      setCamera,
      mic,
      setMic,
    }),
    [camera, setCamera, mic],
  );

  return <DeviceStatusContext.Provider value={value}>{children}</DeviceStatusContext.Provider>;
}

export function useDeviceStatus(): DeviceStatusValue {
  const context = useContext(DeviceStatusContext);
  if (!context) {
    throw new Error('useDeviceStatus must be used inside <DeviceStatusProvider>.');
  }
  return context;
}

/** Human-readable label and tone for the header camera pill. */
export function cameraPill(status: CameraStatus): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  icon: 'camera' | 'camera-off';
} {
  switch (status) {
    case 'streaming':
      return { label: 'Camera on', tone: 'success', icon: 'camera' };
    case 'paused':
      return { label: 'Camera paused', tone: 'warning', icon: 'camera-off' };
    case 'requesting':
      return { label: 'Camera starting', tone: 'neutral', icon: 'camera' };
    case 'denied':
      return { label: 'Camera blocked', tone: 'danger', icon: 'camera-off' };
    case 'not-found':
    case 'in-use':
    case 'error':
    case 'unsupported':
    case 'insecure-context':
      return { label: 'Camera unavailable', tone: 'danger', icon: 'camera-off' };
    default:
      return { label: 'Camera off', tone: 'neutral', icon: 'camera-off' };
  }
}

/** Human-readable label and tone for the header microphone pill. */
export function micPill(status: MicStatus): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  icon: 'mic' | 'mic-off';
} {
  switch (status) {
    case 'listening':
      return { label: 'Mic listening', tone: 'success', icon: 'mic' };
    case 'denied':
      return { label: 'Mic blocked', tone: 'danger', icon: 'mic-off' };
    case 'unsupported':
      return { label: 'Mic unsupported', tone: 'danger', icon: 'mic-off' };
    case 'error':
      return { label: 'Mic error', tone: 'warning', icon: 'mic-off' };
    default:
      return { label: 'Mic off', tone: 'neutral', icon: 'mic-off' };
  }
}

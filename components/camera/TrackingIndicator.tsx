'use client';

/**
 * Live hand-tracking indicator (FR-STT-07).
 *
 * States are distinguished by icon + text + colour, never colour alone:
 *   green "Hands tracked" / amber "Move hands into frame" / grey "Camera paused" /
 *   red "No camera".
 *
 * Rendered as `role="status"` so a screen-reader user hears the change without the
 * message being repeated on every frame (the label only changes on transitions).
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';
import type { CameraStatus, TrackingStatus } from '@/lib/types';

export interface TrackingIndicatorProps {
  tracking: TrackingStatus;
  camera: CameraStatus;
  handCount: number;
  className?: string;
}

interface IndicatorState {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  icon: 'hand' | 'camera-off' | 'pause' | 'camera';
}

export function trackingState(
  tracking: TrackingStatus,
  camera: CameraStatus,
  handCount: number,
): IndicatorState {
  if (camera === 'paused') {
    return { label: 'Camera paused', tone: 'neutral', icon: 'pause' };
  }
  if (
    camera === 'denied' ||
    camera === 'not-found' ||
    camera === 'in-use' ||
    camera === 'error' ||
    camera === 'unsupported' ||
    camera === 'insecure-context'
  ) {
    return { label: 'No camera', tone: 'danger', icon: 'camera-off' };
  }
  if (camera === 'idle' || camera === 'requesting') {
    return { label: 'Camera not started', tone: 'neutral', icon: 'camera' };
  }
  if (tracking === 'tracking' && handCount > 0) {
    return {
      label: handCount === 1 ? 'Hand tracked' : 'Hands tracked',
      tone: 'success',
      icon: 'hand',
    };
  }
  return { label: 'Move hands into frame', tone: 'warning', icon: 'hand' };
}

const TONES: Record<IndicatorState['tone'], string> = {
  success: 'bg-success-soft text-success border-success',
  warning: 'bg-warning-soft text-warning border-warning',
  danger: 'bg-danger-soft text-danger border-danger',
  neutral: 'bg-raised text-muted border-line',
};

export function TrackingIndicator({
  tracking,
  camera,
  handCount,
  className,
}: TrackingIndicatorProps) {
  const state = trackingState(tracking, camera, handCount);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
        TONES[state.tone],
        className,
      )}
    >
      <Icon name={state.icon} size="1.05rem" />
      {state.label}
    </span>
  );
}

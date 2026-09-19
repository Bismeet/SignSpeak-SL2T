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
 *
 * Two sizes exist for a layout reason, not a cosmetic one. The default (`variant="text"`) is
 * sized in `rem`, so it grows with Settings > Text size. `variant="fixed"` is sized in `px`
 * for use inside the camera overlay, whose 4:3 viewport is locked to the video and cannot
 * grow — rem-sized chrome there is clipped by the viewport's `overflow-hidden` at the largest
 * text size (measured: 107 px past the bottom edge at 1.32x). The overlay copy is therefore
 * `decorative`, and the in-flow `variant="text"` copy is the one live region, so a
 * screen-reader user hears the status exactly once.
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';
import type { CameraStatus, TrackingStatus } from '@/lib/types';

export interface TrackingIndicatorProps {
  tracking: TrackingStatus;
  camera: CameraStatus;
  handCount: number;
  /**
   * `text` (default) is `rem`-sized and scales with Settings > Text size.
   * `fixed` is `px`-sized for the camera overlay, whose 4:3 viewport cannot grow.
   */
  variant?: 'text' | 'fixed';
  /**
   * Renders an `aria-hidden` copy with no live region. Use it when the same status is also
   * announced by another instance, so the message is not read out twice.
   */
  decorative?: boolean;
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

/**
 * Tone as *text colour only*, for use over the camera image. The tinted-surface variant is
 * unreadable against a live video feed: the panel behind it is whatever the camera sees, so
 * the chip supplies its own dark glass background (`.overlay-chip`) and the tone survives as
 * the icon and label colour.
 */
const OVERLAY_TONES: Record<IndicatorState['tone'], string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
};

/**
 * Size and spacing per variant.
 *
 * `fixed` pins every length that would otherwise be a `rem`: padding, gap, icon, font size and
 * line-height. The line-height is pinned defensively rather than out of need — the body's
 * line-height is unitless, so it already scales cleanly with a `px` font size — but any future
 * rem-based leading on the container would silently reintroduce a growing line box.
 */
const VARIANTS: Record<NonNullable<TrackingIndicatorProps['variant']>, string> = {
  text: 'gap-2 px-3 py-1.5 text-sm',
  fixed:
    'gap-[6px] px-[9px] py-[5px] text-[12px] leading-[16px] whitespace-nowrap tabular-nums',
};

export function TrackingIndicator({
  tracking,
  camera,
  handCount,
  variant = 'text',
  decorative = false,
  className,
}: TrackingIndicatorProps) {
  const state = trackingState(tracking, camera, handCount);
  const overlay = variant === 'fixed';

  return (
    <span
      role={decorative ? undefined : 'status'}
      aria-live={decorative ? undefined : 'polite'}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        'inline-flex items-center rounded-full border font-semibold',
        VARIANTS[variant],
        overlay ? cn('overlay-chip border-white/10', OVERLAY_TONES[state.tone]) : TONES[state.tone],
        className,
      )}
    >
      <Icon name={state.icon} size={variant === 'fixed' ? 15 : '1.05rem'} />
      {state.label}
    </span>
  );
}

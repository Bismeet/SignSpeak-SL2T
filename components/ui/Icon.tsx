'use client';

/**
 * Inline SVG icon set.
 *
 * Icons are defined here rather than pulled from an icon package so that:
 *   - the app makes no third-party requests at runtime (see docs/privacy-and-safety.md §7);
 *   - the bundle stays small enough for a ward tablet on a poor connection;
 *   - every icon inherits `currentColor` and therefore respects all three themes.
 *
 * Every icon is decorative by default (`aria-hidden`). Icons that carry meaning must be
 * paired with a text label (docs/ui-ux-specification.md §1: "never rely on colour alone",
 * and §4: "No information conveyed by sound alone").
 */

import type { SVGProps } from 'react';
import { cn } from '@/lib/utils/cn';

export type IconName =
  | 'activity'
  | 'alert'
  | 'arrow-left'
  | 'arrow-right'
  | 'badge-check'
  | 'bot'
  | 'camera'
  | 'camera-off'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-up'
  | 'clock'
  | 'contrast'
  | 'download'
  | 'droplet'
  | 'eye'
  | 'eye-off'
  | 'hand'
  | 'help'
  | 'home'
  | 'hospital'
  | 'info'
  | 'keyboard'
  | 'list'
  | 'lock'
  | 'mic'
  | 'mic-off'
  | 'pause'
  | 'pencil'
  | 'pill'
  | 'play'
  | 'plus'
  | 'question'
  | 'refresh'
  | 'repeat'
  | 'settings'
  | 'shield'
  | 'siren'
  | 'speaker'
  | 'sparkles'
  | 'stethoscope'
  | 'stop'
  | 'text-size'
  | 'trash'
  | 'upload'
  | 'user'
  | 'users'
  | 'video'
  | 'volume-off'
  | 'x';

/** Stroke-based path data on a 24x24 grid. */
const PATHS: Record<IconName, string[]> = {
  activity: ['M3 12h3.5l2.2-6.5L11.5 18l2.3-6H21'],
  alert: ['M12 3.2 2.6 20h18.8z', 'M12 9.5v4.5', 'M12 17.2h.01'],
  'arrow-left': ['M19 12H5', 'm11 6-6 6 6 6'],
  'arrow-right': ['M5 12h14', 'm13 6 6 6-6 6'],
  'badge-check': ['M12 3l7.5 2.8v5.6c0 4.6-3.1 7.5-7.5 8.6-4.4-1.1-7.5-4-7.5-8.6V5.8z', 'm8.8 12 2.2 2.2 4.2-4.4'],
  bot: [
    'M12 2v2',
    'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z',
    'M2 12h2',
    'M20 12h2',
    'M9 11v2',
    'M15 11v2',
  ],
  camera: [
    'M3 9.2A2.2 2.2 0 0 1 5.2 7h1.6l1.1-1.8h6.2L15.2 7h1.6A2.2 2.2 0 0 1 19 9.2v7.6A2.2 2.2 0 0 1 16.8 19H5.2A2.2 2.2 0 0 1 3 16.8z',
    'M12 15.6a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z',
  ],
  'camera-off': [
    'M3 9.2A2.2 2.2 0 0 1 5.2 7h1.6l1.1-1.8h6.2L15.2 7h1.6A2.2 2.2 0 0 1 19 9.2v7.6A2.2 2.2 0 0 1 16.8 19H5.2A2.2 2.2 0 0 1 3 16.8z',
    'M4 4l16 16',
  ],
  check: ['m5 13 4.6 4.6L19 7'],
  'chevron-down': ['m6 9.5 6 6 6-6'],
  'chevron-right': ['m9.5 6 6 6-6 6'],
  'chevron-up': ['m6 14.5 6-6 6 6'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5V12l3 2'],
  contrast: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 3v18', 'M12 3a9 9 0 0 0 0 18'],
  download: ['M12 4v10', 'm8 10 4 4 4-4', 'M4.5 19.5h15'],
  droplet: ['M12 3.2s6.2 6.6 6.2 10.6a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3.2 12 3.2Z'],
  eye: ['M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z', 'M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z'],
  'eye-off': ['M4 4l16 16', 'M9.6 9.7A2.8 2.8 0 0 0 12 14.8c.7 0 1.4-.3 1.9-.7', 'M6.4 7.3C4.2 8.8 2.5 12 2.5 12s3.5 5.5 9.5 5.5c1.6 0 3-.4 4.2-1', 'M18.4 15.1c1.9-1.4 3.1-3.1 3.1-3.1s-3.5-5.5-9.5-5.5c-.9 0-1.7.1-2.4.4'],
  hand: [
    'M9 12.5V5.8a1.4 1.4 0 0 1 2.8 0v5.4',
    'M11.8 11V4.8a1.4 1.4 0 0 1 2.8 0V11',
    'M14.6 11.4V6.6a1.4 1.4 0 0 1 2.8 0v7.6a7 7 0 0 1-7 7 5.6 5.6 0 0 1-5.6-5.6v-3a1.4 1.4 0 0 1 2.8 0',
  ],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2.1-2.4 3.6', 'M12 17.2h.01'],
  home: ['M3.4 10.7 12 3.6l8.6 7.1', 'M5.6 9.4v11h12.8v-11', 'M9.8 20.4v-5.6h4.4v5.6'],
  hospital: ['M4 20.5V7.5L12 3l8 4.5v13', 'M2.5 20.5h19', 'M12 9v6', 'M9 12h6'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5.5', 'M12 7.6h.01'],
  keyboard: ['M3 7.5h18v9H3z', 'M6.5 10.5h.01', 'M9.5 10.5h.01', 'M12.5 10.5h.01', 'M15.5 10.5h.01', 'M8 14h8'],
  list: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
  lock: ['M5.5 10.5h13V20h-13z', 'M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7'],
  mic: ['M12 15.2a3.6 3.6 0 0 0 3.6-3.6V6.2a3.6 3.6 0 0 0-7.2 0v5.4A3.6 3.6 0 0 0 12 15.2Z', 'M5.8 11.6a6.2 6.2 0 0 0 12.4 0', 'M12 17.8V21', 'M9 21h6'],
  'mic-off': ['M4 4l16 16', 'M15.6 11.6a3.6 3.6 0 0 1-5.1 3.3', 'M8.4 8.1V6.2a3.6 3.6 0 0 1 7.1-.9', 'M5.8 11.6a6.2 6.2 0 0 0 9.6 5', 'M12 17.8V21', 'M9 21h6'],
  pause: ['M8.5 5.5v13', 'M15.5 5.5v13'],
  pencil: ['M4 20h4.2L20 8.2 15.8 4 4 15.8z', 'm13.6 6.2 4.2 4.2'],
  pill: ['M8.6 20.4a5.2 5.2 0 0 1-7.4-7.4l7.2-7.2a5.2 5.2 0 0 1 7.4 7.4z', 'm6 9 9 9'],
  play: ['M7 4.8v14.4L19 12z'],
  plus: ['M12 5v14', 'M5 12h14'],
  question: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2.1-2.4 3.6', 'M12 17.2h.01'],
  refresh: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v4.5h-4.5'],
  repeat: ['M17 2.8 20.2 6 17 9.2', 'M20.2 6H7a4 4 0 0 0-4 4v1.5', 'M7 21.2 3.8 18 7 14.8', 'M3.8 18H17a4 4 0 0 0 4-4v-1.5'],
  settings: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z', 'M12 2.8v2.4', 'M12 18.8v2.4', 'M4.9 4.9l1.7 1.7', 'M17.4 17.4l1.7 1.7', 'M2.8 12h2.4', 'M18.8 12h2.4', 'M4.9 19.1l1.7-1.7', 'M17.4 6.6l1.7-1.7'],
  shield: ['M12 3l7.5 2.8v5.6c0 4.6-3.1 7.5-7.5 8.6-4.4-1.1-7.5-4-7.5-8.6V5.8z'],
  siren: ['M7 18v-5.5a5 5 0 0 1 10 0V18', 'M4.5 21h15', 'M4 18h16', 'M12 3.5V6', 'M5.6 6.6 7 8', 'M18.4 6.6 17 8'],
  speaker: ['M11 5 6.6 8.8H3v6.4h3.6L11 19z', 'M14.8 9.2a4 4 0 0 1 0 5.6', 'M17.4 6.6a7.6 7.6 0 0 1 0 10.8'],
  sparkles: ['M12 3.5l1.7 4.4 4.4 1.7-4.4 1.7L12 15.7l-1.7-4.4L5.9 9.6l4.4-1.7z', 'M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z'],
  stethoscope: [
    'M4.5 2v4a4.5 4.5 0 0 0 9 0V2',
    'M9 10.5v5.5a5.5 5.5 0 0 0 11 0v-2',
    'M20 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  ],
  stop: ['M6.5 6.5h11v11h-11z'],
  'text-size': ['M3 19 7.8 5.5 12.6 19', 'M4.6 14.6h6.4', 'M14 19l3.2-9.5L20.4 19', 'M15.2 15.8h4'],
  trash: ['M4 7h16', 'M9.5 7V4.2h5V7', 'M6.5 7l.9 12.8h9.2L17.5 7', 'M10.5 11v5.5', 'M13.5 11v5.5'],
  upload: ['M12 20V10', 'm8 14 4-4 4 4', 'M4.5 4.5h15'],
  user: ['M12 12.2a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8Z', 'M4.8 20.2a7.2 7.2 0 0 1 14.4 0'],
  users: ['M9 12a3.6 3.6 0 1 0 0-7.2A3.6 3.6 0 0 0 9 12Z', 'M2.8 19.8a6.2 6.2 0 0 1 12.4 0', 'M16 5.2a3.4 3.4 0 0 1 0 6.6', 'M17.4 19.8a6.3 6.3 0 0 0-1.6-4.2'],
  video: ['M3 7.5h11.5v9H3z', 'm14.5 12 6.5-3.8v7.6z'],
  'volume-off': ['M11 5 6.6 8.8H3v6.4h3.6L11 19z', 'M15.5 9.5l5 5', 'M20.5 9.5l-5 5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size; the icon is square. Defaults to 1.25rem so it scales with text. */
  size?: number | string;
  /**
   * Set to a string to expose the icon to assistive technology as an image with that
   * label. Omit for decorative icons that sit next to a text label.
   */
  label?: string;
}

export function Icon({ name, size = '1.25rem', label, className, ...rest }: IconProps) {
  const paths = PATHS[name];
  const decorative = label === undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      focusable="false"
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

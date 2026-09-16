'use client';

/**
 * SignSpeak brand mark.
 *
 * A hand inside a speech bubble: signing on one side, speech on the other. Drawn inline
 * as SVG so it inherits theme colours and makes no network request.
 */

import { cn } from '@/lib/utils/cn';

export interface BrandMarkProps {
  size?: number;
  className?: string;
  /** When true the mark is exposed to assistive technology with the label "SignSpeak". */
  labelled?: boolean;
}

export function BrandMark({ size = 40, className, labelled = false }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? 'SignSpeak' : undefined}
      focusable="false"
    >
      {labelled ? <title>SignSpeak</title> : null}
      <defs>
        <linearGradient id="ss-brand-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--ss-primary))" />
          <stop offset="100%" stopColor="rgb(var(--ss-accent))" />
        </linearGradient>
      </defs>
      {/* Speech bubble */}
      <path
        d="M8 6h32a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H20l-9.4 7.2A1.4 1.4 0 0 1 8.4 40V34H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4Z"
        fill="url(#ss-brand-gradient)"
        transform="translate(2 0)"
      />
      {/* Hand: four fingers and a palm, reading as a raised signing hand */}
      <g stroke="rgb(var(--ss-primary-ink))" strokeWidth="2.1" strokeLinecap="round" fill="none" opacity="0.95">
        <path d="M18.5 26.5V16.8a1.6 1.6 0 0 1 3.2 0v6.4" />
        <path d="M21.7 23.2V14.6a1.6 1.6 0 0 1 3.2 0v8.6" />
        <path d="M24.9 23.2v-6.6a1.6 1.6 0 0 1 3.2 0v6.6" />
        <path d="M28.1 23.2v-4a1.6 1.6 0 0 1 3.2 0v8.2a6.4 6.4 0 0 1-6.4 6.4h-1.2a5.2 5.2 0 0 1-5.2-5.2v-2.6a1.6 1.6 0 0 1 3.2 0" />
      </g>
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={compact ? 32 : 38} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">SignSpeak</span>
        {!compact ? (
          <span className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Indian Sign Language
          </span>
        ) : null}
      </span>
    </span>
  );
}

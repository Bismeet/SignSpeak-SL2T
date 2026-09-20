'use client';

/**
 * SignSpeak brand mark.
 *
 * A hand inside a speech bubble: signing on one side, speech on the other. Drawn inline
 * as SVG so it inherits theme colours and makes no network request.
 */

import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

export interface BrandMarkProps {
  size?: number;
  className?: string;
  /** When true the mark is exposed to assistive technology with the label "SignSpeak". */
  labelled?: boolean;
}

export function BrandMark({ size = 40, className, labelled = false }: BrandMarkProps) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center select-none', className)}
      style={{ width: size, height: size }}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? 'SignSpeak' : undefined}
    >
      <Image
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain [html[data-theme='dark']_&]:hidden"
        priority
      />
      <Image
        src="/logo-dark.png"
        alt=""
        width={size}
        height={size}
        className="hidden h-full w-full object-contain [html[data-theme='dark']_&]:block"
        priority
      />
    </span>
  );
}

export function BrandLockup({
  compact = false,
  subtitle = 'People Understand People',
}: {
  compact?: boolean;
  subtitle?: string | null;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={compact ? 32 : 36} />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          SignSpeak
        </span>
        {subtitle ? (
          <span className="text-[11px] font-medium tracking-normal text-muted/90">
            {subtitle}
          </span>
        ) : !compact ? (
          <span className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Indian Sign Language
          </span>
        ) : null}
      </span>
    </span>
  );
}

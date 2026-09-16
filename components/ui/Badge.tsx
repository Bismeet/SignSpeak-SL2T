'use client';

/**
 * Badges and status pills.
 *
 * Design rule enforced here: **never colour alone**. Every badge carries an icon and a
 * text label, so it survives greyscale printing, colour-vision deficiency and screen
 * readers (docs/ui-ux-specification.md §1, NFR-03).
 */

import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';
import type { ConfidenceBand, VerificationStatus } from '@/lib/types';
import { CONFIDENCE_BAND_LABEL } from '@/lib/vision/decision';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-muted border-line',
  primary: 'bg-primary-soft text-primary border-primary',
  success: 'bg-success-soft text-success border-success',
  warning: 'bg-warning-soft text-warning border-warning',
  danger: 'bg-danger-soft text-danger border-danger',
  accent: 'bg-accent-soft text-accent border-accent',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: IconName;
  children: React.ReactNode;
  className?: string;
  /** Native tooltip, e.g. the verifier's name on a verification badge. */
  title?: string;
  /** Use the solid variant for the highest-emphasis case, e.g. "NOT VERIFIED". */
  solid?: boolean;
}

export function Badge({ tone = 'neutral', icon, children, className, title, solid = false }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold leading-none',
        solid
          ? tone === 'danger'
            ? 'border-transparent bg-danger text-danger-ink'
            : tone === 'warning'
              ? 'border-transparent bg-warning text-warning-ink'
              : tone === 'success'
                ? 'border-transparent bg-success text-success-ink'
                : 'border-transparent bg-primary text-primary-ink'
          : TONES[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size="0.95rem" /> : null}
      <span>{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------------------
 * Confidence badge (FR-STT-04)
 * ---------------------------------------------------------------------------------- */

export interface ConfidenceBadgeProps {
  band: ConfidenceBand;
  /** Numeric probability; shown when `showNumeric` is on (Settings, per FR-STT-04). */
  probability?: number;
  showNumeric?: boolean;
  className?: string;
}

const BAND_TONE: Record<ConfidenceBand, BadgeTone> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

const BAND_ICON: Record<ConfidenceBand, IconName> = {
  high: 'badge-check',
  medium: 'alert',
  low: 'question',
};

export function ConfidenceBadge({
  band,
  probability,
  showNumeric = false,
  className,
}: ConfidenceBadgeProps) {
  return (
    <Badge tone={BAND_TONE[band]} icon={BAND_ICON[band]} className={className}>
      {CONFIDENCE_BAND_LABEL[band]}
      {showNumeric && typeof probability === 'number'
        ? ` · ${(probability * 100).toFixed(0)}%`
        : ''}
    </Badge>
  );
}

/* ------------------------------------------------------------------------------------
 * Verification badge (FR-VIS-04, docs/privacy-and-safety.md §10)
 * ---------------------------------------------------------------------------------- */

export interface VerificationBadgeProps {
  status: VerificationStatus;
  verifiedBy?: string;
  verifiedOn?: string;
  className?: string;
}

export function VerificationBadge({
  status,
  verifiedBy,
  verifiedOn,
  className,
}: VerificationBadgeProps) {
  if (status === 'expert_verified') {
    const detail = [verifiedBy, verifiedOn].filter(Boolean).join(', ');
    return (
      <Badge
        tone="success"
        icon="badge-check"
        className={className}
        title={detail ? `Verified by ${detail}` : 'Verified by an ISL signer'}
      >
        Verified ISL{detail ? ` · ${detail}` : ''}
      </Badge>
    );
  }

  if (status === 'rejected') {
    return (
      <Badge tone="danger" icon="x" className={className}>
        Withdrawn
      </Badge>
    );
  }

  return (
    <Badge tone="warning" icon="alert" className={className}>
      Unverified
    </Badge>
  );
}

/* ------------------------------------------------------------------------------------
 * Status pill (header camera/mic indicators, docs/ui-ux-specification.md §4)
 * ---------------------------------------------------------------------------------- */

export interface StatusPillProps {
  tone: BadgeTone;
  icon: IconName;
  label: string;
  /** Extra detail announced to screen readers but not shown, e.g. the exact error. */
  srDetail?: string;
  className?: string;
  onClick?: () => void;
}

export function StatusPill({ tone, icon, label, srDetail, className, onClick }: StatusPillProps) {
  const content = (
    <>
      <Icon name={icon} size="0.95rem" />
      <span>{label}</span>
      {srDetail ? <span className="sr-only"> — {srDetail}</span> : null}
    </>
  );

  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold leading-none',
    TONES[tone],
    className,
  );

  if (onClick) {
    return (
      <button type="button" className={cn(classes, 'min-h-touch px-3 hover:brightness-105')} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <span className={classes} role="status">
      {content}
    </span>
  );
}

/** Small keyboard-shortcut hint, e.g. `<Kbd>Enter</Kbd>`. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-raised px-1.5 py-0.5 font-sans text-xs font-semibold text-muted">
      {children}
    </kbd>
  );
}

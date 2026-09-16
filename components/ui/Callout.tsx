'use client';

/**
 * Callout — inline explanatory block.
 *
 * Used for privacy disclosures, "this is not medical advice" statements and error
 * explanations. Always renders an icon plus a text label, so meaning never depends on
 * colour alone.
 */

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';
import type { BadgeTone } from '@/components/ui/Badge';

const TONES: Record<BadgeTone, { wrap: string; icon: string; title: string }> = {
  neutral: { wrap: 'bg-raised border-line', icon: 'text-muted', title: 'text-ink' },
  primary: { wrap: 'bg-primary-soft border-primary', icon: 'text-primary', title: 'text-ink' },
  success: { wrap: 'bg-success-soft border-success', icon: 'text-success', title: 'text-ink' },
  warning: { wrap: 'bg-warning-soft border-warning', icon: 'text-warning', title: 'text-ink' },
  danger: { wrap: 'bg-danger-soft border-danger', icon: 'text-danger', title: 'text-ink' },
  accent: { wrap: 'bg-accent-soft border-accent', icon: 'text-accent', title: 'text-ink' },
};

export interface CalloutProps {
  tone?: BadgeTone;
  icon?: IconName;
  title?: string;
  children: ReactNode;
  /** Renders as a warning to assistive technology when true. */
  assertive?: boolean;
  className?: string;
  actions?: ReactNode;
}

export function Callout({
  tone = 'neutral',
  icon = 'info',
  title,
  children,
  assertive = false,
  className,
  actions,
}: CalloutProps) {
  const styles = TONES[tone];
  return (
    <div
      className={cn('ss-bordered flex gap-3 rounded-2xl border p-4', styles.wrap, className)}
      role={assertive ? 'alert' : undefined}
    >
      <Icon name={icon} size="1.35rem" className={cn('mt-0.5', styles.icon)} />
      <div className="min-w-0 flex-1">
        {title ? <p className={cn('font-semibold', styles.title)}>{title}</p> : null}
        <div className={cn('text-pretty text-muted', title && 'mt-1')}>{children}</div>
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** The recurring "SignSpeak is not a medical device" statement. */
export function NotMedicalNotice({ className }: { className?: string }) {
  return (
    <Callout tone="warning" icon="alert" title="SignSpeak is a communication aid, not medical advice" className={className}>
      It does not diagnose, triage or recommend treatment, and it does not replace a qualified
      ISL interpreter or emergency services. In an emergency, call your local emergency number and
      get staff.
    </Callout>
  );
}

/** The recurring "recognition can be wrong" statement. */
export function AccuracyNotice({ className }: { className?: string }) {
  return (
    <Callout tone="neutral" icon="info" title="Recognition can be wrong" className={className}>
      Sign recognition only covers the supported signs listed in the Limitations page, and it can
      misread a sign. Confirm anything important before relying on it, and use the phrase board or
      typing when you need to be certain.
    </Callout>
  );
}

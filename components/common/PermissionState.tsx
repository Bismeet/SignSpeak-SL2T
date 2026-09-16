'use client';

/**
 * Permission and error state panel (docs/ui-ux-specification.md §3.8).
 *
 * Contract: every failure state shows an icon, one sentence of cause, one sentence of
 * fix, and at least one button leading to a working alternative. There is no screen in
 * SignSpeak where a user can get stuck (risk R9 / "no dead ends").
 */

import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

export interface PermissionStateProps {
  icon?: IconName;
  tone?: 'neutral' | 'warning' | 'danger';
  title: string;
  /** One sentence: what happened. */
  cause: string;
  /** One sentence: what to do about it. */
  fix: string;
  /** Retry action, shown first when present. */
  onRetry?: () => void;
  retryLabel?: string;
  /** One or more working alternatives, e.g. "Use the phrase board". */
  alternatives?: Array<{ label: string; onClick: () => void; icon?: IconName; variant?: ButtonProps['variant'] }>;
  /** Extra content, e.g. a bulleted list of steps for re-enabling a permission. */
  children?: ReactNode;
  className?: string;
  /** `compact` is used inside a panel; `full` fills the panel area. */
  size?: 'compact' | 'full';
}

const TONES: Record<NonNullable<PermissionStateProps['tone']>, string> = {
  neutral: 'bg-raised text-muted',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function PermissionState({
  icon = 'alert',
  tone = 'warning',
  title,
  cause,
  fix,
  onRetry,
  retryLabel = 'Try again',
  alternatives = [],
  children,
  className,
  size = 'full',
}: PermissionStateProps) {
  return (
    <div
      className={cn(
        'ss-bordered flex flex-col items-start gap-3 rounded-2xl bg-surface',
        size === 'full' ? 'p-5 sm:p-7' : 'p-4',
        className,
      )}
      role="status"
    >
      <span className={cn('inline-flex h-12 w-12 items-center justify-center rounded-2xl', TONES[tone])}>
        <Icon name={icon} size="1.7rem" />
      </span>

      <div className="space-y-1.5">
        <h3 className={cn('font-semibold', size === 'full' ? 'text-xl' : 'text-lg')}>{title}</h3>
        <p className="text-pretty text-muted">{cause}</p>
        <p className="text-pretty">{fix}</p>
      </div>

      {children}

      {onRetry || alternatives.length > 0 ? (
        <div className="mt-1 flex w-full flex-wrap gap-2">
          {onRetry ? (
            <Button variant="primary" icon="refresh" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {alternatives.map((alternative) => (
            <Button
              key={alternative.label}
              variant={alternative.variant ?? 'secondary'}
              icon={alternative.icon}
              onClick={alternative.onClick}
            >
              {alternative.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Empty state used by the conversation feed and the phrase board. */
export function EmptyState({
  icon = 'list',
  title,
  description,
  children,
  className,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'ss-bordered flex flex-col items-center gap-3 rounded-2xl bg-raised px-5 py-8 text-center',
        className,
      )}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-muted">
        <Icon name={icon} size="1.7rem" />
      </span>
      <p className="text-lg font-semibold">{title}</p>
      {description ? <p className="max-w-md text-pretty text-muted">{description}</p> : null}
      {children}
    </div>
  );
}

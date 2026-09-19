'use client';

/**
 * Layout surfaces: Card, SectionHeading and Panel.
 *
 * Cards use the theme-driven border width so the high-contrast theme can thicken them
 * (`docs/ui-ux-specification.md` §1).
 */

import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` gets a stronger shadow and is used for primary content blocks. */
  elevation?: 'flat' | 'raised';
  /** Adds an accent bar on the inline start edge. */
  accent?: 'none' | 'primary' | 'danger' | 'success' | 'warning';
  /** Lift the hairline border on hover — only for cards that are themselves clickable. */
  interactive?: boolean;
  as?: ElementType;
}

const ACCENTS: Record<NonNullable<CardProps['accent']>, string> = {
  none: '',
  primary: 'border-s-[6px] border-s-primary',
  danger: 'border-s-[6px] border-s-danger',
  success: 'border-s-[6px] border-s-success',
  warning: 'border-s-[6px] border-s-warning',
};

export function Card({
  elevation = 'flat',
  accent = 'none',
  interactive = false,
  as: Component = 'div',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Component
      className={cn(
        // A very shallow top-lit gradient rather than a flat fill: it reads as a panel
        // with depth instead of a rectangle of colour, and collapses to flat white in
        // the high-contrast theme (where surface and bg are both #fff).
        'ss-bordered rounded-2xl bg-gradient-to-b from-surface to-bg',
        elevation === 'raised' ? 'shadow-lift' : 'shadow-card',
        interactive &&
          'transition-colors duration-150 hover:border-strong focus-within:border-strong',
        ACCENTS[accent],
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

export interface SectionHeadingProps {
  title: string;
  description?: string;
  /** Heading level, so the document outline stays correct on every screen. */
  level?: 1 | 2 | 3 | 4;
  icon?: IconName;
  /** Right-aligned actions, e.g. a "Change" button. */
  actions?: ReactNode;
  id?: string;
  className?: string;
}

export function SectionHeading({
  title,
  description,
  level = 2,
  icon,
  actions,
  id,
  className,
}: SectionHeadingProps) {
  const Heading = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
  const sizeClasses =
    level === 1
      ? 'text-4xl sm:text-5xl'
      : level === 2
        ? 'text-2xl sm:text-3xl'
        : level === 3
          ? 'text-xl sm:text-2xl'
          : 'text-lg';

  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <Heading id={id} className={cn('flex items-center gap-2.5 font-semibold tracking-tight', sizeClasses)}>
          {icon ? <Icon name={icon} size={level === 1 ? '2rem' : '1.5rem'} className="text-primary" /> : null}
          <span>{title}</span>
        </Heading>
        {description ? (
          <p className="mt-1.5 max-w-prose text-pretty text-base text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding preset. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<PanelProps['padding']>, string> = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-7',
};

export function Panel({ padding = 'md', className, children, ...rest }: PanelProps) {
  return (
    <div className={cn(PADDING[padding], className)} {...rest}>
      {children}
    </div>
  );
}

/** Vertical rhythm wrapper used by every screen. */
export function Stack({
  children,
  className,
  gap = 'md',
}: {
  children: ReactNode;
  className?: string;
  gap?: 'sm' | 'md' | 'lg';
}) {
  const gaps = { sm: 'space-y-3', md: 'space-y-5', lg: 'space-y-8' };
  return <div className={cn(gaps[gap], className)}>{children}</div>;
}

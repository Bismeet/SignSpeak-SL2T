'use client';

/**
 * Button and button-styled link.
 *
 * Accessibility contract (docs/ui-ux-specification.md §1 and §4):
 *   - minimum 48x48px target (`touch`), 96px in Emergency mode (`emergency`);
 *   - a visible 3px focus ring from globals.css — never removed;
 *   - never colour-only: an optional leading icon always sits beside a text label;
 *   - `aria-busy` while loading so screen readers announce progress.
 */

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'subtle'
  | 'ghost'
  | 'danger'
  | 'emergency'
  | 'success';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'emergency';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-ink border border-transparent hover:bg-primary-strong active:bg-primary-strong shadow-card',
  secondary:
    'bg-surface text-ink border border-strong hover:bg-raised active:bg-raised shadow-card',
  subtle: 'bg-primary-soft text-primary border border-transparent hover:border-primary',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-raised',
  danger: 'bg-danger text-danger-ink border border-transparent hover:bg-danger-strong shadow-card',
  emergency:
    'bg-danger text-danger-ink border border-transparent hover:bg-danger-strong shadow-lift',
  success: 'bg-success text-success-ink border border-transparent hover:brightness-110 shadow-card',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[2.5rem] px-3 text-sm gap-1.5 rounded-xl',
  md: 'min-h-touch px-4 text-base gap-2 rounded-2xl',
  lg: 'min-h-[3.5rem] px-5 text-lg gap-2.5 rounded-2xl',
  xl: 'min-h-[4.5rem] px-6 text-xl gap-3 rounded-2xl',
  emergency: 'min-h-emergency px-6 text-2xl gap-3 rounded-3xl',
};

export interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. Always paired with a visible text label. */
  icon?: IconName;
  /** Trailing icon, e.g. a chevron for "opens a new screen". */
  trailingIcon?: IconName;
  /** Stretch to the full width of the container. */
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: Pick<ButtonBaseProps, 'variant' | 'size' | 'block' | 'className'> = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center text-center font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-emphasised',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none',
    'active:scale-[0.985] motion-reduce:active:scale-100',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );
}

export interface ButtonProps
  extends ButtonBaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  block = false,
  loading = false,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconSize = size === 'xl' || size === 'emergency' ? '1.75rem' : size === 'lg' ? '1.4rem' : '1.15rem';

  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size={iconSize} />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      <span className="min-w-0">{children}</span>
      {trailingIcon && !loading ? <Icon name={trailingIcon} size={iconSize} /> : null}
    </button>
  );
}

export interface LinkButtonProps
  extends ButtonBaseProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className' | 'href'> {
  href: string;
  /** Open in a new tab and announce it to screen readers. */
  external?: boolean;
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  block = false,
  children,
  className,
  external = false,
  ...rest
}: LinkButtonProps) {
  const iconSize = size === 'xl' || size === 'emergency' ? '1.75rem' : size === 'lg' ? '1.4rem' : '1.15rem';
  const classes = buttonStyles({ variant, size, block, className });

  if (external) {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noreferrer noopener"
        {...rest}
      >
        {icon ? <Icon name={icon} size={iconSize} /> : null}
        <span className="min-w-0">{children}</span>
        {trailingIcon ? <Icon name={trailingIcon} size={iconSize} /> : null}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      <span className="min-w-0">{children}</span>
      {trailingIcon ? <Icon name={trailingIcon} size={iconSize} /> : null}
    </Link>
  );
}

/** Inline, accessible spinner. Uses a CSS animation that respects reduced motion. */
export function Spinner({ size = '1.25rem', className }: { size?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('animate-spin', className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

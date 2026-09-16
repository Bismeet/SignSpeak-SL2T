'use client';

/**
 * Accessible modal dialog.
 *
 * Implemented by hand rather than pulling in a library because the focus contract is a
 * product requirement (NFR-03): focus moves into the dialog, is trapped while it is
 * open, Escape closes it, and focus returns to the element that opened it.
 *
 * Used for the recognition correction sheet, the "End conversation" confirmation and
 * the first-run intro cards.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Footer actions, usually a primary and a secondary button. */
  footer?: ReactNode;
  /** `sheet` slides up from the bottom on small screens (mobile correction sheet). */
  variant?: 'centered' | 'sheet';
  /** Set false for destructive confirmations where an accidental Escape is dangerous. */
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'centered',
  closeOnEscape = true,
  closeOnBackdrop = true,
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeOnEscape, onClose],
  );

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Move focus to the first control, or the dialog itself if there is none.
    const container = containerRef.current;
    const firstFocusable = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? container)?.focus();

    document.addEventListener('keydown', handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const content = (
    <div
      className={cn(
        'fixed inset-0 z-50 flex',
        variant === 'sheet' ? 'items-end sm:items-center sm:justify-center' : 'items-center justify-center',
        'p-0 sm:p-4',
      )}
    >
      {/* Backdrop. `aria-hidden` because the dialog itself carries the semantics. */}
      <div
        className="absolute inset-0 bg-ink/55 backdrop-blur-[2px] animate-fade-in"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-lift',
          variant === 'sheet'
            ? 'rounded-t-3xl sm:max-w-xl sm:rounded-3xl'
            : 'rounded-3xl sm:max-w-xl',
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold tracking-tight sm:text-2xl">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-pretty text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-raised"
            aria-label={`Close ${title}`}
          >
            <Icon name="x" size="1.25rem" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap gap-2 border-t border-line bg-raised p-4 sm:p-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** Two-button confirmation, used for "End conversation" and "Delete this word". */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'inline-flex min-h-touch flex-1 items-center justify-center gap-2 rounded-2xl px-4 font-semibold',
              destructive
                ? 'bg-danger text-danger-ink hover:bg-danger-strong'
                : 'bg-primary text-primary-ink hover:bg-primary-strong',
            )}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-touch flex-1 items-center justify-center rounded-2xl border border-strong bg-surface px-4 font-semibold text-ink hover:bg-raised"
          >
            {cancelLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

'use client';

/**
 * Form controls: TextArea, TextInput, Select, Toggle, RadioGroup and RangeSlider.
 *
 * All controls:
 *   - are labelled explicitly (never placeholder-only);
 *   - are at least 48px tall;
 *   - expose `aria-describedby` for hint and error text;
 *   - keep the global 3px focus ring.
 */

import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

/* ------------------------------------------------------------------------------------
 * Field wrapper
 * ---------------------------------------------------------------------------------- */

interface FieldShellProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
}

function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
  hideLabel = false,
}: FieldShellProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn('space-y-2', className)}>
      <label
        htmlFor={htmlFor}
        className={cn('block font-semibold', hideLabel && 'sr-only')}
      >
        {label}
        {required ? <span className="ml-1 text-danger">(required)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-sm font-medium text-danger" role="alert">
          <Icon name="alert" size="1rem" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASSES =
  'w-full rounded-xl border border-strong bg-surface px-3 py-2.5 text-base text-ink placeholder:text-faint ' +
  'transition-colors duration-150 focus:border-primary disabled:opacity-60';

/* ------------------------------------------------------------------------------------
 * TextArea
 * ---------------------------------------------------------------------------------- */

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  hideLabel?: boolean;
  /** Forwarded to the underlying <textarea>, e.g. to focus it programmatically. */
  inputRef?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  hideLabel,
  inputRef,
  ...rest
}: TextAreaFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} className={className} hideLabel={hideLabel}>
      <textarea
        id={id}
        ref={inputRef}
        className={cn(CONTROL_CLASSES, 'min-h-[7rem] resize-y leading-relaxed')}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

/* ------------------------------------------------------------------------------------
 * TextInput
 * ---------------------------------------------------------------------------------- */

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  hideLabel?: boolean;
}

export function TextField({ label, hint, error, className, hideLabel, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} className={className} hideLabel={hideLabel}>
      <input
        id={id}
        className={cn(CONTROL_CLASSES, 'min-h-touch')}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

/* ------------------------------------------------------------------------------------
 * Select
 * ---------------------------------------------------------------------------------- */

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  hideLabel?: boolean;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}

export function SelectField({
  label,
  hint,
  error,
  className,
  hideLabel,
  options,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} className={className} hideLabel={hideLabel}>
      <div className="relative">
        <select
          id={id}
          className={cn(CONTROL_CLASSES, 'min-h-touch appearance-none pr-10')}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron-down"
          size="1.1rem"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------------------------
 * Toggle (switch)
 * ---------------------------------------------------------------------------------- */

export interface ToggleFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Renders a warning badge next to the label, e.g. for privacy-sensitive toggles. */
  note?: string;
  disabled?: boolean;
  className?: string;
}

export function ToggleField({
  label,
  description,
  checked,
  onChange,
  note,
  disabled = false,
  className,
}: ToggleFieldProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors duration-150',
          checked ? 'border-primary bg-primary-solid' : 'border-strong bg-raised',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-surface shadow-card transition-[inset-inline-start] duration-150',
            checked ? 'start-7' : 'start-1',
          )}
        />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer font-semibold">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-pretty text-sm text-muted">
            {description}
          </p>
        ) : null}
        {note ? <p className="mt-1 text-sm font-medium text-warning">{note}</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------
 * Radio group (segmented control)
 * ---------------------------------------------------------------------------------- */

export interface RadioGroupProps<T extends string> {
  legend: string;
  hint?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; description?: string }>;
  className?: string;
}

export function RadioGroup<T extends string>({
  legend,
  hint,
  value,
  onChange,
  options,
  className,
}: RadioGroupProps<T>) {
  const name = useId();
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <fieldset className={cn('space-y-2', className)} aria-describedby={hintId}>
      <legend className="font-semibold">{legend}</legend>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 font-medium transition-colors duration-150',
                selected
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-strong bg-surface text-ink hover:bg-raised',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="h-5 w-5 accent-[rgb(var(--ss-primary))]"
              />
              <span>
                {option.label}
                {option.description ? (
                  <span className="block text-sm font-normal text-muted">{option.description}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------------------------
 * Range slider
 * ---------------------------------------------------------------------------------- */

export interface RangeFieldProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the current value for display and for screen readers. */
  format?: (value: number) => string;
  className?: string;
}

export function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  className,
}: RangeFieldProps) {
  const id = useId();
  const display = format ? format(value) : String(value);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        <output htmlFor={id} className="text-base font-semibold text-primary">
          {display}
        </output>
      </div>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full cursor-pointer accent-[rgb(var(--ss-primary))]"
      />
    </div>
  );
}

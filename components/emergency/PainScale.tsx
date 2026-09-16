'use client';

/**
 * Pain scale, 0 to 10, selectable by tap (FR-HOSP-02).
 *
 * Rendered as a radio group with 11 large targets. Each level carries its own text label
 * ("no pain", "worst pain imaginable", "severe") as well as a colour, so the meaning never
 * depends on colour alone (docs/ui-ux-specification.md §1).
 */

import { cn } from '@/lib/utils/cn';

export interface PainScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  className?: string;
}

const DESCRIPTORS: Record<number, string> = {
  0: 'No pain',
  1: 'Very mild',
  2: 'Mild',
  3: 'Mild',
  4: 'Moderate',
  5: 'Moderate',
  6: 'Moderate',
  7: 'Severe',
  8: 'Severe',
  9: 'Very severe',
  10: 'Worst imaginable',
};

/** Visual ramp from success (low) to danger (high). Always paired with the text label. */
function toneFor(value: number): string {
  if (value <= 3) return 'bg-success-soft text-success border-success hover:bg-success hover:text-success-ink';
  if (value <= 6) return 'bg-warning-soft text-warning border-warning hover:bg-warning hover:text-warning-ink';
  return 'bg-danger-soft text-danger border-danger hover:bg-danger hover:text-danger-ink';
}

export function PainScale({ value, onChange, className }: PainScaleProps) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="font-semibold">
        Pain level
        <span className="ms-2 font-normal text-muted">0 = no pain, 10 = worst pain imaginable</span>
      </legend>

      <div
        role="radiogroup"
        aria-label="Pain level from 0 to 10"
        className="grid grid-cols-6 gap-2 sm:grid-cols-11"
      >
        {Array.from({ length: 11 }, (_, level) => {
          const selected = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(level)}
              className={cn(
                'flex min-h-emergency flex-col items-center justify-center rounded-2xl border-2 font-bold transition-colors duration-150',
                selected
                  ? 'border-primary bg-primary text-primary-ink'
                  : toneFor(level),
              )}
            >
              <span className="text-2xl leading-none">{level}</span>
              <span className="sr-only">
                {level} — {DESCRIPTORS[level]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-pretty text-sm text-muted" aria-live="polite">
        {value === null
          ? 'No pain level selected.'
          : `Selected: ${value} out of 10 — ${DESCRIPTORS[value]}.`}
      </p>
    </fieldset>
  );
}

export function painDescriptor(value: number): string {
  return DESCRIPTORS[value] ?? '';
}

/** The sentence the app shows and can speak for a selected pain level. */
export function painSentence(value: number): string {
  if (value === 0) return 'I have no pain.';
  return `My pain level is ${value} out of 10 (${DESCRIPTORS[value]?.toLowerCase() ?? ''}).`;
}

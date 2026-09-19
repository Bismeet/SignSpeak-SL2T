'use client';

/**
 * Pain scale, 0 to 10, selectable by tap (FR-HOSP-02).
 *
 * Rendered as a radio group on a single unified track. Each level carries its own text
 * label ("no pain", "worst pain imaginable", "severe") as well as a colour, so the meaning
 * never depends on colour alone (docs/ui-ux-specification.md §1).
 *
 * Two things this deliberately fixes from the earlier version:
 *
 *   1. It was a `grid-cols-6` grid holding 11 items, so the last row held five and the
 *      right edge was ragged — the "misaligned" look. It is now a wrapping flex row whose
 *      items each grow (`flex-1`) to fill their row, so every row is flush on both edges.
 *   2. Selecting a level replaced its severity colour with the brand fill, so the selected
 *      button stopped communicating severity. Selection is now an additive treatment — a
 *      full-strength fill of the *same* severity colour plus a prominent ring — so severity
 *      and selection are both readable at once.
 *
 * The 96px+ emergency target height is kept (docs/ui-ux-specification.md §1): this control
 * is used one-handed, under stress, sometimes by someone in pain.
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

type Severity = 'mild' | 'moderate' | 'severe';

function severityFor(value: number): Severity {
  if (value <= 3) return 'mild';
  if (value <= 6) return 'moderate';
  return 'severe';
}

/** Resting state: a tint of the severity colour. */
const RESTING: Record<Severity, string> = {
  mild: 'border-success/25 bg-success/10 text-success hover:bg-success/20',
  moderate: 'border-warning/25 bg-warning/10 text-warning hover:bg-warning/20',
  severe: 'border-danger/25 bg-danger/10 text-danger hover:bg-danger/20',
};

/**
 * Selected state: the same severity, at full strength, plus a ring. The ring uses the
 * theme's ink so it reads as "chosen" in every theme (white on dark, black on the
 * high-contrast theme) independently of the severity hue.
 */
const SELECTED: Record<Severity, string> = {
  mild: 'border-transparent bg-success-solid text-success-ink ring-2 ring-ink ring-offset-2 ring-offset-bg',
  moderate:
    'border-transparent bg-warning-solid text-warning-ink ring-2 ring-ink ring-offset-2 ring-offset-bg',
  severe: 'border-transparent bg-danger-solid text-danger-ink ring-2 ring-ink ring-offset-2 ring-offset-bg',
};

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
        className="flex flex-wrap gap-2"
      >
        {Array.from({ length: 11 }, (_, level) => {
          const selected = value === level;
          const severity = severityFor(level);
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(level)}
              className={cn(
                'flex min-h-emergency min-w-[3rem] flex-1 items-center justify-center rounded-lg border text-2xl font-bold leading-none tabular-nums',
                'transition-colors duration-150',
                selected ? SELECTED[severity] : RESTING[severity],
              )}
            >
              <span aria-hidden="true">{level}</span>
              <span className="sr-only">
                {level} — {DESCRIPTORS[level]}
              </span>
            </button>
          );
        })}
      </div>

      {/* End anchors, so the direction of the scale is readable at a glance. */}
      <div className="flex justify-between text-xs font-medium uppercase tracking-wide text-faint">
        <span>No pain</span>
        <span>Worst imaginable</span>
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

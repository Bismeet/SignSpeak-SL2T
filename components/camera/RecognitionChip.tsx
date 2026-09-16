'use client';

/**
 * Recognition chip (FR-STT-04 to FR-STT-06).
 *
 * Shows the accepted sign, its confidence band, and two actions: Confirm and Not this.
 * A low-confidence prediction is *never* auto-accepted — it does not reach this component
 * at all, because `lib/vision/decision.ts` rejects it upstream and the panel shows
 * "Not recognised" instead.
 */

import { Button } from '@/components/ui/Button';
import { ConfidenceBadge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { glossLabel } from '@/lib/signs/vocabulary';
import type { AcceptedSign } from '@/lib/vision/use-sign-recognition';
import { cn } from '@/lib/utils/cn';

export interface RecognitionChipProps {
  sign: AcceptedSign;
  onConfirm: () => void;
  onCorrect: () => void;
  onReject: () => void;
  showNumericConfidence?: boolean;
  className?: string;
}

export function RecognitionChip({
  sign,
  onConfirm,
  onCorrect,
  onReject,
  showNumericConfidence = false,
  className,
}: RecognitionChipProps) {
  const label = glossLabel(sign.label);

  return (
    <div
      className={cn(
        'ss-bordered animate-fade-rise rounded-2xl border-primary bg-primary-soft p-3.5',
        className,
      )}
      role="group"
      aria-label={`Recognised sign: ${label}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Icon name="hand" size="1.5rem" className="text-primary" />
          {label}
        </span>
        <ConfidenceBadge
          band={sign.band}
          probability={sign.probability}
          showNumeric={showNumericConfidence}
        />
      </div>

      <p className="mt-2 text-pretty text-sm text-muted">
        This was recognised on this device. Confirm it, correct it, or delete it. Nothing is
        spoken until you press Speak.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="success" icon="check" onClick={onConfirm}>
          Confirm
        </Button>
        <Button size="sm" variant="secondary" icon="pencil" onClick={onCorrect}>
          Not this — choose another
        </Button>
        <Button size="sm" variant="ghost" icon="trash" onClick={onReject}>
          Delete
        </Button>
      </div>
    </div>
  );
}

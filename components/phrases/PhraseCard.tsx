'use client';

/**
 * A single phrase row in the hospital phrase board.
 *
 * Every phrase offers: the text in English and Hindi, a Speak button, and — only when a
 * verified clip exists — a "Show ISL" button. Draft phrases carry a visible UNVERIFIED
 * badge (FR-HOSP-05) and never a "Show ISL" button, because there is nothing verified to
 * show.
 */

import { Badge, VerificationBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { clipAvailability } from '@/lib/phrases/data';
import type { Phrase } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

export interface PhraseCardProps {
  phrase: Phrase;
  onSpeak: (phrase: Phrase) => void;
  onShowClip: (phrase: Phrase) => void;
  /** Adds the phrase to the conversation feed. */
  onAddToConversation?: (phrase: Phrase) => void;
  /** True when this phrase's clip is currently open in the player. */
  active?: boolean;
  /** `emergency` renders the large variant used in Emergency mode. */
  size?: 'default' | 'emergency';
  className?: string;
}

export function PhraseCard({
  phrase,
  onSpeak,
  onShowClip,
  onAddToConversation,
  active = false,
  size = 'default',
  className,
}: PhraseCardProps) {
  const availability = clipAvailability(phrase);
  const hasVerifiedClip = availability === 'verified_clip';

  if (size === 'emergency') {
    return (
      <div
        className={cn(
          'ss-bordered flex h-full flex-col justify-between gap-3 rounded-2xl bg-gradient-to-b from-surface to-bg p-4',
          active && 'border-primary ring-2 ring-primary/40',
          className,
        )}
      >
        <p className="text-pretty text-2xl font-bold leading-tight">{phrase.textEn}</p>
        {phrase.textHi ? (
          <p className="text-pretty text-lg text-muted" lang="hi">
            {phrase.textHi}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="lg"
            icon="speaker"
            onClick={() => onSpeak(phrase)}
            aria-label={`Speak: ${phrase.textEn}`}
          >
            Speak
          </Button>
          {hasVerifiedClip ? (
            <Button
              variant="secondary"
              size="lg"
              icon="video"
              onClick={() => onShowClip(phrase)}
              aria-label={`Show ISL video for: ${phrase.textEn}`}
            >
              ISL
            </Button>
          ) : null}
          {onAddToConversation ? (
            <Button
              variant="secondary"
              size="lg"
              icon="plus"
              onClick={() => onAddToConversation(phrase)}
              aria-label={`Add to conversation: ${phrase.textEn}`}
            >
              Add
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <li
      className={cn(
        'ss-bordered rounded-2xl bg-surface p-4 transition-colors duration-150',
        active && 'border-primary ring-2 ring-primary/35',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-pretty text-xl font-semibold leading-snug">{phrase.textEn}</p>
          {phrase.textHi ? (
            <p className="mt-1 text-pretty text-lg text-muted" lang="hi">
              {phrase.textHi}
            </p>
          ) : (
            <p className="mt-1 text-sm text-faint">No Hindi translation yet</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VerificationBadge
              status={phrase.validation.status}
              verifiedBy={phrase.validation.verifiedBy}
              verifiedOn={phrase.validation.verifiedOn}
            />
            {hasVerifiedClip ? (
              <Badge tone="primary" icon="video">
                ISL video available
              </Badge>
            ) : (
              <Badge tone="neutral" icon="video">
                No verified ISL video
              </Badge>
            )}
            {phrase.speaker !== 'both' ? (
              <Badge tone="neutral" icon={phrase.speaker === 'deaf_user' ? 'hand' : 'mic'}>
                {phrase.speaker === 'deaf_user' ? 'Deaf user says this' : 'Staff says this'}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            icon="speaker"
            onClick={() => onSpeak(phrase)}
            aria-label={`Speak: ${phrase.textEn}`}
          >
            Speak
          </Button>
          {hasVerifiedClip ? (
            <Button
              variant="secondary"
              size="md"
              icon="video"
              onClick={() => onShowClip(phrase)}
              aria-label={`Show ISL video for: ${phrase.textEn}`}
            >
              Show ISL
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              icon="eye"
              onClick={() => onShowClip(phrase)}
              aria-label={`Show why there is no ISL video for: ${phrase.textEn}`}
            >
              Why no video?
            </Button>
          )}
          {onAddToConversation ? (
            <Button
              variant="ghost"
              size="md"
              icon="plus"
              onClick={() => onAddToConversation(phrase)}
              aria-label={`Add to conversation: ${phrase.textEn}`}
            >
              Add
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Compact counter chip used above phrase lists. */
export function PhraseCountBadge({ count, label }: { count: number; label: string }) {
  return (
    <Badge tone="neutral" icon="list">
      {count} {label}
    </Badge>
  );
}

/** Explains the verification model once, at the top of the board. */
export function VerificationLegend() {
  return (
    <div className="ss-bordered flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-raised px-4 py-3 text-sm">
      <span className="font-semibold">Badge meanings:</span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="badge-check" size="1rem" className="text-success" />
        Verified by an ISL signer
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="alert" size="1rem" className="text-warning" />
        Unverified draft — wording needs ISL expert review
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="video" size="1rem" className="text-muted" />
        No verified ISL video for this phrase
      </span>
    </div>
  );
}

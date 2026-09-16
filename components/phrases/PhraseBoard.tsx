'use client';

/**
 * Hospital phrase board (FR-HOSP-01, FR-HOSP-03, FR-HOSP-05).
 *
 * Structure: a category grid, then the phrases in that category, then the ISL clip player
 * (or the explicit "no verified ISL video" state) for the selected phrase.
 *
 * Reachability: Home -> Phrases -> category -> phrase is three taps, which meets
 * T-PHR-05. Every phrase is also reachable in one tap once the board is open.
 */

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Panel, SectionHeading } from '@/components/ui/Surface';
import { EmptyState } from '@/components/common/PermissionState';
import { ClipPlayer } from '@/components/phrases/ClipPlayer';
import { PhraseCard, VerificationLegend } from '@/components/phrases/PhraseCard';
import { SpeakControls } from '@/components/speech/SpeakControls';
import { categoryCounts, groupPhrasesByCategory, PHRASE_CATEGORY_META } from '@/lib/phrases/data';
import type { UseSpeakerResult } from '@/lib/speech/use-speaker';
import type { Phrase, PhraseCategory } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

const CATEGORY_ICON: Record<PhraseCategory, IconName> = {
  pain: 'activity',
  symptoms: 'alert',
  needs: 'droplet',
  help: 'help',
  staff_questions: 'question',
  staff_instructions: 'list',
  answers: 'check',
};

export interface PhraseBoardProps {
  showUnverified: boolean;
  speaker: UseSpeakerResult;
  onAddToConversation?: (phrase: Phrase) => void;
  /** Category to open on mount. */
  initialCategory?: PhraseCategory | null;
  className?: string;
}

export function PhraseBoard({
  showUnverified,
  speaker,
  onAddToConversation,
  initialCategory = null,
  className,
}: PhraseBoardProps) {
  const [category, setCategory] = useState<PhraseCategory | null>(initialCategory);
  const [activePhrase, setActivePhrase] = useState<Phrase | null>(null);

  const groups = useMemo(() => groupPhrasesByCategory(showUnverified), [showUnverified]);
  const counts = useMemo(() => categoryCounts(showUnverified), [showUnverified]);

  const visibleGroup = groups.find((group) => group.category === category) ?? null;

  function selectCategory(next: PhraseCategory | null) {
    setCategory(next);
    setActivePhrase(null);
  }

  if (groups.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          icon="list"
          title="No phrases are visible"
          description="Every phrase in this build is a draft awaiting ISL expert review, and drafts are hidden by default. Turn on “Show unverified phrases” in Settings to see them, clearly badged as unverified."
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      <VerificationLegend />

      {!showUnverified ? (
        <Callout tone="neutral" icon="info" title="Only verified content is shown">
          Draft phrases are hidden because no ISL signer has reviewed them yet. Turn on “Show
          unverified phrases” in Settings to preview the full board — drafts are always badged.
        </Callout>
      ) : (
        <Callout tone="warning" icon="alert" title="Draft content is visible">
          “Show unverified phrases” is on. Phrases badged <strong>Unverified</strong> have not been
          reviewed by an ISL signer, and their wording may be wrong for a clinical setting. They are
          never presented as verified ISL.
        </Callout>
      )}

      {/* Category grid */}
      <section aria-labelledby="phrase-categories-heading">
        <SectionHeading
          id="phrase-categories-heading"
          title={category ? 'Categories' : 'Choose a category'}
          level={2}
          actions={
            category ? (
              <Button variant="ghost" icon="arrow-left" onClick={() => selectCategory(null)}>
                All categories
              </Button>
            ) : undefined
          }
        />
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PHRASE_CATEGORY_META.map((meta) => {
            const count = counts[meta.category];
            const disabled = count === 0;
            const selected = category === meta.category;
            return (
              <li key={meta.category}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => selectCategory(meta.category)}
                  aria-pressed={selected}
                  className={cn(
                    'ss-bordered flex min-h-touch w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left transition-colors duration-150',
                    disabled
                      ? 'cursor-not-allowed opacity-55'
                      : 'hover:bg-raised',
                    selected && 'border-primary bg-primary-soft',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
                      selected ? 'bg-primary text-primary-ink' : 'bg-primary-soft text-primary',
                    )}
                  >
                    <Icon name={CATEGORY_ICON[meta.category]} size="1.5rem" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{meta.label}</span>
                    <span className="block text-sm text-muted">{meta.description}</span>
                    <span className="mt-1 block text-sm font-semibold text-muted">
                      {disabled ? 'Hidden (no verified phrases)' : `${count} phrase${count === 1 ? '' : 's'}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Phrase list for the selected category */}
      {visibleGroup ? (
        <section aria-labelledby="phrase-list-heading">
          <SectionHeading
            id="phrase-list-heading"
            title={visibleGroup.label}
            description={visibleGroup.description}
            level={2}
            actions={<Badge tone="neutral" icon="list">{visibleGroup.phrases.length} phrases</Badge>}
          />
          <ul className="mt-4 space-y-3">
            {visibleGroup.phrases.map((phrase) => (
              <PhraseCard
                key={phrase.id}
                phrase={phrase}
                active={activePhrase?.id === phrase.id}
                onSpeak={(selected) => {
                  setActivePhrase(selected);
                  void speaker.speak(selected.textEn, { language: 'en-IN' });
                }}
                onShowClip={(selected) => setActivePhrase(selected)}
                onAddToConversation={onAddToConversation}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Clip player / no-clip state for the selected phrase */}
      {activePhrase ? (
        <section aria-labelledby="phrase-detail-heading">
          <SectionHeading
            id="phrase-detail-heading"
            title={activePhrase.textEn}
            description="The ISL video for this phrase, if a qualified signer has verified one."
            level={2}
            actions={
              <Button variant="ghost" icon="x" onClick={() => setActivePhrase(null)}>
                Close
              </Button>
            }
          />
          <Card elevation="raised" className="mt-4">
            <Panel padding="md">
              <ClipPlayer
                phrase={activePhrase}
                actions={
                  <>
                    <Button
                      variant="primary"
                      icon="speaker"
                      onClick={() => void speaker.speak(activePhrase.textEn, { language: 'en-IN' })}
                    >
                      Speak in English
                    </Button>
                    {activePhrase.textHi ? (
                      <Button
                        variant="secondary"
                        icon="speaker"
                        onClick={() => void speaker.speak(activePhrase.textHi, { language: 'hi-IN' })}
                      >
                        Speak in Hindi
                      </Button>
                    ) : null}
                    {onAddToConversation ? (
                      <Button
                        variant="ghost"
                        icon="plus"
                        onClick={() => onAddToConversation(activePhrase)}
                      >
                        Add to conversation
                      </Button>
                    ) : null}
                  </>
                }
              />
            </Panel>
          </Card>

          <Card elevation="flat" className="mt-3">
            <Panel padding="md">
              <SpeakControls
                speaker={speaker}
                text={activePhrase.textEn}
                label="Speak this phrase aloud"
                showLanguageSelector={false}
              />
            </Panel>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

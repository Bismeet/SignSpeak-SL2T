'use client';

/**
 * Emergency mode (FR-HOSP-04, UC4).
 *
 * Design constraints, all deliberate:
 *   - at most 8 phrases, each on a button at least 96px tall;
 *   - reachable in one tap from Home;
 *   - needs no camera, no model, no microphone and no network, so it keeps working when
 *     every other feature is unavailable (risk R9 fallback, MVP acceptance criterion 4);
 *   - the safety banner names the local emergency number and is always visible;
 *   - a running text output so staff can read what the patient has selected.
 *
 * SignSpeak never suggests a diagnosis or a treatment here.
 */

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Card, Panel, SectionHeading } from '@/components/ui/Surface';
import { EmptyState } from '@/components/common/PermissionState';
import { ClipPlayer } from '@/components/phrases/ClipPlayer';
import { PainScale, painSentence } from '@/components/emergency/PainScale';
import { config } from '@/lib/config';
import { clipAvailability, emergencyPhrases } from '@/lib/phrases/data';
import type { UseSpeakerResult } from '@/lib/speech/use-speaker';
import type { Phrase } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

export interface EmergencyBoardProps {
  showUnverified: boolean;
  speaker: UseSpeakerResult;
  onAddToConversation?: (phrase: Phrase) => void;
  className?: string;
}

export function EmergencyBoard({
  showUnverified,
  speaker,
  onAddToConversation,
  className,
}: EmergencyBoardProps) {
  const phrases = useMemo(() => emergencyPhrases(showUnverified), [showUnverified]);
  const [selected, setSelected] = useState<Phrase | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [spokenLog, setSpokenLog] = useState<string[]>([]);
  const [showClip, setShowClip] = useState(false);

  function speak(text: string) {
    void speaker.speak(text, { language: 'en-IN' });
    setSpokenLog((previous) => [...previous, text]);
  }

  function choose(phrase: Phrase) {
    setSelected(phrase);
    setShowClip(false);
    speak(phrase.textEn);
    onAddToConversation?.(phrase);
  }

  if (phrases.length === 0) {
    return (
      <EmptyState
        icon="siren"
        title="Emergency phrases are hidden"
        description="Every emergency phrase is currently a draft awaiting ISL expert review, and drafts are hidden by default. Turn on “Show unverified phrases” in Settings, or use the hospital phrase board."
      />
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      {/* Safety banner: always visible, never dismissible. Solid rose is deliberate —
          this is the one message on the screen that must not be missable, and the fill
          clears 4.5:1 against its ink. */}
      <div
        className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger-solid px-4 py-3 text-danger-ink"
        role="alert"
      >
        <Icon name="siren" size="1.7rem" className="mt-0.5" />
        <p className="min-w-0 flex-1 text-pretty font-bold">
          In a real emergency, call {config.emergencyNumber} and get staff first. SignSpeak helps you
          communicate — it does not call anyone, and it does not assess how serious your condition is.
        </p>
      </div>

      <SectionHeading
        level={1}
        title="Emergency phrases"
        description="Tap what you need. Each phrase is spoken aloud and shown in large text."
        icon="siren"
      />

      {/* 8 large buttons */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {phrases.slice(0, 8).map((phrase) => {
          const isSelected = selected?.id === phrase.id;
          return (
            <li key={phrase.id}>
              <button
                type="button"
                onClick={() => choose(phrase)}
                aria-pressed={isSelected}
                className={cn(
                  'flex h-full min-h-emergency w-full flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-4 text-center transition-colors duration-150',
                  isSelected
                    ? 'border-primary bg-primary-soft ring-1 ring-primary/40'
                    : 'border-line bg-raised/40 hover:border-primary/50 hover:bg-primary/5',
                )}
              >
                <span className="text-pretty text-lg font-semibold leading-tight text-ink sm:text-xl">
                  {phrase.textEn}
                </span>
                {phrase.textHi ? (
                  <span className="text-pretty text-sm font-medium text-muted" lang="hi">
                    {phrase.textHi}
                  </span>
                ) : null}
                {clipAvailability(phrase) === 'verified_clip' ? (
                  <Badge size="micro" tone="success" icon="badge-check">
                    ISL video
                  </Badge>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Selected phrase output */}
      {selected ? (
        <Card elevation="raised" accent="primary">
          <Panel padding="md" className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                  You selected
                </p>
                <p className="mt-1 text-pretty text-3xl font-bold leading-tight">
                  {selected.textEn}
                </p>
                {selected.textHi ? (
                  <p className="mt-2 text-pretty text-xl text-muted" lang="hi">
                    {selected.textHi}
                  </p>
                ) : null}
              </div>
              <Button variant="ghost" icon="x" onClick={() => setSelected(null)}>
                Clear
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" icon="speaker" onClick={() => speak(selected.textEn)}>
                Speak again
              </Button>
              {selected.textHi ? (
                <Button
                  variant="secondary"
                  size="lg"
                  icon="speaker"
                  onClick={() => speak(selected.textHi)}
                >
                  Speak in Hindi
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="lg"
                icon="video"
                onClick={() => setShowClip((value) => !value)}
              >
                {showClip ? 'Hide ISL video' : 'Show ISL video'}
              </Button>
            </div>

            {showClip ? <ClipPlayer phrase={selected} /> : null}
          </Panel>
        </Card>
      ) : null}

      {/* Pain scale */}
      <Card elevation="flat">
        <Panel padding="md" className="space-y-4">
          <PainScale value={pain} onChange={setPain} />
          {pain !== null ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-pretty text-xl font-semibold">{painSentence(pain)}</p>
              <Button
                variant="primary"
                icon="speaker"
                onClick={() => speak(painSentence(pain))}
              >
                Speak this
              </Button>
            </div>
          ) : null}
        </Panel>
      </Card>

      {/* Running output for staff */}
      <Card elevation="flat">
        <Panel padding="md" className="space-y-3">
          <SectionHeading
            level={2}
            title="Shown to staff"
            description="Everything selected in this session, in order. Nothing is stored after you leave the page."
            actions={
              spokenLog.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  onClick={() => setSpokenLog([])}
                >
                  Clear list
                </Button>
              ) : undefined
            }
          />
          {spokenLog.length === 0 ? (
            <p className="text-muted">
              Nothing selected yet. Tap a button above and it will appear here.
            </p>
          ) : (
            <ol className="space-y-2">
              {spokenLog.map((text, index) => (
                <li
                  key={`${text}-${index}`}
                  className="ss-bordered rounded-xl bg-raised px-4 py-3 text-xl font-medium"
                >
                  {text}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </Card>

      {!speaker.supported ? (
        <Callout tone="warning" icon="volume-off" title="Audio is unavailable here">
          The phrases above stay on screen in large type, so you can show them to staff directly.
        </Callout>
      ) : null}

      {!showUnverified ? (
        <Callout tone="neutral" icon="info">
          These emergency phrases are drafts awaiting ISL expert review, so they are shown without a
          “verified” badge. The wording is a starting point, not a clinical script.
        </Callout>
      ) : null}
    </div>
  );
}

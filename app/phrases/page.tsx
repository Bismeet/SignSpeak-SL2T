'use client';

/**
 * Hospital phrases screen (FR-HOSP-01, FR-HOSP-03, FR-HOSP-05).
 *
 * Works with no camera, no model and no network: the phrase list is compiled into the
 * bundle, and speech synthesis is a browser feature that needs no server.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SectionHeading } from '@/components/ui/Surface';
import { PhraseBoard } from '@/components/phrases/PhraseBoard';
import { useSpeaker } from '@/lib/speech/use-speaker';
import { useSettings } from '@/lib/state/settings';
import { phraseSummary } from '@/lib/phrases/data';

export default function PhrasesPage() {
  const { settings, update } = useSettings();
  const speaker = useSpeaker();
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const summary = phraseSummary();

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-5 sm:py-8">
      <SectionHeading
        level={1}
        title="Hospital phrases"
        description="A curated list of phrases for hospital and emergency settings. Tap a phrase to hear it, and to see its ISL video when a qualified signer has verified one."
        icon="list"
        actions={
          <Button
            variant="secondary"
            icon={settings.showUnverifiedPhrases ? 'eye-off' : 'eye'}
            onClick={() => update('showUnverifiedPhrases', !settings.showUnverifiedPhrases)}
            aria-pressed={settings.showUnverifiedPhrases}
          >
            {settings.showUnverifiedPhrases ? 'Hide unverified phrases' : 'Show unverified phrases'}
          </Button>
        }
      />

      <div className="mt-4 space-y-4">
        <Callout tone="neutral" icon="info" title="How this list is built">
          <p>
            {summary.total} phrases across {summary.categories} categories, written for this project
            and matched exactly or by a small set of known wordings. Nothing here is generated on the
            fly: a phrase either matches the curated list or the app says it has no video for it.
          </p>
          <p className="mt-2">
            {summary.verified === 0
              ? 'No phrase has been reviewed by a qualified ISL signer yet, so none carries a “verified” badge and none has an ISL video. That is why the board is shown as text plus speech for now.'
              : `${summary.verified} phrases have been verified by an ISL signer.`}{' '}
            Hindi translations are drafts written by the team and need native-speaker review.
          </p>
        </Callout>

        {addedNote ? (
          <Callout
            tone="success"
            icon="check"
            title="Added"
            actions={
              <Button size="sm" variant="ghost" icon="x" onClick={() => setAddedNote(null)}>
                Dismiss
              </Button>
            }
          >
            {addedNote}
          </Callout>
        ) : null}

        <PhraseBoard
          showUnverified={settings.showUnverifiedPhrases}
          speaker={speaker}
          onAddToConversation={(phrase) =>
            setAddedNote(
              `“${phrase.textEn}” was added to the conversation. It is kept in memory only and disappears when you reload or end the conversation.`,
            )
          }
        />

        <Callout tone="warning" icon="alert" title="SignSpeak is a communication aid, not medical advice">
          These phrases help you communicate. They are not a clinical script, and using them does not
          replace assessment by a qualified healthcare professional or an ISL interpreter.
        </Callout>
      </div>
    </div>
  );
}

'use client';

/**
 * Talk — the two-way conversation screen (docs/ui-ux-specification.md §3.2).
 *
 * Desktop and tablet landscape: three columns — deaf user (camera + speak), conversation
 * feed, hearing user (speech/typing). Phone: tabs for Camera / Speak & Type with the feed
 * below, so nothing is squeezed and every control stays a thumb-sized target.
 *
 * This screen wires together every feature and is where the privacy and honesty rules
 * become concrete:
 *   - nothing is spoken until the user presses Speak (unless auto-speak is explicitly on);
 *   - a recognised word is added as a *reviewable* message, never as a settled fact;
 *   - a hearing user's message is matched against the curated phrase list, and the
 *     delivery mode ("ISL clip" or "text only") is recorded on the message.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Card, Panel, SectionHeading } from '@/components/ui/Surface';
import { CameraPanel } from '@/components/camera/CameraPanel';
import { ConversationFeed, TurnIndicator } from '@/components/conversation/ConversationFeed';
import { CorrectionSheet } from '@/components/conversation/CorrectionSheet';
import { ClipPlayer } from '@/components/phrases/ClipPlayer';
import { PhraseBoard } from '@/components/phrases/PhraseBoard';
import { SpeakControls } from '@/components/speech/SpeakControls';
import { SpeechInputPanel } from '@/components/speech/SpeechInputPanel';
import { PHRASE_MATCHER } from '@/lib/phrases/data';
import { clipAvailability } from '@/lib/phrases/data';
import { MATCH_METHOD_LABEL } from '@/lib/phrases/matcher';
import { glossLabel } from '@/lib/signs/vocabulary';
import { useAsr } from '@/lib/speech/use-asr';
import { useSpeaker } from '@/lib/speech/use-speaker';
import { useConversation } from '@/lib/state/conversation';
import { unspeokenDeafUserText } from '@/lib/state/conversation-reducer';
import { appendLandmarkSample } from '@/lib/state/landmark-log';
import { useSettings } from '@/lib/state/settings';
import { useSignRecognition, type AcceptedSign } from '@/lib/vision/use-sign-recognition';
import { createId } from '@/lib/utils/misc';
import type { ConversationMessage, Phrase } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

type MobileTab = 'camera' | 'speak';

export default function TalkPage() {
  const { settings, update } = useSettings();
  const { state, dispatch, endConversation } = useConversation();
  const speaker = useSpeaker();

  const [mobileTab, setMobileTab] = useState<MobileTab>('camera');
  const [phraseDrawerOpen, setPhraseDrawerOpen] = useState(false);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [activeClip, setActiveClip] = useState<Phrase | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [lastMatchNote, setLastMatchNote] = useState<string | null>(null);

  const latestRecognitionIdRef = useRef<string | null>(null);

  /* ---------------------------------------------------------------------------------
   * Sign recognition -> conversation
   * ------------------------------------------------------------------------------- */

  const handleAccepted = useCallback(
    (sign: AcceptedSign) => {
      const id = createId('msg');
      latestRecognitionIdRef.current = id;
      dispatch({
        type: 'add',
        message: {
          id,
          party: 'deaf_user',
          source: 'sign_recognition',
          text: glossLabel(sign.label),
          recognition: {
            originalLabel: sign.label,
            probability: sign.probability,
            band: sign.band,
            alternatives: sign.alternatives,
            reviewed: false,
            corrected: false,
            rejected: false,
          },
        },
      });
      // FR-SPK-02: auto-speak is off by default and must be explicitly enabled.
      if (settings.autoSpeakRecognised) {
        void speaker.speak(glossLabel(sign.label), { language: 'en-IN' });
      }
    },
    [dispatch, settings.autoSpeakRecognised, speaker],
  );

  const recognition = useSignRecognition({ onAccepted: handleAccepted });

  const handleConfirmSign = useCallback(
    () => {
      const id = latestRecognitionIdRef.current;
      if (id) dispatch({ type: 'confirmRecognition', id });
    },
    [dispatch],
  );

  const handleCorrectSign = useCallback(() => {
    const id = latestRecognitionIdRef.current;
    if (id) setCorrectionId(id);
  }, []);

  const handleRejectSign = useCallback(() => {
    const id = latestRecognitionIdRef.current;
    if (id) dispatch({ type: 'rejectRecognition', id });
    latestRecognitionIdRef.current = null;
  }, [dispatch]);

  /* ---------------------------------------------------------------------------------
   * Hearing user input -> phrase match -> conversation
   * ------------------------------------------------------------------------------- */

  const asr = useAsr({
    language: settings.asrLanguage,
    onLanguageChange: (language) => update('asrLanguage', language),
  });

  const sendHearingMessage = useCallback(
    (text: string, source: 'speech_recognition' | 'typed') => {
      // Match against the whole curated list, not only the verified subset.
      //
      // `includeUnverified` gates whether a verified *clip* may be offered, and that gate is
      // applied separately below through `clipAvailability`. It must not gate whether the app
      // can recognise text the user has already typed. With it tied to the reviewer setting,
      // and no clip verified yet, every phrase failed to match and the app told the user "no
      // phrase in the curated list matches this" — for phrases that are in the list. Nothing
      // unverified can reach the deaf user as ISL as a result, because the clip is still
      // gated and the note says plainly that no verified video exists.
      const match = PHRASE_MATCHER.match(text, { includeUnverified: true });
      const phrase = match.matched ? match.phrase : null;
      const availability = phrase ? clipAvailability(phrase) : null;
      const mode = availability === 'verified_clip' ? 'isl_clip' : 'text_only';

      dispatch({
        type: 'add',
        message: {
          party: 'hearing_user',
          source,
          text,
          delivery: {
            mode,
            ...(phrase ? { phraseId: phrase.id, clipStatus: phrase.validation.status } : {}),
          },
        },
      });

      if (phrase) {
        setActiveClip(phrase);
        setLastMatchNote(
          `${MATCH_METHOD_LABEL[match.method]} — “${phrase.textEn}”. ${
            mode === 'isl_clip'
              ? 'A verified ISL video is shown to the deaf user.'
              : 'No verified ISL video exists for this phrase, so it is shown as text only.'
          }`,
        );
      } else {
        setActiveClip(null);
        setLastMatchNote(
          match.candidates.length > 0 && match.candidates[0]
            ? `No exact match. The closest phrase was “${match.candidates[0].phrase.textEn}”. Nothing was invented — the text is shown as written.`
            : 'No phrase in the curated list matches this. The text is shown as written, with the “no verified ISL video” notice.',
        );
      }
    },
    [dispatch],
  );

  /* ---------------------------------------------------------------------------------
   * Shared actions
   * ------------------------------------------------------------------------------- */

  const composedText = useMemo(() => unspeokenDeafUserText(state.messages), [state.messages]);

  const addPhraseToConversation = useCallback(
    (phrase: Phrase) => {
      dispatch({
        type: 'add',
        message: {
          party: phrase.speaker === 'hearing_user' ? 'hearing_user' : 'deaf_user',
          source: 'phrase_board',
          text: phrase.textEn,
          delivery:
            phrase.speaker === 'hearing_user'
              ? {
                  mode: clipAvailability(phrase) === 'verified_clip' ? 'isl_clip' : 'text_only',
                  phraseId: phrase.id,
                  clipStatus: phrase.validation.status,
                }
              : undefined,
        },
      });
      if (clipAvailability(phrase) === 'verified_clip') setActiveClip(phrase);
    },
    [dispatch],
  );

  const speakMessage = useCallback(
    (message: ConversationMessage) => {
      dispatch({ type: 'markSpoken', id: message.id, spoken: true });
      void speaker.speak(message.text, { language: 'en-IN' });
    },
    [dispatch, speaker],
  );

  const correctionMessage = useMemo(
    () => state.messages.find((message) => message.id === correctionId) ?? null,
    [state.messages, correctionId],
  );

  /**
   * Opt-in local correction log (docs/privacy-and-safety.md §3). Writes the landmark
   * feature vector that produced a wrong prediction, with the corrected label, into this
   * browser's IndexedDB only. Never images, never text, never transmitted.
   */
  const logCorrection = useCallback(
    (correctedLabel: string) => {
      if (!settings.logLandmarksLocally) return;
      const message = correctionMessage;
      const features = recognition.consumeLastAcceptedFeatures();
      if (!message?.recognition || !features) return;
      void appendLandmarkSample({
        predictedLabel: message.recognition.originalLabel,
        correctedLabel,
        probability: message.recognition.probability,
        features,
      });
    },
    [settings.logLandmarksLocally, correctionMessage, recognition],
  );

  const unreviewed = state.messages.filter(
    (message) => message.recognition && !message.recognition.reviewed,
  ).length;

  /* ---------------------------------------------------------------------------------
   * Panels
   * ------------------------------------------------------------------------------- */

  const cameraPanel = (
    <div className="space-y-4">
      <CameraPanel
        recognition={recognition}
        onConfirm={handleConfirmSign}
        onCorrect={handleCorrectSign}
        onReject={handleRejectSign}
        onOpenPhraseBoard={() => setPhraseDrawerOpen(true)}
      />

      <Card elevation="flat">
        <Panel padding="md">
          <SpeakControls
            speaker={speaker}
            text={composedText}
            label="Speak everything you have said"
            showLanguageSelector={false}
            onSpoken={() => {
              for (const message of state.messages) {
                if (message.party === 'deaf_user') {
                  dispatch({ type: 'markSpoken', id: message.id, spoken: true });
                }
              }
            }}
          />
        </Panel>
      </Card>
    </div>
  );

  const hearingPanel = (
    <div className="space-y-4">
      <Card elevation="flat">
        <Panel padding="md">
          <SpeechInputPanel
            asr={asr}
            onSend={sendHearingMessage}
            onAfterSend={() => setMobileTab('camera')}
          />
        </Panel>
      </Card>

      {lastMatchNote ? (
        <Callout
          tone="neutral"
          icon="info"
          title="What the deaf user sees"
          actions={
            <Button size="sm" variant="ghost" icon="x" onClick={() => setLastMatchNote(null)}>
              Dismiss
            </Button>
          }
        >
          {lastMatchNote}
        </Callout>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-6">
      {/* Screen header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          level={1}
          title="Conversation"
          description="One shared record. Messages stay in this browser tab only and are cleared when you end the conversation or reload."
          icon="users"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={state.hidden ? 'eye' : 'eye-off'}
            onClick={() => dispatch({ type: 'setHidden', hidden: !state.hidden })}
            aria-pressed={state.hidden}
          >
            {state.hidden ? 'Show conversation' : 'Hide conversation'}
          </Button>
          <Button variant="danger" icon="stop" onClick={() => setConfirmEnd(true)}>
            End conversation
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="neutral" icon="list">
          {state.messages.length} message{state.messages.length === 1 ? '' : 's'}
        </Badge>
        {unreviewed > 0 ? (
          <Badge tone="warning" icon="alert">
            {unreviewed} recognised word{unreviewed === 1 ? '' : 's'} not yet confirmed
          </Badge>
        ) : null}
        <Badge tone="neutral" icon="lock">
          Nothing stored or uploaded
        </Badge>
      </div>

      {/* Phone tabs */}
      <div className="mt-4 lg:hidden">
        <div role="tablist" aria-label="Input mode" className="flex gap-2">
          {(
            [
              { id: 'camera' as const, label: 'Deaf user — sign', icon: 'camera' as const },
              { id: 'speak' as const, label: 'Hearing user — speak', icon: 'mic' as const },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setMobileTab(tab.id)}
              className={cn(
                'inline-flex min-h-touch flex-1 items-center justify-center gap-2 rounded-xl border px-3 font-semibold',
                mobileTab === tab.id
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-strong bg-surface text-muted',
              )}
            >
              <Icon name={tab.icon} size="1.15rem" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Deaf user column */}
        <section
          id="panel-camera"
          role="tabpanel"
          aria-labelledby="tab-camera"
          className={cn('space-y-4', mobileTab !== 'camera' && 'hidden lg:block')}
        >
          <h2 className="hidden items-center gap-2 text-lg font-semibold lg:flex">
            <Icon name="hand" size="1.25rem" className="text-primary" />
            Deaf user
          </h2>
          {cameraPanel}
        </section>

        {/* Conversation column */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="list" size="1.25rem" className="text-primary" />
            Shared conversation
          </h2>

          {activeClip ? (
            <Card elevation="raised" accent="primary">
              <Panel padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      Reply for the deaf user: “{activeClip.textEn}”
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {clipAvailability(activeClip) === 'verified_clip'
                        ? 'A verified ISL clip is available and is playing below.'
                        : 'No verified ISL video exists for this phrase, so it is shown as text only.'}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" icon="x" onClick={() => setActiveClip(null)}>
                    Close
                  </Button>
                </div>
                <div className="mt-3">
                  <ClipPlayer phrase={activeClip} />
                </div>
              </Panel>
            </Card>
          ) : null}

          <Card elevation="flat">
            <Panel padding="md">
              <ConversationFeed
                messages={state.messages}
                hidden={state.hidden}
                onEdit={(id, text) => dispatch({ type: 'setText', id, text })}
                onDelete={(id) => dispatch({ type: 'delete', id })}
                onMove={(id, direction) => dispatch({ type: 'move', id, direction })}
                onToggleMisunderstood={(id) => dispatch({ type: 'toggleMisunderstood', id })}
                onCorrectRecognition={(id) => setCorrectionId(id)}
                onSpeak={speakMessage}
                onPlayClip={(message) => {
                  const phrase = message.delivery?.phraseId
                    ? PHRASE_MATCHER.all().find((entry) => entry.id === message.delivery?.phraseId)
                    : undefined;
                  if (phrase) setActiveClip(phrase);
                }}
              />
            </Panel>
            <TurnIndicator
              activeParty={state.activeParty}
              cameraActive={recognition.camera === 'streaming'}
              micActive={asr.listening}
            />
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="list" onClick={() => setPhraseDrawerOpen(true)}>
              Phrase board
            </Button>
            <Button
              variant="ghost"
              icon="trash"
              disabled={state.messages.length === 0}
              onClick={() => dispatch({ type: 'clear' })}
            >
              Clear messages
            </Button>
          </div>
        </section>

        {/* Hearing user column */}
        <section
          id="panel-speak"
          role="tabpanel"
          aria-labelledby="tab-speak"
          className={cn('space-y-4', mobileTab !== 'speak' && 'hidden lg:block')}
        >
          <h2 className="hidden items-center gap-2 text-lg font-semibold lg:flex">
            <Icon name="mic" size="1.25rem" className="text-accent" />
            Hearing user
          </h2>
          {hearingPanel}
        </section>
      </div>

      {/* Phrase board drawer */}
      <Dialog
        open={phraseDrawerOpen}
        onClose={() => setPhraseDrawerOpen(false)}
        variant="sheet"
        title="Hospital phrase board"
        description="Pick a phrase to speak and add to the conversation. Works without the camera."
        className="sm:max-w-4xl"
        footer={
          <Button variant="secondary" block icon="arrow-left" onClick={() => setPhraseDrawerOpen(false)}>
            Back to conversation
          </Button>
        }
      >
        <PhraseBoard
          showUnverified={settings.showUnverifiedPhrases}
          speaker={speaker}
          onAddToConversation={addPhraseToConversation}
        />
      </Dialog>

      {/* Correction sheet */}
      <CorrectionSheet
        open={correctionId !== null}
        message={correctionMessage}
        onClose={() => setCorrectionId(null)}
        onChoose={(id, label) => {
          logCorrection(label);
          dispatch({ type: 'correctRecognition', id, label });
        }}
        onType={(id, text) => {
          logCorrection(text);
          dispatch({ type: 'setText', id, text });
          dispatch({ type: 'correctRecognition', id, label: text });
        }}
        onDelete={(id) => dispatch({ type: 'delete', id })}
      />

      {/* End conversation */}
      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => {
          recognition.stop();
          speaker.stop();
          asr.reset();
          endConversation();
          setConfirmEnd(false);
          setActiveClip(null);
        }}
        title="End this conversation?"
        description="Everything in this conversation is deleted from memory. SignSpeak never stored it anywhere else, so it cannot be recovered."
        confirmLabel="End and delete"
        destructive
      >
        <p className="text-muted">
          {state.messages.length} message{state.messages.length === 1 ? '' : 's'} will be removed.
          The camera and microphone are also stopped.
        </p>
      </ConfirmDialog>
    </div>
  );
}

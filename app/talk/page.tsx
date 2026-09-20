'use client';

/**
 * Talk — the two-way Patient ↔ Doctor communication workspace (docs/ui-ux-specification.md §3.2,
 * wireframe media_1789848449713.png).
 *
 * Layout:
 * 1. Screen header: "Conversation", subtitle, session active status, and Hide/End actions.
 * 2. Two main communication panels side-by-side:
 *    - Patient panel: camera preview, start camera button, signing status, and text/phrase fallback.
 *    - Doctor panel: 3D robot preview, five clinical phrase cards, selected phrase state, and Play Sign button.
 * 3. Shared conversation transcript below:
 *    - Distinct Patient and Doctor message styles with timestamps, badges, and review controls.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { CameraPanel } from '@/components/camera/CameraPanel';
import { ConversationFeed, TurnIndicator } from '@/components/conversation/ConversationFeed';
import { CorrectionSheet } from '@/components/conversation/CorrectionSheet';
import { DoctorPanel } from '@/components/conversation/DoctorPanel';
import { ClipPlayer } from '@/components/phrases/ClipPlayer';
import { PhraseBoard } from '@/components/phrases/PhraseBoard';
import { SpeakControls } from '@/components/speech/SpeakControls';
import { PHRASE_MATCHER, clipAvailability } from '@/lib/phrases/data';
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

export default function TalkPage() {
  const { settings, update } = useSettings();
  const { state, dispatch, endConversation } = useConversation();
  const speaker = useSpeaker();

  const [phraseDrawerOpen, setPhraseDrawerOpen] = useState(false);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [activeClip, setActiveClip] = useState<Phrase | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [patientTypeOpen, setPatientTypeOpen] = useState(false);
  const [patientText, setPatientText] = useState('');

  const latestRecognitionIdRef = useRef<string | null>(null);

  /* ---------------------------------------------------------------------------------
   * Patient Sign recognition -> conversation
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

  const handleConfirmSign = useCallback(() => {
    const id = latestRecognitionIdRef.current;
    if (id) dispatch({ type: 'confirmRecognition', id });
  }, [dispatch]);

  const handleCorrectSign = useCallback(() => {
    const id = latestRecognitionIdRef.current;
    if (id) setCorrectionId(id);
  }, []);

  const handleRejectSign = useCallback(() => {
    const id = latestRecognitionIdRef.current;
    if (id) dispatch({ type: 'rejectRecognition', id });
    latestRecognitionIdRef.current = null;
  }, [dispatch]);

  const handlePatientSendText = useCallback(() => {
    if (!patientText.trim()) return;
    dispatch({
      type: 'add',
      message: {
        id: createId('msg'),
        party: 'deaf_user',
        source: 'typed',
        text: patientText.trim(),
      },
    });
    setPatientText('');
    setPatientTypeOpen(false);
  }, [patientText, dispatch]);

  /* ---------------------------------------------------------------------------------
   * Doctor input -> phrase match -> conversation
   * ------------------------------------------------------------------------------- */

  const asr = useAsr({
    language: settings.asrLanguage,
    onLanguageChange: (language) => update('asrLanguage', language),
  });

  const sendDoctorMessage = useCallback(
    (text: string, phraseArg?: Phrase) => {
      const match = phraseArg
        ? { matched: true, phrase: phraseArg, method: 'exact' as const, candidates: [] }
        : PHRASE_MATCHER.match(text, { includeUnverified: true });

      const phrase = phraseArg ?? (match.matched ? match.phrase : null);
      const availability = phrase ? clipAvailability(phrase) : null;
      const mode = availability === 'verified_clip' ? 'isl_clip' : 'text_only';

      dispatch({
        type: 'add',
        message: {
          id: createId('msg'),
          party: 'hearing_user',
          source: phraseArg ? 'phrase_board' : 'speech_recognition',
          text,
          delivery: {
            mode,
            ...(phrase ? { phraseId: phrase.id, clipStatus: phrase.validation.status } : {}),
          },
        },
      });

      // The match is reflected in the message's own delivery badge; the note text was
      // previously computed but never rendered, so it is dropped rather than carried.
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
          id: createId('msg'),
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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      {/* Page Header matching wireframe */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#292D38]">
            Conversation
          </h1>
          <p className="mt-1 text-sm sm:text-base font-medium text-[#71856A]">
            Patient ↔ Doctor · Two-way communication
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Session active pill */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#71856A]/30 bg-[#E3EADF] px-3.5 py-1.5 text-xs font-semibold text-[#3F5745]">
            <span className="h-2 w-2 rounded-full bg-[#596F57] animate-pulse" />
            <span>Session active</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={state.hidden ? 'eye' : 'eye-off'}
            onClick={() => dispatch({ type: 'setHidden', hidden: !state.hidden })}
            aria-pressed={state.hidden}
            className="rounded-xl border-[#D8CFBA] bg-[#FAF6EE] text-[#292D38] hover:bg-[#F4EFEA]"
          >
            {state.hidden ? 'Show' : 'Hide'}
          </Button>

          <Button
            variant="danger"
            size="sm"
            icon="stop"
            onClick={() => setConfirmEnd(true)}
            className="rounded-xl"
          >
            End conversation
          </Button>
        </div>
      </div>

      {/* Subtle status badges */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="neutral" icon="list">
          {state.messages.length} message{state.messages.length === 1 ? '' : 's'}
        </Badge>
        {unreviewed > 0 ? (
          <Badge tone="warning" icon="alert">
            {unreviewed} sign{unreviewed === 1 ? '' : 's'} not yet confirmed
          </Badge>
        ) : null}
        <Badge tone="neutral" icon="lock">
          Private · On-device only
        </Badge>
      </div>

      {/* Two Main Communication Panels */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-start">
        {/* Left Panel: Patient */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#D8CFBA] bg-[#FAF6EE]/90 p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-lg text-[#292D38]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E3EADF] text-[#3F5745]">
                  <Icon name="hand" size="1.15rem" />
                </div>
                <span>Patient</span>
              </div>

              {recognition.camera === 'streaming' ||
              recognition.camera === 'paused' ||
              recognition.preparing ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#596F57]">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        recognition.camera === 'streaming'
                          ? 'bg-[#596F57] animate-pulse'
                          : 'bg-[#C77D60] animate-pulse',
                      )}
                    />
                    {recognition.camera === 'streaming'
                      ? 'Camera Live'
                      : recognition.preparing
                        ? 'Starting…'
                        : 'Camera Paused'}
                  </span>
                  <Button
                    size="sm"
                    variant="danger"
                    icon="camera-off"
                    onClick={() => recognition.stop()}
                    className="!py-1 !px-2.5 text-xs rounded-xl"
                  >
                    Stop camera
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Camera Preview / Video Feed */}
            <CameraPanel
              recognition={recognition}
              onConfirm={handleConfirmSign}
              onCorrect={handleCorrectSign}
              onReject={handleRejectSign}
              onOpenPhraseBoard={() => setPhraseDrawerOpen(true)}
              layout="workspace"
            />

            {/* Speak Controls for Patient if composed words exist */}
            {composedText ? (
              <div className="rounded-2xl border border-[#D8CFBA]/70 bg-[#F4EFEA]/80 p-3">
                <SpeakControls
                  speaker={speaker}
                  text={composedText}
                  label="Speak recognized signing"
                  showLanguageSelector={false}
                  onSpoken={() => {
                    for (const message of state.messages) {
                      if (message.party === 'deaf_user') {
                        dispatch({ type: 'markSpoken', id: message.id, spoken: true });
                      }
                    }
                  }}
                />
              </div>
            ) : null}

            {/* Collapsible Patient Type Fallback */}
            {patientTypeOpen ? (
              <div className="rounded-2xl border border-[#D8CFBA] bg-[#FAF6EE] p-3 space-y-2">
                <p className="text-xs font-semibold text-[#71856A]">Type a message:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={patientText}
                    onChange={(e) => setPatientText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePatientSendText();
                    }}
                    placeholder="Type what you want to say…"
                    className="flex-1 rounded-xl border border-[#D8CFBA] bg-white px-3 py-2 text-sm text-[#292D38] focus:outline-none focus:ring-2 focus:ring-[#596F57]/40"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handlePatientSendText}
                    disabled={!patientText.trim()}
                    className="!bg-[#596F57] text-white rounded-xl px-4"
                  >
                    Send
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Patient Card Footer matching wireframe */}
          <div className="mt-5 pt-3 border-t border-[#D8CFBA]/60 flex flex-wrap items-center justify-between gap-2 text-xs text-[#71856A]">
            <span className="font-medium">Sign · Type · Select phrase</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPatientTypeOpen((prev) => !prev)}
                className="font-semibold text-[#596F57] hover:underline cursor-pointer"
              >
                {patientTypeOpen ? 'Close type' : 'Type fallback'}
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setPhraseDrawerOpen(true)}
                className="font-semibold text-[#596F57] hover:underline cursor-pointer"
              >
                Phrase board
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Doctor */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#D8CFBA] bg-[#FAF6EE]/90 p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-lg text-[#292D38]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F7E5DE] text-[#C77D60]">
                  <Icon name="stethoscope" size="1.15rem" />
                </div>
                <span>Doctor</span>
              </div>

              {asr.listening ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#C77D60]">
                  <span className="h-2 w-2 rounded-full bg-[#C77D60] animate-pulse" />
                  Mic Listening
                </span>
              ) : null}
            </div>

            {/* Doctor Panel Component */}
            <DoctorPanel
              onSendMessage={sendDoctorMessage}
              onOpenPhraseBoard={() => setPhraseDrawerOpen(true)}
              asr={asr}
            />
          </div>

          {/* Doctor Card Footer matching wireframe */}
          <div className="mt-5 pt-3 border-t border-[#D8CFBA]/60 flex flex-wrap items-center justify-between gap-2 text-xs text-[#71856A]">
            <span className="font-medium">Select · Preview · Play animation</span>
            <button
              type="button"
              onClick={() => setPhraseDrawerOpen(true)}
              className="font-semibold text-[#596F57] hover:underline cursor-pointer"
            >
              All hospital phrases
            </button>
          </div>
        </div>
      </div>

      {/* Shared Conversation Transcript below */}
      <div className="rounded-3xl border border-[#D8CFBA] bg-[#FAF6EE]/90 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#292D38]">Shared conversation</h2>
            <span className="text-xs font-medium text-muted">
              ({state.messages.length} message{state.messages.length === 1 ? '' : 's'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#D8CFBA] bg-[#E7E2D6] px-2.5 py-1 text-xs font-semibold text-[#596F57]">
              Transcript
            </span>
            {state.messages.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                onClick={() => dispatch({ type: 'clear' })}
                className="text-xs"
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {/* Conversation Feed */}
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

        {/* Turn Indicator */}
        <TurnIndicator
          activeParty={state.activeParty}
          cameraActive={recognition.camera === 'streaming'}
          micActive={asr.listening}
          className="rounded-xl border border-[#D8CFBA]/60 bg-[#F4EFEA]/80"
        />
      </div>

      {/* Hospital phrase board sheet */}
      <Dialog
        open={phraseDrawerOpen}
        onClose={() => setPhraseDrawerOpen(false)}
        variant="sheet"
        title="Hospital phrase board"
        description="Pick a phrase to speak or present in the conversation."
        className="sm:max-w-4xl"
        footer={
          <Button
            variant="secondary"
            block
            icon="arrow-left"
            onClick={() => setPhraseDrawerOpen(false)}
          >
            Back to conversation
          </Button>
        }
      >
        <PhraseBoard
          showUnverified={settings.showUnverifiedPhrases}
          speaker={speaker}
          onAddToConversation={(phrase) => {
            addPhraseToConversation(phrase);
            setPhraseDrawerOpen(false);
          }}
        />
      </Dialog>

      {/* Correction sheet for sign recognition */}
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

      {/* End conversation dialog */}
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
        description="Everything in this conversation is deleted from memory. SignSpeak never stores it anywhere else, so it cannot be recovered."
        confirmLabel="End and delete"
        destructive
      >
        <p className="text-muted">
          {state.messages.length} message{state.messages.length === 1 ? '' : 's'} will be removed.
          The camera and microphone will also stop.
        </p>
      </ConfirmDialog>

      {/* Replay clip dialog if triggered from transcript */}
      {activeClip ? (
        <Dialog
          open={true}
          onClose={() => setActiveClip(null)}
          title={`ISL Video: “${activeClip.textEn}”`}
        >
          <div className="space-y-3 p-2">
            <ClipPlayer phrase={activeClip} autoPlay={true} />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

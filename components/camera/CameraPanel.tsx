'use client';

/**
 * Camera and sign-recognition panel (docs/ui-ux-specification.md §3.3).
 *
 * Responsibilities:
 *   - request the camera only after an explicit button press, with the reason stated first;
 *   - show a live preview with a restrained overlay: hairline status chips, a medical-blue
 *     top-match meter and a hand skeleton drawn on a canvas from the same landmarks the
 *     classifier consumes (no separate landmark extraction);
 *   - show tracking status, FPS and a low-performance warning;
 *   - surface an accepted chip with Confirm / Not this / Delete;
 *   - show "Not recognised" with an actionable hint, never a guessed word;
 *   - offer one-tap pause, and a working alternative in every failure state.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
import { RangeField, ToggleField } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Panel } from '@/components/ui/Surface';
import { EmptyState, PermissionState } from '@/components/common/PermissionState';
import { RecognitionChip } from '@/components/camera/RecognitionChip';
import { TrackingIndicator } from '@/components/camera/TrackingIndicator';
import { useSettings } from '@/lib/state/settings';
import { config } from '@/lib/config';
import { glossLabel } from '@/lib/signs/vocabulary';
import type { AcceptedSign, UseSignRecognitionResult } from '@/lib/vision/use-sign-recognition';
import { cn } from '@/lib/utils/cn';

/* ------------------------------------------------------------------------------------
 * Overlay chrome
 * ---------------------------------------------------------------------------------- */

/**
 * One status readout in the overlay header, e.g. `HANDS 2/2`.
 *
 * The label and the value are real text, so the meaning survives greyscale, colour-vision
 * deficiency and a screen reader; the dot only speeds up scanning
 * (docs/ui-ux-specification.md §1 — never colour alone). Decorative only: it is not a
 * live region, because the readouts change several times a second and a screen reader
 * must not narrate them.
 *
 * Sizing is deliberately fixed `px`, not `rem`: the preview is locked to a 4:3 box, so chrome
 * that grew with the in-app text-size setting was clipped by `overflow-hidden` (measured
 * 107 px past the bottom edge at the largest setting, Settings > Text size > Extra large).
 * Line boxes come out fixed for free, because the body's line-height is unitless and
 * multiplies these `px` font sizes.
 *
 * So a readout is a picture of a state, not the only copy of it: the camera status is also in
 * the header pill, the slow-FPS warning in the callout below, and the hand count in the
 * tracking status under the preview — all in `rem`-scaled text.
 */
function OverlayReadout({
  label,
  value,
  tone = 'idle',
}: {
  label: string;
  value: string;
  tone?: 'idle' | 'live' | 'warn';
}) {
  const dot =
    tone === 'live'
      ? 'bg-primary shadow-[0_0_6px_rgb(var(--ss-primary))]'
      : tone === 'warn'
        ? 'bg-warning shadow-[0_0_6px_rgb(var(--ss-warning))]'
        : 'bg-ink-faint';

  return (
    <span className="overlay-chip inline-flex items-center gap-[5px] rounded-md px-[7px] py-[4px]">
      <span aria-hidden="true" className={cn('h-[6px] w-[6px] shrink-0 rounded-full', dot)} />
      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#a9b6cb]">
        {label}
      </span>
      <span className="font-mono text-[11px] font-semibold tabular-nums text-white">{value}</span>
    </span>
  );
}

export interface CameraPanelProps {
  recognition: UseSignRecognitionResult;
  onConfirm: (sign: AcceptedSign) => void;
  onCorrect: (sign: AcceptedSign) => void;
  onReject: (sign: AcceptedSign) => void;
  onOpenPhraseBoard: () => void;
  onSendFingerspelledSentence?: (text: string) => void;
  layout?: 'standard' | 'workspace';
  className?: string;
}

export function CameraPanel({
  recognition,
  onConfirm,
  onCorrect,
  onReject,
  onOpenPhraseBoard,
  onSendFingerspelledSentence,
  layout = 'workspace',
  className,
}: CameraPanelProps) {
  const { settings, update } = useSettings();
  const [permissionExplained, setPermissionExplained] = useState(false);
  // Overlay appearance. Deliberately component state rather than settings: these are per-sitting
  // viewing adjustments, and none of them change what is analysed, stored or sent anywhere.
  const [feedOpacity, setFeedOpacity] = useState(0.8);
  const [strokeWeight, setStrokeWeight] = useState(1);

  // Fingerspelling word assembler state
  const [spelledText, setSpelledText] = useState('');
  const [autoAddLetters, setAutoAddLetters] = useState(true);
  const lastAcceptedLetterRef = useRef<string | null>(null);

  const {
    camera,
    tracking,
    fps,
    lowFps,
    handCount,
    latestAccepted,
    detectedGesture,
    cameraFailure,
    landmarkerFailure,
    modelUnavailable,
    modelError,
    preparing,
    replaying,
    simulateOcclusion,
    setSimulateOcclusion,
    landmarkCompleteness,
    videoRef,
    overlayCanvasRef,
    start,
    pause,
    resume,
    stop,
    clearLatestAccepted,
    suggestPhraseBoard,
    dismissPhraseBoardSuggestion,
    setStrokeWeight: setOverlayStrokeWeight,
    current,
    rejectionHint,
  } = recognition;

  const active = camera === 'streaming' || camera === 'paused';
  // FR-STT-04 asks for a visible confidence level plus the numeric value. The band
  // (High / Medium / Low) carries the meaning without colour; the percentage is shown
  // alongside it so the user can judge how close a call the prediction was.
  const showNumeric = true;

  const activeCandidate = useMemo(() => {
    if (handCount === 0) return null;
    if (current?.accepted && current.label !== 'Not recognised' && current.label !== 'OTHER') {
      return {
        label: current.label,
        probability: current.probability,
        accepted: true,
      };
    }
    const candidate = current?.top3?.find(
      (c) => c.label !== 'OTHER' && c.label !== 'Not recognised' && c.probability >= 0.15,
    );
    if (candidate) {
      return {
        label: candidate.label,
        probability: candidate.probability,
        accepted: false,
      };
    }
    return null;
  }, [current, handCount]);

  const guideVisible = camera === 'streaming' && handCount === 0 && !replaying;

  useEffect(() => {
    if (recognition.mode !== 'alphabet' || !latestAccepted) return;
    const letter = latestAccepted.label;
    if (autoAddLetters && letter !== lastAcceptedLetterRef.current) {
      lastAcceptedLetterRef.current = letter;
      setSpelledText((prev) => prev + letter);
    }
  }, [latestAccepted, recognition.mode, autoAddLetters]);

  useEffect(() => {
    if (handCount === 0) {
      lastAcceptedLetterRef.current = null;
    }
  }, [handCount]);

  /* ---------------------------------------------------------------------------------
   * Failure states — always with a route forward.
   * ------------------------------------------------------------------------------- */

  if (cameraFailure) {
    return (
      <div className={className}>
        <PermissionState
          icon="camera-off"
          tone={cameraFailure.status === 'denied' ? 'danger' : 'warning'}
          title={cameraFailure.title}
          cause={cameraFailure.cause}
          fix={cameraFailure.fix}
          onRetry={cameraFailure.retryable ? () => void start() : undefined}
          retryLabel="Try camera again"
          alternatives={[
            {
              label: 'Use the phrase board',
              icon: 'list',
              onClick: onOpenPhraseBoard,
            },
          ]}
        >
          <div className="w-full rounded-xl bg-raised p-3 text-sm">
            <p className="font-semibold">What still works without the camera</p>
            <ul className="mt-1.5 space-y-1 text-muted">
              <li className="flex gap-2">
                <Icon name="check" size="1rem" className="mt-1 text-accent" />
                The hospital phrase board and Emergency mode
              </li>
              <li className="flex gap-2">
                <Icon name="check" size="1rem" className="mt-1 text-accent" />
                Speech-to-text, typing and text-to-speech
              </li>
            </ul>
          </div>
        </PermissionState>
      </div>
    );
  }

  if (landmarkerFailure) {
    return (
      <div className={className}>
        <PermissionState
          icon="hand"
          tone="warning"
          title={landmarkerFailure.title}
          cause={landmarkerFailure.cause}
          fix={landmarkerFailure.fix}
          onRetry={landmarkerFailure.retryable ? () => void start() : undefined}
          alternatives={[{ label: 'Use the phrase board', icon: 'list', onClick: onOpenPhraseBoard }]}
        >
          {landmarkerFailure.technical ? (
            <details className="w-full rounded-xl bg-raised p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Technical detail</summary>
              <p className="mt-1.5 break-words font-mono text-xs text-muted">
                {landmarkerFailure.technical}
              </p>
            </details>
          ) : null}
        </PermissionState>
      </div>
    );
  }

  /* ---------------------------------------------------------------------------------
   * Mode switcher & Fingerspelling assembler
   * ------------------------------------------------------------------------------- */

  const modeSwitcher = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D8CFBA] bg-[#FAF6EE] p-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => recognition.setMode('words')}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
            recognition.mode === 'words'
              ? 'bg-[#596F57] text-white shadow-sm'
              : 'text-[#596F57] hover:bg-[#EAE5D9]',
          )}
        >
          <Icon name="message-square" size="14px" />
          <span>Words & Signs (8)</span>
        </button>
        <button
          type="button"
          onClick={() => recognition.setMode('alphabet')}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
            recognition.mode === 'alphabet'
              ? 'bg-[#596F57] text-white shadow-sm'
              : 'text-[#596F57] hover:bg-[#EAE5D9]',
          )}
        >
          <span className="font-mono text-xs font-bold">🔤</span>
          <span>Fingerspelling (A–Z)</span>
        </button>
      </div>
      <span className="text-[11px] font-medium text-muted px-1">
        {recognition.mode === 'words'
          ? 'Clinical words & wave greeting'
          : 'Fingerspell names & custom sentences'}
      </span>
    </div>
  );

  const fingerspellingAssembler = (
    <div className="rounded-2xl border-2 border-[#596F57]/40 bg-[#FAF6EE] p-4 text-[#2D402B] shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8CFBA]/60 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#596F57] text-white font-mono text-2xl font-bold shadow">
            {latestAccepted ? latestAccepted.label : activeCandidate ? activeCandidate.label : '—'}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#2D402B]">
                {latestAccepted
                  ? `Detected Letter: ${latestAccepted.label}`
                  : activeCandidate
                    ? `Candidate: ${activeCandidate.label}`
                    : active
                      ? 'Sign any letter with one hand (A–Z)'
                      : 'Start camera to recognise letters from signing'}
              </span>
              {latestAccepted ? (
                <Badge tone="success">
                  {Math.round(latestAccepted.probability * 100)}% Match
                </Badge>
              ) : activeCandidate ? (
                <Badge tone="neutral">
                  {Math.round(activeCandidate.probability * 100)}%
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-[#71856A]">
              ISL Single-Hand Alphabet · A through Z
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#596F57] font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoAddLetters}
              onChange={(e) => setAutoAddLetters(e.target.checked)}
              className="rounded border-[#D8CFBA] text-[#596F57] focus:ring-[#596F57]"
            />
            Auto-add letter
          </label>
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            disabled={!latestAccepted && !activeCandidate}
            onClick={() => {
              const l = latestAccepted?.label ?? activeCandidate?.label;
              if (l) {
                setSpelledText((prev) => prev + l);
                clearLatestAccepted();
              }
            }}
          >
            Add {latestAccepted?.label ?? activeCandidate?.label ?? 'Letter'}
          </Button>
        </div>
      </div>

      {/* Word Buffer Display */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[#71856A] font-semibold">
          <span>Spelled Word / Name Buffer:</span>
          <span>
            {spelledText.length} character{spelledText.length === 1 ? '' : 's'}
          </span>
        </div>
        <input
          type="text"
          value={spelledText}
          onChange={(e) => setSpelledText(e.target.value.toUpperCase())}
          placeholder="Spell letters using signs or type here (e.g. BISMEET)..."
          className="w-full rounded-xl border border-[#D8CFBA] bg-white px-3 py-2 font-mono text-xl font-bold tracking-wider text-[#2D402B] outline-none focus:border-[#596F57] shadow-inner"
        />

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSpelledText((prev) => prev + ' ')}
          >
            ␣ Space
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={spelledText.length === 0}
            onClick={() => setSpelledText((prev) => prev.slice(0, -1))}
          >
            ⌫ Backspace
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={spelledText.length === 0}
            onClick={() => setSpelledText('')}
          >
            ✕ Clear
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={spelledText.trim().length === 0}
              onClick={() => {
                const raw = spelledText.trim();
                const capitalized = raw
                  .split(' ')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join(' ');
                const nameSentence = `My name is ${capitalized}`;
                onSendFingerspelledSentence?.(nameSentence);
                setSpelledText('');
              }}
              className="bg-[#596F57] hover:bg-[#485c46] text-white font-medium"
            >
              👤 Send: &quot;My name is {spelledText.trim() ? spelledText.trim() : '...'}&quot;
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={spelledText.trim().length === 0}
              onClick={() => {
                onSendFingerspelledSentence?.(spelledText.trim());
                setSpelledText('');
              }}
            >
              Send Word
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------------------------
   * Not started
   * ------------------------------------------------------------------------------- */

  if (!active) {
    if (layout === 'workspace') {
      return (
        <div className={cn('space-y-4', className)}>
          {modeSwitcher}

          {/* Wireframe camera preview box matching media_1789848449713.png */}
          <div className="relative flex aspect-4/3 min-h-[260px] w-full flex-col items-center justify-center rounded-2xl border border-[#D8CFBA] bg-[#E7E2D6] p-6 text-center text-[#292D38]">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F4EFEA]/80 text-[#596F57] shadow-xs">
              <Icon name="camera" size="1.75rem" />
            </div>
            <h3 className="text-base font-semibold text-[#292D38]">Camera preview</h3>
            <p className="mt-1 text-sm text-[#71856A]">
              {recognition.mode === 'words'
                ? 'Patient signs here'
                : 'Patient fingerspells letters (A–Z) here'}
            </p>
          </div>

          {recognition.mode === 'alphabet' ? fingerspellingAssembler : null}

          {modelUnavailable ? (
            <Callout tone="warning" icon="alert" title="Sign recognition is not available in this build">
              <p>{modelError}</p>
            </Callout>
          ) : null}

          {preparing ? (
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="lg"
                loading
                className="flex-1 !bg-[#596F57] text-white py-3 font-semibold rounded-xl"
              >
                Starting camera…
              </Button>
              <Button
                variant="danger"
                size="lg"
                icon="x"
                onClick={stop}
                className="py-3 px-4 rounded-xl"
                aria-label="Cancel starting camera"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                setPermissionExplained(true);
                void start();
              }}
              className="!bg-[#596F57] hover:!bg-[#475b45] text-white py-3 font-semibold rounded-xl"
            >
              Start camera
            </Button>
          )}

          {permissionExplained && preparing ? (
            <p className="text-center text-xs text-muted" role="status">
              Loading the on-device hand-tracking model…
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <div className={className}>
        <Panel padding="md" className="space-y-4">
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Icon name="camera" size="1.3rem" className="text-primary" />
              Sign recognition
            </h3>
            <p className="text-pretty text-muted">
              Point the camera at your hands and hold a supported sign. Hand positions are
              analysed on this device. Video is not recorded, stored or uploaded.
            </p>
          </div>

          <Callout tone="neutral" icon="lock" title="Camera permission is only requested when you press Start">
            Your browser will ask for permission. Nothing opens before you press the button, and
            you can pause the camera at any time.
          </Callout>

          {modelUnavailable ? (
            <Callout tone="warning" icon="alert" title="Sign recognition is not available in this build">
              <p>{modelError}</p>
              <p className="mt-2">
                You can still start the camera to see the live preview and hand tracking. The
                phrase board, Emergency mode, typing and speech all work fully.
              </p>
            </Callout>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon="camera"
              size="lg"
              loading={preparing}
              onClick={() => {
                setPermissionExplained(true);
                void start();
              }}
            >
              {preparing ? 'Starting…' : 'Start camera'}
            </Button>
            {preparing ? (
              <Button variant="danger" size="lg" icon="x" onClick={stop}>
                Cancel
              </Button>
            ) : null}
            <Button variant="secondary" size="lg" icon="list" onClick={onOpenPhraseBoard}>
              Use phrase board instead
            </Button>
          </div>

          {permissionExplained && preparing ? (
            <p className="text-sm text-muted" role="status">
              Loading the on-device hand-tracking model. This happens once per session.
            </p>
          ) : null}
        </Panel>
      </div>
    );
  }

  /* ---------------------------------------------------------------------------------
   * Active
   * ------------------------------------------------------------------------------- */

  return (
    <div className={cn('space-y-3', className)}>
      {/* Mode Switcher: Words vs Fingerspelling */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D8CFBA] bg-[#FAF6EE] p-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => recognition.setMode('words')}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
              recognition.mode === 'words'
                ? 'bg-[#596F57] text-white shadow-sm'
                : 'text-[#596F57] hover:bg-[#EAE5D9]',
            )}
          >
            <Icon name="message-square" size="14px" />
            <span>Words & Signs (8)</span>
          </button>
          <button
            type="button"
            onClick={() => recognition.setMode('alphabet')}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
              recognition.mode === 'alphabet'
                ? 'bg-[#596F57] text-white shadow-sm'
                : 'text-[#596F57] hover:bg-[#EAE5D9]',
            )}
          >
            <span className="font-mono text-xs font-bold">🔤</span>
            <span>Fingerspelling (A–Z)</span>
          </button>
        </div>
        <span className="text-[11px] font-medium text-muted px-1">
          {recognition.mode === 'words'
            ? 'Clinical words & wave greeting'
            : 'Fingerspell names & custom sentences'}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-black aspect-camera">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label={
            replaying
              ? 'Recorded landmark replay preview'
              : 'Live camera preview used for hand tracking. No video is recorded.'
          }
          // Mirror the preview so the user sees themselves naturally. The canvas is NOT
          // flipped: `drawHandOverlay` mirrors the normalised x itself, and a CSS flip
          // here as well would land the skeleton on the wrong hand.
          className="h-full w-full scale-x-[-1] object-cover transition-opacity duration-200"
          style={{ opacity: camera === 'paused' ? feedOpacity * 0.2 : feedOpacity }}
        />
        {/* The overlay bitmap is sized by the hook to `videoWidth` x `videoHeight`, and
            `object-cover` crops it exactly like the video above, so a landmark at (x, y)
            lands on the same pixel of the preview at any viewport size. */}
        <canvas
          ref={overlayCanvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />

        {camera === 'paused' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/85 text-center text-ink">
            <Icon name="pause" size="2rem" />
            <p className="text-lg font-semibold tracking-tight">Camera paused</p>
            <p className="max-w-xs text-sm text-muted">
              No frames are being analysed. Press Resume to continue.
            </p>
          </div>
        ) : null}

        {/* Overlay chrome, painted above the preview and the guide banner.
            `pointer-events-none` because everything in here is a readout: a decorative layer
            must never intercept a tap. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div className="flex flex-col gap-[6px] bg-gradient-to-b from-bg/90 to-transparent p-[8px] sm:p-[10px]">
            {replaying ? (
              <p className="flex items-center gap-2 rounded-lg bg-warning-solid px-2.5 py-1.5 text-xs font-semibold text-warning-ink sm:text-sm">
                <Icon name="info" size="1rem" />
                Recorded landmarks, live model — this is a demo replay, not a live camera.
              </p>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-[6px]">
              <div className="overlay-chip rounded-md px-[9px] py-[5px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                  SignSpeak
                </p>
                <p className="mt-[2px] font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-[#a9b6cb]">
                  {replaying
                    ? 'Landmark replay'
                    : simulateOcclusion
                      ? 'Occlusion simulation'
                      : 'On-device hand tracking (159D)'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-[5px]">
                <OverlayReadout
                  label="Cam"
                  value={camera === 'streaming' ? 'Live' : camera === 'paused' ? 'Paused' : 'Off'}
                  tone={camera === 'streaming' ? 'live' : camera === 'paused' ? 'warn' : 'idle'}
                />
                <OverlayReadout
                  label="Hands"
                  value={`${handCount}/2`}
                  tone={handCount > 0 ? 'live' : 'idle'}
                />
                <OverlayReadout
                  label="Pose"
                  value={simulateOcclusion ? 'Occluded' : handCount > 0 ? '21 pts' : 'Searching'}
                  tone={simulateOcclusion ? 'warn' : handCount > 0 ? 'live' : 'idle'}
                />
                <OverlayReadout label="Rate" value={`${fps} FPS`} tone={lowFps ? 'warn' : 'live'} />
                {settings.showLandmarkOverlay ? (
                  <OverlayReadout label="Points" value="On" tone="live" />
                ) : null}
              </div>
            </div>

            {/* Live Sign / Letter / Gesture / Guide pill. Displayed directly on video preview so signer has immediate feedback */}
            {recognition.mode === 'alphabet' ? (
              latestAccepted && handCount > 0 ? (
                <p className="overlay-chip self-start inline-flex items-center gap-2 rounded-full bg-[#596F57] border border-white/20 px-[12px] py-[4px] text-[12px] font-bold leading-[16px] text-white shadow-md">
                  <span>🔤 Letter:</span>
                  <span className="font-mono text-base font-black text-white">{latestAccepted.label}</span>
                  <span className="text-[11px] text-white/80">({Math.round(latestAccepted.probability * 100)}%)</span>
                </p>
              ) : activeCandidate && handCount > 0 ? (
                <div className="overlay-chip self-start inline-flex items-center gap-2 rounded-full bg-black/75 border border-white/20 px-[12px] py-[4px] text-[12px] font-semibold leading-[16px] text-white shadow-md backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span>
                    Letter: <strong className="font-mono text-sm">{activeCandidate.label}</strong> ({Math.round(activeCandidate.probability * 100)}%)
                  </span>
                </div>
              ) : guideVisible || handCount === 0 ? (
                <p className="overlay-chip self-start rounded-full px-[10px] py-[4px] text-[11px] font-medium leading-[15px] text-white">
                  Hold hand in frame to spell letters (A–Z)
                </p>
              ) : null
            ) : latestAccepted && handCount > 0 ? (
              <p className="overlay-chip self-start inline-flex items-center gap-1.5 rounded-full bg-[#596F57] border border-white/20 px-[12px] py-[4px] text-[12px] font-bold leading-[16px] text-white shadow-md">
                <span>✅ Recognised:</span>
                <span className="capitalize">{glossLabel(latestAccepted.label)}</span>
              </p>
            ) : activeCandidate && handCount > 0 ? (
              <div className="overlay-chip self-start inline-flex items-center gap-2 rounded-full bg-black/75 border border-white/20 px-[12px] py-[4px] text-[12px] font-semibold leading-[16px] text-white shadow-md backdrop-blur-sm">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    activeCandidate.accepted ? 'bg-success' : 'bg-primary animate-pulse',
                  )}
                />
                <span>
                  {activeCandidate.accepted
                    ? `Recognised: ${glossLabel(activeCandidate.label)}`
                    : `Analysing: ${glossLabel(activeCandidate.label)} (${Math.round(activeCandidate.probability * 100)}%)`}
                </span>
                {!activeCandidate.accepted && (
                  <div className="h-1.5 w-10 overflow-hidden rounded-full bg-white/20">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-150',
                        activeCandidate.probability >= 0.38 ? 'bg-[#596F57]' : 'bg-primary',
                      )}
                      style={{
                        width: `${Math.min(100, Math.round((activeCandidate.probability / 0.38) * 100))}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ) : detectedGesture && handCount > 0 ? (
              <p className="overlay-chip self-start rounded-full bg-[#596F57] border border-white/20 px-[12px] py-[4px] text-[12px] font-bold leading-[16px] text-white shadow-md">
                👋 {detectedGesture.label} (Wave detected)
              </p>
            ) : guideVisible || handCount === 0 ? (
              <p className="overlay-chip self-start rounded-full px-[10px] py-[4px] text-[11px] font-medium leading-[15px] text-white">
                Hold hands inside frame to sign
              </p>
            ) : null}
          </div>

          {/* Pinned `px` spacing for the same reason as the header above, plus a fixed-size
              tracking pill with `whitespace-nowrap`: the previous rem-sized pill and its
              `flex-wrap` row grew to 159 px inside a 236 px viewport and lost both pills off
              the bottom edge at Extra large text. */}
          <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[6px] bg-gradient-to-t from-bg/90 to-transparent p-[8px] sm:p-[10px]">
            {/* Decorative: the same status is announced by the in-flow indicator under the
                preview, which also scales with the text-size setting. */}
            <TrackingIndicator
              tracking={tracking}
              camera={camera}
              handCount={handCount}
              variant="fixed"
              decorative
            />
            {/* Landmark telemetry pill — honest technical status instead of speculative match % */}
            <span
              className={cn(
                'overlay-chip inline-flex min-w-0 items-center gap-[6px] rounded-full px-[9px] py-[4px]',
                simulateOcclusion && 'border-warning/50 text-warning',
              )}
              title={
                simulateOcclusion
                  ? 'Simulated keypoint occlusion active — fail-safe engaged'
                  : 'Clean landmark input: 21 keypoints extracted per hand'
              }
            >
              <span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#a9b6cb]">
                {simulateOcclusion ? 'Occlusion' : 'Landmarks'}
              </span>
              <span
                aria-hidden="true"
                className="overlay-meter-track h-[6px] w-[40px] shrink-0 overflow-hidden rounded-full"
              >
                <span
                  className={cn(
                    'overlay-meter block h-full rounded-full transition-all duration-300',
                    simulateOcclusion ? 'bg-warning' : 'bg-primary',
                  )}
                  style={{ width: `${Math.round(landmarkCompleteness * 100)}%` }}
                />
              </span>
              <span className="font-mono text-[11px] font-semibold tabular-nums text-white">
                {simulateOcclusion ? '11/21 (Sim)' : handCount > 0 ? '21/21' : '0/21'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Tracking status in normal flow, at the user's text size, and the only copy a screen
          reader announces. The overlay copy above is fixed `px` because the 4:3 viewport cannot
          grow with the text-size setting, so this is what a low-vision user actually reads
          when the label changes. */}
      <div>
        <TrackingIndicator tracking={tracking} camera={camera} handCount={handCount} />
      </div>

      {/* Overlay controls. Deliberately below the viewport, so nothing ever covers the hands
          or the recognition area. */}
      <Panel padding="sm" className="ss-bordered rounded-2xl bg-surface">
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Overlay controls
        </p>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <RangeField
            label="Feed opacity"
            hint="Dims the camera picture so the skeleton reads clearly. Tracking is unaffected either way."
            value={Math.round(feedOpacity * 100)}
            min={10}
            max={100}
            step={5}
            format={(value) => `${value}%`}
            onChange={(value) => setFeedOpacity(value / 100)}
            className="min-w-[12rem] flex-1"
          />
          <RangeField
            label="Skeleton weight"
            hint="Thickness and background halo of the outline drawn over each tracked hand."
            value={strokeWeight}
            min={0}
            max={2.5}
            step={0.1}
            format={(value) => `${value.toFixed(1)}×`}
            onChange={(value) => {
              setStrokeWeight(value);
              setOverlayStrokeWeight(value);
            }}
            className="min-w-[12rem] flex-1"
          />
          <ToggleField
            label="Landmark points"
            description="Adds a dot on every tracked joint and a marker on each shoulder, over the hand skeleton. The same switch as Settings > Show hand landmarks."
            checked={settings.showLandmarkOverlay}
            onChange={(checked) => update('showLandmarkOverlay', checked)}
            className="min-w-[15rem] flex-1"
          />
          <ToggleField
            label="Simulate landmark occlusion"
            description="Developer demo: simulates missing keypoints / partial occlusion. Engages the fail-safe to withhold recognition on insufficient landmark input."
            checked={simulateOcclusion}
            onChange={setSimulateOcclusion}
            className="min-w-[15rem] flex-1"
          />
        </div>
      </Panel>

      {lowFps ? (
        <Callout tone="warning" icon="alert" title="Running slowly">
          Hand tracking is below {config.lowFpsThreshold} frames per second, which makes signs
          harder to hold steady. Close other apps or tabs, and try better lighting.
        </Callout>
      ) : null}

      {modelUnavailable || modelError ? (
        <Callout tone="warning" icon="alert" title="Recognition is off, tracking is on">
          {modelError ?? 'No sign-recognition model is installed in this build.'} You can still see
          the hand-tracking preview. Use the phrase board to communicate.
        </Callout>
      ) : null}

      {/* Wave gesture visual confirmation badge */}
      {detectedGesture ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#596F57]/40 bg-[#E3EADF] p-4 text-[#2D402B] shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#596F57]/20 text-2xl">
              👋
            </span>
            <div>
              <p className="font-bold text-base text-[#2D402B]">
                {detectedGesture.label}
              </p>
              <p className="text-xs text-[#596F57]">
                Wave gesture recognised &middot; Greeting sent to conversation
              </p>
            </div>
          </div>
          <Badge tone="success" icon="hand">
            Wave detected
          </Badge>
        </div>
      ) : null}

      {/* Recognition feedback: Fingerspelling Assembler in alphabet mode, RecognitionChip in words mode */}
      {recognition.mode === 'alphabet' ? (
        fingerspellingAssembler
      ) : latestAccepted ? (
        <RecognitionChip
          sign={latestAccepted}
          showNumericConfidence={showNumeric}
          onConfirm={() => {
            onConfirm(latestAccepted);
            clearLatestAccepted();
          }}
          onCorrect={() => {
            onCorrect(latestAccepted);
            clearLatestAccepted();
          }}
          onReject={() => {
            onReject(latestAccepted);
            clearLatestAccepted();
          }}
        />
      ) : (
        <div
          className={cn(
            'ss-bordered rounded-2xl p-4 transition-colors',
            simulateOcclusion ? 'border-warning/50 bg-warning-soft/30' : 'bg-raised',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-2 text-base font-semibold text-ink">
              <Icon
                name={simulateOcclusion ? 'alert' : 'info'}
                size="1.25rem"
                className={simulateOcclusion ? 'text-warning' : 'text-primary'}
              />
              {simulateOcclusion
                ? 'Insufficient landmark input — Occlusion detected (Simulation)'
                : modelUnavailable || modelError
                  ? 'Sign recognition offline'
                  : handCount === 0
                    ? 'Ready to recognise signs'
                    : activeCandidate
                      ? activeCandidate.accepted
                        ? `Recognised: ${glossLabel(activeCandidate.label)}`
                        : `Analysing: ${glossLabel(activeCandidate.label)} (${Math.round(activeCandidate.probability * 100)}%)`
                      : `Tracking ${handCount} ${handCount === 1 ? 'hand' : 'hands'}`}
            </span>
            <div className="flex items-center gap-2">
              {simulateOcclusion ? (
                <>
                  <Badge tone="warning" icon="alert">
                    Occlusion Simulation
                  </Badge>
                  <Badge tone="neutral">Fail-safe Engaged</Badge>
                </>
              ) : modelUnavailable || modelError ? (
                <Badge tone="warning" icon="alert">
                  Model Offline
                </Badge>
              ) : handCount === 0 ? (
                <>
                  <Badge tone="success" icon="check">
                    ISL Model Active (8 Signs)
                  </Badge>
                  <Badge tone="neutral">159D ONNX</Badge>
                </>
              ) : activeCandidate?.accepted ? (
                <>
                  <Badge tone="success" icon="check">
                    Recognised
                  </Badge>
                  <Badge tone="neutral">Confirmed</Badge>
                </>
              ) : activeCandidate ? (
                <>
                  <Badge tone="primary" icon="hand">
                    Analysing
                  </Badge>
                  <Badge tone="neutral">Hold steady</Badge>
                </>
              ) : (
                <>
                  <Badge tone="success" icon="check">
                    Live Tracking
                  </Badge>
                  <Badge tone="neutral">159D Active</Badge>
                </>
              )}
            </div>
          </div>

          <p className="mt-2 text-pretty text-sm text-muted">
            {simulateOcclusion
              ? 'Fail-safe active: recognition is withheld due to incomplete hand pose tracking (simulated keypoint dropout/occlusion). Demonstrates fail-safe behavior; no trained occlusion reconstruction is claimed.'
              : modelUnavailable || modelError
                ? (modelError ?? 'Sign recognition model is unavailable.')
                : handCount === 0
                  ? 'Place your hands in the camera frame to sign (Help, Water, Yes, No, Hello, Thank you, Hospital, Drink) or wave for Hello 👋.'
                  : activeCandidate
                    ? activeCandidate.accepted
                      ? `Confirmed sign "${glossLabel(activeCandidate.label)}". Dispatched to conversation.`
                      : `Matching sign "${glossLabel(activeCandidate.label)}" with ${Math.round(activeCandidate.probability * 100)}% match. Hold steady to confirm.`
                    : (rejectionHint ?? 'Tracking hand landmarks. Hold your sign clearly to recognise.')}
          </p>

          {activeCandidate && !activeCandidate.accepted && (
            <div className="mt-2.5 w-full">
              <div className="flex items-center justify-between text-xs text-muted mb-1 font-medium">
                <span>Confidence: {Math.round(activeCandidate.probability * 100)}%</span>
                <span>Threshold: 38%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-150',
                    activeCandidate.probability >= 0.38 ? 'bg-[#596F57]' : 'bg-primary',
                  )}
                  style={{ width: `${Math.min(100, Math.round((activeCandidate.probability / 0.38) * 100))}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-xs text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  simulateOcclusion
                    ? 'bg-warning animate-pulse'
                    : handCount > 0
                      ? 'bg-success'
                      : 'bg-ink-faint',
                )}
              />
              <span>
                Input:{' '}
                {simulateOcclusion
                  ? '11/21 keypoints (Occluded)'
                  : handCount > 0
                    ? `${landmarkCompleteness >= 0.95 ? '21/21' : `${Math.round(landmarkCompleteness * 21)}/21`} keypoints (Clean)`
                    : '0 keypoints'}
              </span>
            </span>
            <span>·</span>
            <span>159D Feature Vector: {handCount > 0 ? 'Extracted' : 'Idle'}</span>
            <span>·</span>
            <span>Inference: On-device WASM (sign-clf-v1)</span>
          </div>
        </div>
      )}

      {suggestPhraseBoard ? (
        <Callout
          tone="primary"
          icon="list"
          title="Signing not getting through?"
          actions={
            <>
              <Button size="sm" variant="primary" icon="list" onClick={onOpenPhraseBoard}>
                Open phrase board
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissPhraseBoardSuggestion}>
                Keep trying
              </Button>
            </>
          }
        >
          Two attempts in a row were not recognised. The phrase board works with one hand and needs
          no camera at all.
        </Callout>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {camera === 'paused' ? (
          <Button variant="primary" icon="play" onClick={resume}>
            Resume camera
          </Button>
        ) : (
          <Button variant="secondary" icon="pause" onClick={pause}>
            Pause camera
          </Button>
        )}
        <Button variant="danger" icon="camera-off" onClick={stop}>
          Stop camera
        </Button>
        <Button variant="ghost" icon="list" onClick={onOpenPhraseBoard}>
          Phrase board
        </Button>
        <span className="ms-auto self-center">
          <Badge tone="neutral" icon="lock">
            On-device only
          </Badge>
        </span>
      </div>
    </div>
  );
}

/** Shown in place of the camera panel on screens where it is not the current tab. */
export function CameraPanelPlaceholder({ onStart }: { onStart: () => void }) {
  return (
    <EmptyState
      icon="camera"
      title="Camera is off"
      description="Start the camera to recognise signs, or switch to the phrase board."
    >
      <Button variant="primary" icon="camera" onClick={onStart}>
        Go to the camera
      </Button>
    </EmptyState>
  );
}

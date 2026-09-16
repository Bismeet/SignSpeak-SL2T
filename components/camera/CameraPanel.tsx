'use client';

/**
 * Camera and sign-recognition panel (docs/ui-ux-specification.md §3.3).
 *
 * Responsibilities:
 *   - request the camera only after an explicit button press, with the reason stated first;
 *   - show a live preview with an optional landmark overlay (off by default);
 *   - show tracking status, FPS and a low-performance warning;
 *   - surface an accepted chip with Confirm / Not this / Delete;
 *   - show "Not recognised" with an actionable hint, never a guessed word;
 *   - offer one-tap pause, and a working alternative in every failure state.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, ConfidenceBadge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
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

export interface CameraPanelProps {
  recognition: UseSignRecognitionResult;
  onConfirm: (sign: AcceptedSign) => void;
  onCorrect: (sign: AcceptedSign) => void;
  onReject: (sign: AcceptedSign) => void;
  onOpenPhraseBoard: () => void;
  className?: string;
}

export function CameraPanel({
  recognition,
  onConfirm,
  onCorrect,
  onReject,
  onOpenPhraseBoard,
  className,
}: CameraPanelProps) {
  const { settings } = useSettings();
  const [permissionExplained, setPermissionExplained] = useState(false);

  const {
    camera,
    tracking,
    fps,
    lowFps,
    handCount,
    current,
    rejectionHint,
    latestAccepted,
    cameraFailure,
    landmarkerFailure,
    modelUnavailable,
    modelError,
    preparing,
    replaying,
    videoRef,
    overlayCanvasRef,
    start,
    pause,
    resume,
    stop,
    clearLatestAccepted,
    suggestPhraseBoard,
    dismissPhraseBoardSuggestion,
  } = recognition;

  const active = camera === 'streaming' || camera === 'paused';
  // FR-STT-04 asks for a visible confidence level plus the numeric value. The band
  // (High / Medium / Low) carries the meaning without colour; the percentage is shown
  // alongside it so the user can judge how close a call the prediction was.
  const showNumeric = true;

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
   * Not started
   * ------------------------------------------------------------------------------- */

  if (!active) {
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
      <div className="relative overflow-hidden rounded-2xl border border-line bg-ink/90 aspect-camera">
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
          className={cn(
            'h-full w-full object-cover',
            // Mirror the preview so the user sees themselves naturally. The overlay
            // canvas applies the same mirroring so landmarks line up.
            'scale-x-[-1]',
            camera === 'paused' && 'opacity-15',
          )}
        />
        <canvas
          ref={overlayCanvasRef}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 h-full w-full scale-x-[-1]',
            !settings.showLandmarkOverlay && 'hidden',
          )}
        />

        {camera === 'paused' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 text-center text-white">
            <Icon name="pause" size="2rem" />
            <p className="text-lg font-semibold">Camera paused</p>
            <p className="max-w-xs text-sm opacity-90">
              No frames are being analysed. Press Resume to continue.
            </p>
          </div>
        ) : null}

        {replaying ? (
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-warning px-3 py-2 text-sm font-semibold text-warning-ink">
            <Icon name="info" size="1rem" />
            Recorded landmarks, live model — this is a demo replay, not a live camera.
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-ink/80 to-transparent p-3">
          <TrackingIndicator tracking={tracking} camera={camera} handCount={handCount} />
          <span className="rounded-full bg-ink/70 px-2.5 py-1 text-xs font-semibold text-white">
            {fps} FPS
          </span>
          {settings.showLandmarkOverlay ? (
            <span className="rounded-full bg-ink/70 px-2.5 py-1 text-xs font-semibold text-white">
              Landmarks shown
            </span>
          ) : null}
        </div>
      </div>

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

      {/* Accepted chip, awaiting review. */}
      {latestAccepted ? (
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
        <div className="ss-bordered rounded-2xl bg-raised p-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-2 text-lg font-semibold text-muted">
              <Icon name="question" size="1.3rem" />
              Not recognised
            </span>
            {current && !current.accepted && current.top3.length > 0 && current.top3[0] ? (
              <ConfidenceBadge
                band="low"
                probability={current.top3[0].probability}
                showNumeric={showNumeric}
              />
            ) : null}
          </div>
          <p className="mt-2 text-pretty text-sm text-muted">
            {rejectionHint ??
              'Hold a supported sign steady in the middle of the frame. No word is emitted when the model is unsure.'}
          </p>
          {current && !current.accepted && current.top3.length > 0 ? (
            <p className="mt-2 text-sm text-muted">
              Closest matches were{' '}
              {current.top3
                .slice(0, 3)
                .map((entry) => `${glossLabel(entry.label)} (${(entry.probability * 100).toFixed(0)}%)`)
                .join(', ')}
              . None reached the confidence threshold, so nothing was added.
            </p>
          ) : null}
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
        <Button variant="ghost" icon="camera-off" onClick={stop}>
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

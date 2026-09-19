'use client';

/**
 * Landmark data-collection tool (docs/ai-ml-and-dataset-plan.md §3).
 *
 * This is the tool that makes a real recognition model possible. It records **landmark
 * feature vectors only** — never video, never images — together with the pseudonymous
 * metadata the training pipeline needs for group splits and robustness slices.
 *
 * Deliberate constraints:
 *   - a consent acknowledgement is required before the Record button unlocks;
 *   - the signer id is free text that the operator chooses; the tool never asks for a
 *     name, and the app itself stores nothing;
 *   - hearing team members are tagged `learner` so their samples can be excluded from the
 *     test set (risk R20);
 *   - frames with no hands are counted and dropped rather than recorded as noise;
 *   - export is a local file download; nothing is uploaded.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SelectField, TextField, ToggleField } from '@/components/ui/Field';
import { Card, Panel, SectionHeading } from '@/components/ui/Surface';
import { EmptyState, PermissionState } from '@/components/common/PermissionState';
import { useDeviceStatus } from '@/lib/state/device-status';
import { SignLandmarker, isLandmarkerFailure, type LandmarkerFailure } from '@/lib/vision/landmarker';
import { describeCameraError, startCamera, stopStream, type CameraFailure } from '@/lib/vision/camera';
import { FEATURE_LAYOUT_DESCRIPTION, extractFeatureVector } from '@/lib/vision/features';
import { SIGN_VOCABULARY, SIGN_VOCABULARY_VERSION } from '@/lib/signs/vocabulary';
import { FEATURE_VERSION, type CollectedSample } from '@/lib/types';
import { APP_VERSION, config } from '@/lib/config';
import { createId, downloadCsv, downloadJson } from '@/lib/utils/misc';
import { cn } from '@/lib/utils/cn';

type RecorderStatus = 'idle' | 'preparing' | 'ready' | 'recording' | 'error';

const RECORD_DURATION_MS = 2000;
/** 15 FPS for 2 seconds, matching the plan's static-sign window. */
const TARGET_FPS = 15;

interface ConditionState {
  lighting: 'bright' | 'dim' | 'mixed';
  background: 'plain' | 'cluttered';
  distance: 'near' | 'medium' | 'far';
  pose: 'sitting' | 'standing' | 'lying';
  handedness: 'left' | 'right' | 'both';
}

const DEFAULT_CONDITIONS: ConditionState = {
  lighting: 'bright',
  background: 'plain',
  distance: 'medium',
  pose: 'sitting',
  handedness: 'both',
};

export function CollectionTool() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<SignLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<number[][]>([]);
  const recordingRef = useRef(false);
  const droppedRef = useRef(0);
  const startedAtRef = useRef(0);
  /**
   * `loop` is created once (its identity must stay stable so the animation frame chain is
   * never broken), so it cannot close over the latest `finishRecording`. Routing through a
   * ref keeps the recorded sample's label and conditions current instead of stale.
   */
  const finishRecordingRef = useRef<() => void>(() => {});

  const { setCamera } = useDeviceStatus();
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [cameraFailure, setCameraFailure] = useState<CameraFailure | null>(null);
  const [landmarkerFailure, setLandmarkerFailure] = useState<LandmarkerFailure | null>(null);
  const [liveHands, setLiveHands] = useState(0);
  const [bufferCount, setBufferCount] = useState(0);
  const [dropped, setDropped] = useState(0);

  const [consent, setConsent] = useState(false);
  const [signerId, setSignerId] = useState('');
  const [signerType, setSignerType] = useState<'fluent' | 'learner'>('fluent');
  const [session, setSession] = useState(`session-${new Date().toISOString().slice(0, 10)}`);
  const [label, setLabel] = useState(SIGN_VOCABULARY[0]?.gloss ?? 'PAIN');
  const [conditions, setConditions] = useState<ConditionState>(DEFAULT_CONDITIONS);
  const [samples, setSamples] = useState<CollectedSample[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const vocabularyOptions = useMemo(
    () =>
      SIGN_VOCABULARY.map((sign) => ({
        value: sign.gloss,
        label: `${sign.label} (${sign.gloss}) — ${sign.tier === 'must' ? 'Must tier' : 'Should tier'}`,
      })),
    [],
  );

  const perLabelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sample of samples) counts[sample.label] = (counts[sample.label] ?? 0) + 1;
    return counts;
  }, [samples]);

  /* ---------------------------------------------------------------------------------
   * Camera lifecycle
   * ------------------------------------------------------------------------------- */

  const stopAll = useCallback(() => {
    recordingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    setStatus('idle');
    setLiveHands(0);
  }, []);

  // Publish the recorder's camera state to the shared header pill
  // (docs/ui-ux-specification.md §4). Without this the header claims "Camera off" while this
  // screen is streaming, which is the one thing the pill exists to prevent.
  useEffect(() => {
    setCamera(
      status === 'ready' || status === 'recording'
        ? 'streaming'
        : status === 'preparing'
          ? 'requesting'
          : status === 'error'
            ? (cameraFailure?.status ?? 'error')
            : 'idle',
    );
  }, [cameraFailure, setCamera, status]);

  useEffect(() => () => setCamera('idle'), [setCamera]);

  const drawOverlay = useCallback((hands: Array<{ landmarks: Array<{ x: number; y: number }> }>) => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.fillStyle = 'rgba(96, 226, 148, 0.95)';
    for (const hand of hands) {
      for (const landmark of hand.landmarks) {
        context.beginPath();
        context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 3.4, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }, []);

  const loop = useCallback(
    (timestamp: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      let frame;
      try {
        frame = landmarker.detect(video, timestamp);
      } catch {
        return;
      }

      setLiveHands(frame.hands.length);
      drawOverlay(frame.hands);

      if (!recordingRef.current) return;

      if (timestamp - startedAtRef.current > RECORD_DURATION_MS) {
        recordingRef.current = false;
        finishRecordingRef.current();
        return;
      }

      const features = extractFeatureVector(frame);
      if (features.handCount === 0) {
        // A frame with no hands is noise, not a sample. Count it so the operator can see
        // that the recording was poor and redo it.
        droppedRef.current += 1;
        setDropped(droppedRef.current);
        return;
      }
      bufferRef.current.push(Array.from(features.vector));
      setBufferCount(bufferRef.current.length);
    },
    [drawOverlay],
  );

  const startCameraAndTracker = useCallback(async () => {
    setStatus('preparing');
    setCameraFailure(null);
    setLandmarkerFailure(null);

    try {
      const landmarker = await SignLandmarker.create({
        assets: {
          wasmBasePath: config.mediapipeWasmPath,
          handModelPath: config.handModelUrl,
          poseModelPath: config.poseModelUrl,
        },
      });
      landmarkerRef.current = landmarker;
    } catch (error) {
      setStatus('error');
      if (isLandmarkerFailure(error)) setLandmarkerFailure(error);
      return;
    }

    const result = await startCamera({ width: 640, height: 480 });
    if (!result.ok) {
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setCameraFailure(result.failure);
      setStatus('error');
      return;
    }

    streamRef.current = result.stream;
    if (videoRef.current) {
      videoRef.current.srcObject = result.stream;
      try {
        await videoRef.current.play();
      } catch {
        /* the preview starts on the next user gesture */
      }
    }

    setStatus('ready');
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => () => stopAll(), [stopAll]);

  /* ---------------------------------------------------------------------------------
   * Recording
   * ------------------------------------------------------------------------------- */

  const finishRecording = useCallback(() => {
    const features = bufferRef.current;
    const droppedCount = droppedRef.current;

    if (features.length < Math.floor(TARGET_FPS * 0.6)) {
      setStatusMessage(
        `Only ${features.length} usable frames were captured${droppedCount > 0 ? ` (${droppedCount} dropped because no hand was visible)` : ''}. Hold the sign for the whole two seconds and try again.`,
      );
      bufferRef.current = [];
      droppedRef.current = 0;
      setBufferCount(0);
      setDropped(0);
      setStatus('ready');
      return;
    }

    const sample: CollectedSample = {
      id: createId('sample'),
      signerId: signerId.trim() || 'unnamed',
      signerType,
      label,
      session,
      capturedAt: new Date().toISOString(),
      conditions: { ...conditions },
      toolVersion: `${APP_VERSION}/${FEATURE_VERSION}/${SIGN_VOCABULARY_VERSION}`,
      frameCount: features.length,
      features,
    };

    setSamples((previous) => [...previous, sample]);
    setStatusMessage(
      `Saved ${features.length} frames for ${label}${droppedCount > 0 ? ` (${droppedCount} frames dropped where no hand was visible)` : ''}.`,
    );
    bufferRef.current = [];
    droppedRef.current = 0;
    setBufferCount(0);
    setDropped(0);
    setStatus('ready');
  }, [conditions, label, session, signerId, signerType]);

  // Keep the stable animation loop pointed at the newest handler.
  finishRecordingRef.current = finishRecording;

  function beginRecording() {
    if (status !== 'ready') return;
    bufferRef.current = [];
    droppedRef.current = 0;
    setBufferCount(0);
    setDropped(0);
    setStatusMessage(null);
    startedAtRef.current = performance.now();
    recordingRef.current = true;
    setStatus('recording');
  }

  /* ---------------------------------------------------------------------------------
   * Export
   * ------------------------------------------------------------------------------- */

  function exportJson() {
    downloadJson(`signspeak-landmarks-${session || 'session'}-${Date.now()}.json`, {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      featureVersion: FEATURE_VERSION,
      vocabularyVersion: SIGN_VOCABULARY_VERSION,
      toolVersion: APP_VERSION,
      notice:
        'Landmark feature vectors only. No images, video or audio. Collected with written consent; signer ids are pseudonymous.',
      featureLayout: FEATURE_LAYOUT_DESCRIPTION,
      sampleCount: samples.length,
      samples,
    });
  }

  function exportCsv() {
    const header = [
      'sample_id',
      'signer_id',
      'signer_type',
      'label',
      'session',
      'captured_at',
      'lighting',
      'background',
      'distance',
      'pose',
      'handedness',
      'frame_count',
      ...Array.from({ length: 159 }, (_, index) => `f${index}`),
    ];
    const rows: Array<Array<string | number>> = [header];
    for (const sample of samples) {
      for (let frame = 0; frame < sample.features.length; frame += 1) {
        rows.push([
          `${sample.id}_${frame}`,
          sample.signerId,
          sample.signerType,
          sample.label,
          sample.session,
          sample.capturedAt,
          sample.conditions.lighting,
          sample.conditions.background,
          sample.conditions.distance,
          sample.conditions.pose,
          sample.conditions.handedness,
          sample.frameCount,
          ...(sample.features[frame] ?? []),
        ]);
      }
    }
    downloadCsv(`signspeak-landmarks-${session || 'session'}-${Date.now()}.csv`, rows);
  }

  /* ---------------------------------------------------------------------------------
   * Render
   * ------------------------------------------------------------------------------- */

  const consentBlocked = !consent;

  return (
    <div className="space-y-5">
      <Callout tone="danger" icon="alert" title="Read before recording anyone" assertive>
        <ul className="space-y-2">
          <li>
            Only record a person who has signed the written consent form, and who has had the
            purpose explained in a language and modality they understand — including the ISL video
            version of the form for deaf participants.
          </li>
          <li>
            This tool records <strong>hand-landmark numbers only</strong>. It never records video or
            images. If you need video, that requires separate explicit consent and offline encrypted
            storage, and it is outside this tool.
          </li>
          <li>
            Use a pseudonymous signer id. Never enter a real name, phone number or anything that
            identifies the person.
          </li>
          <li>Do not record children.</li>
          <li>
            Participants may withdraw at any time. Deleting their samples is straightforward because
            each sample carries the signer id.
          </li>
        </ul>
      </Callout>

      <ToggleField
        label="I have the participant’s written consent and I am recording landmarks only"
        description="This unlocks recording. It is a deliberate speed bump, not a formality."
        checked={consent}
        onChange={setConsent}
      />

      {/* Signer and conditions */}
      <Card elevation="flat">
        <Panel padding="md" className="space-y-4">
          <SectionHeading level={2} title="Session details" icon="user" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Pseudonymous signer id"
              value={signerId}
              onChange={(event) => setSignerId(event.target.value)}
              placeholder="e.g. signer-a3"
              hint="Any consistent code. Keep the mapping to the consent form offline, never here."
              required
            />
            <SelectField
              label="Signer type"
              value={signerType}
              onChange={(event) => setSignerType(event.target.value as 'fluent' | 'learner')}
              options={[
                { value: 'fluent', label: 'Fluent ISL user (valid for the test set)' },
                { value: 'learner', label: 'Hearing learner — excluded from the test set' },
              ]}
              hint="Risk R20: learner samples must be excluded from evaluation, so they are tagged."
            />
            <TextField
              label="Session tag"
              value={session}
              onChange={(event) => setSession(event.target.value)}
              hint="Groups samples recorded together, so a signer’s sessions never leak across splits."
            />
            <SelectField
              label="Sign being recorded"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              options={vocabularyOptions}
              hint="The canonical ISL form must have been confirmed by an ISL signer first."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Lighting"
              value={conditions.lighting}
              onChange={(event) =>
                setConditions((previous) => ({
                  ...previous,
                  lighting: event.target.value as ConditionState['lighting'],
                }))
              }
              options={[
                { value: 'bright', label: 'Bright' },
                { value: 'dim', label: 'Dim' },
                { value: 'mixed', label: 'Mixed / backlit' },
              ]}
            />
            <SelectField
              label="Background"
              value={conditions.background}
              onChange={(event) =>
                setConditions((previous) => ({
                  ...previous,
                  background: event.target.value as ConditionState['background'],
                }))
              }
              options={[
                { value: 'plain', label: 'Plain' },
                { value: 'cluttered', label: 'Cluttered' },
              ]}
            />
            <SelectField
              label="Camera distance"
              value={conditions.distance}
              onChange={(event) =>
                setConditions((previous) => ({
                  ...previous,
                  distance: event.target.value as ConditionState['distance'],
                }))
              }
              options={[
                { value: 'near', label: 'Near' },
                { value: 'medium', label: 'Medium' },
                { value: 'far', label: 'Far' },
              ]}
            />
            <SelectField
              label="Body pose"
              value={conditions.pose}
              onChange={(event) =>
                setConditions((previous) => ({
                  ...previous,
                  pose: event.target.value as ConditionState['pose'],
                }))
              }
              options={[
                { value: 'sitting', label: 'Sitting' },
                { value: 'standing', label: 'Standing' },
                { value: 'lying', label: 'Lying down' },
              ]}
              hint="The plan requires two poses per signer; lying down is the hospital-relevant case."
            />
            <SelectField
              label="Handedness"
              value={conditions.handedness}
              onChange={(event) =>
                setConditions((previous) => ({
                  ...previous,
                  handedness: event.target.value as ConditionState['handedness'],
                }))
              }
              options={[
                { value: 'right', label: 'Right hand' },
                { value: 'left', label: 'Left hand' },
                { value: 'both', label: 'Both hands' },
              ]}
            />
          </div>
        </Panel>
      </Card>

      {/* Camera and recording */}
      <Card elevation="flat">
        <Panel padding="md" className="space-y-4">
          <SectionHeading
            level={2}
            title="Recording"
            icon="camera"
            description="Two seconds of frames per sample. Frames where no hand is visible are dropped and counted."
          />

          {cameraFailure ? (
            <PermissionState
              icon="camera-off"
              tone="danger"
              title={cameraFailure.title}
              cause={cameraFailure.cause}
              fix={cameraFailure.fix}
              onRetry={cameraFailure.retryable ? () => void startCameraAndTracker() : undefined}
            />
          ) : landmarkerFailure ? (
            <PermissionState
              icon="hand"
              tone="warning"
              title={landmarkerFailure.title}
              cause={landmarkerFailure.cause}
              fix={landmarkerFailure.fix}
              onRetry={landmarkerFailure.retryable ? () => void startCameraAndTracker() : undefined}
            />
          ) : status === 'idle' || status === 'error' || status === 'preparing' ? (
            <div className="space-y-3">
              <p className="text-pretty text-muted">
                Start the camera to see the live landmark overlay. The overlay is shown here on
                purpose: it is how the operator spots a sample where tracking failed.
              </p>
              <Button
                variant="primary"
                icon="camera"
                loading={status === 'preparing'}
                disabled={status === 'preparing'}
                onClick={() => void startCameraAndTracker()}
              >
                {status === 'preparing' ? 'Starting…' : 'Start camera'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border border-line bg-black aspect-camera">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  aria-label="Camera preview with landmark overlay for data collection"
                  className="h-full w-full scale-x-[-1] object-cover"
                />
                <canvas
                  ref={overlayRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full scale-x-[-1]"
                />
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-ink/80 to-transparent p-3">
                  <Badge tone={liveHands > 0 ? 'success' : 'warning'} icon="hand">
                    {liveHands === 0 ? 'No hand visible' : `${liveHands} hand${liveHands === 1 ? '' : 's'} tracked`}
                  </Badge>
                  {status === 'recording' ? (
                    <Badge tone="danger" icon="clock">
                      Recording… {bufferCount} frames
                    </Badge>
                  ) : null}
                  {dropped > 0 ? (
                    <Badge tone="neutral" icon="alert">
                      {dropped} frames dropped
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  icon="play"
                  disabled={consentBlocked || status !== 'ready'}
                  onClick={beginRecording}
                >
                  Record 2 seconds
                </Button>
                <Button variant="secondary" icon="camera-off" onClick={stopAll}>
                  Stop camera
                </Button>
              </div>

              {consentBlocked ? (
                <p className="text-sm font-medium text-warning">
                  Recording is locked until the consent box above is ticked.
                </p>
              ) : null}
            </div>
          )}

          {statusMessage ? (
            <Callout tone="neutral" icon="info">
              {statusMessage}
            </Callout>
          ) : null}
        </Panel>
      </Card>

      {/* Collected samples */}
      <Card elevation="flat">
        <Panel padding="md" className="space-y-4">
          <SectionHeading
            level={2}
            title="Collected samples"
            icon="download"
            actions={
              <Badge tone={samples.length > 0 ? 'success' : 'neutral'} icon="list">
                {samples.length} sample{samples.length === 1 ? '' : 's'}
              </Badge>
            }
          />

          {samples.length === 0 ? (
            <EmptyState
              icon="download"
              title="No samples recorded yet"
              description="Record two seconds per repetition. The plan targets at least 20 repetitions per static sign per signer, across at least six signers."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <caption className="sr-only">Samples recorded in this session, grouped by sign</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 pe-3 font-semibold">Sign</th>
                      <th scope="col" className="py-2 pe-3 font-semibold">Samples</th>
                      <th scope="col" className="py-2 font-semibold">Frames</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(perLabelCounts).map(([gloss, count]) => {
                      const frames = samples
                        .filter((sample) => sample.label === gloss)
                        .reduce((total, sample) => total + sample.frameCount, 0);
                      return (
                        <tr key={gloss} className="border-b border-line last:border-0">
                          <th scope="row" className="py-2.5 pe-3 font-medium">{gloss}</th>
                          <td className="py-2.5 pe-3">
                            <span className={cn(count >= 20 ? 'text-success' : 'text-warning')}>
                              {count}
                              {count >= 20 ? ' (target met)' : ' (target 20)'}
                            </span>
                          </td>
                          <td className="py-2.5">{frames}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon="download" onClick={exportJson}>
                  Export JSON
                </Button>
                <Button variant="secondary" icon="download" onClick={exportCsv}>
                  Export CSV
                </Button>
                <Button variant="danger" icon="trash" onClick={() => setSamples([])}>
                  Clear this session
                </Button>
              </div>

              <Callout tone="neutral" icon="lock" title="Nothing leaves this browser">
                Samples exist only in this tab’s memory until you export them. Exporting downloads a
                file; it does not upload anything. Store the exported files in team-controlled
                encrypted storage, never in the repository, unless participants consented to that
                specific use.
              </Callout>
            </>
          )}
        </Panel>
      </Card>

      {/* Feature contract */}
      <Card elevation="flat">
        <Panel padding="md" className="space-y-3">
          <SectionHeading
            level={2}
            title="What is recorded"
            icon="info"
            description={`Feature version ${FEATURE_VERSION} · vocabulary ${SIGN_VOCABULARY_VERSION} · 159 numbers per frame.`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <caption className="sr-only">Feature vector layout</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pe-3 font-semibold">Index range</th>
                  <th scope="col" className="py-2 font-semibold">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_LAYOUT_DESCRIPTION.map((row) => (
                  <tr key={row.range} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2 pe-3 font-mono text-xs">{row.range}</th>
                    <td className="py-2 text-muted">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">
            The same layout is implemented twice — once here in TypeScript
            (<code className="font-mono text-xs">lib/vision/features.ts</code>) and once in Python
            (<code className="font-mono text-xs">ml/signdata/features.py</code>) — and a parity test
            checks that both produce identical numbers. If they ever disagree, the build fails.
          </p>
        </Panel>
      </Card>

      <Callout tone="warning" icon="alert">
        Before collecting anything, an ISL signer must confirm which candidate signs are static,
        which are dynamic, and what the canonical form of each one is. Collecting data for an
        unconfirmed sign wastes participants’ time and produces a model that teaches the wrong form.
      </Callout>
    </div>
  );
}

export { describeCameraError };

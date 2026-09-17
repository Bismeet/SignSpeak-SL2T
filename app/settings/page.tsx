'use client';

/**
 * Settings and accessibility (docs/ui-ux-specification.md §3.7).
 *
 * Every control here is a real, wired setting — there are no decorative toggles. Each one
 * states in plain language what it changes and, where relevant, what it does *not* do
 * (for example: enabling the landmark log still stores no images).
 */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import {
  RadioGroup,
  RangeField,
  SelectField,
  ToggleField,
} from '@/components/ui/Field';
import { Card, Panel, SectionHeading, Stack } from '@/components/ui/Surface';
import { availabilitySummary, useModel } from '@/lib/state/model-provider';
import { metricLabels, notForRealUseCopy } from '@/lib/model/card';
import {
  TEXT_SCALE_LABEL,
  THEME_LABEL,
  useSettings,
} from '@/lib/state/settings';
import { SUPPORTED_SPEECH_LANGUAGES } from '@/lib/speech/capabilities';
import { useSpeaker } from '@/lib/speech/use-speaker';
import { hasInferenceBackend, config, APP_VERSION } from '@/lib/config';
import {
  clearLandmarkLog,
  countLandmarkSamples,
  exportLandmarkLog,
} from '@/lib/state/landmark-log';
import { downloadJson } from '@/lib/utils/misc';
import type { TextScale, ThemeChoice } from '@/lib/types';

export default function SettingsPage() {
  const { settings, update, patch, reset, hydrated } = useSettings();
  const { availability } = useModel();
  // The card's own splitKind decides whether the count is signers or recording groups.
  const settingsMetricCopy =
    availability.state === 'ready' ? metricLabels(availability.card) : null;
  const settingsMetricCount = settingsMetricCopy?.count.toLowerCase() ?? 'signers';
  const speaker = useSpeaker();
  const summary = availabilitySummary(availability);

  const [sampleCount, setSampleCount] = useState<number | null>(null);
  const [confirmClearLog, setConfirmClearLog] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refreshSampleCount = useCallback(async () => {
    setSampleCount(await countLandmarkSamples());
  }, []);

  useEffect(() => {
    void refreshSampleCount();
  }, [refreshSampleCount]);

  const voiceOptions = [
    { value: '', label: 'Automatic — best match for the language' },
    ...speaker.voices.map((voice) => ({
      value: voice.name,
      label: `${voice.name} (${voice.lang})${voice.exactMatch ? ' — exact match' : ''}${
        voice.localService ? ' · on-device' : ' · network voice'
      }`,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-5 sm:py-8">
      <SectionHeading
        level={1}
        title="Settings & accessibility"
        description="Everything here is stored in this browser only. Nothing is sent anywhere."
        icon="settings"
      />

      <Stack gap="lg" className="mt-5">
        {/* ---------------------------------------------------------------------------
         * Display and accessibility
         * ------------------------------------------------------------------------- */}
        <section aria-labelledby="display-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-5">
              <SectionHeading id="display-heading" level={2} title="Display and accessibility" icon="eye" />

              <RadioGroup<ThemeChoice>
                legend="Colour theme"
                hint="High contrast uses black text on white with thicker borders."
                value={settings.theme}
                onChange={(value) => update('theme', value)}
                options={[
                  { value: 'day', label: THEME_LABEL.day },
                  { value: 'dark', label: THEME_LABEL.dark },
                  { value: 'contrast', label: THEME_LABEL.contrast },
                ]}
              />

              <RadioGroup<TextScale>
                legend="Text size"
                hint="Changes the size of everything in the app, not just the conversation."
                value={settings.textScale}
                onChange={(value) => update('textScale', value)}
                options={[
                  { value: 'normal', label: TEXT_SCALE_LABEL.normal },
                  { value: 'large', label: TEXT_SCALE_LABEL.large },
                  { value: 'xlarge', label: TEXT_SCALE_LABEL.xlarge },
                ]}
              />

              <ToggleField
                label="Reduce motion"
                description="Turns off the fade and slide animations. The app also follows your operating system setting automatically."
                checked={settings.reduceMotion}
                onChange={(checked) => update('reduceMotion', checked)}
              />

              <ToggleField
                label="Show hand landmarks on the camera preview"
                description="Draws dots over detected hand and shoulder points. Useful for checking lighting and framing. Off by default for performance and because it looks like recording, which it is not."
                checked={settings.showLandmarkOverlay}
                onChange={(checked) => update('showLandmarkOverlay', checked)}
              />
            </Panel>
          </Card>
        </section>

        {/* ---------------------------------------------------------------------------
         * Speech
         * ------------------------------------------------------------------------- */}
        <section aria-labelledby="speech-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-5">
              <SectionHeading id="speech-heading" level={2} title="Speech" icon="speaker" />

              <ToggleField
                label="Speak recognised words automatically"
                description="When off, nothing is spoken until you press Speak. This is off by default so a misread sign is never announced to the room."
                checked={settings.autoSpeakRecognised}
                onChange={(checked) => update('autoSpeakRecognised', checked)}
                note={settings.autoSpeakRecognised ? 'Recognition results will be spoken immediately.' : undefined}
              />

              <SelectField
                label="Spoken language for text-to-speech"
                value={settings.ttsLanguage}
                onChange={(event) => update('ttsLanguage', event.target.value)}
                options={SUPPORTED_SPEECH_LANGUAGES.map((language) => ({
                  value: language.code,
                  label: `${language.label} (${language.code})`,
                }))}
                hint={
                  speaker.voices.length === 0
                    ? 'No voices detected yet. Voice availability depends on your operating system.'
                    : `${speaker.voices.length} voices available. ${speaker.voices.filter((voice) => voice.exactMatch).length} match the selected language.`
                }
              />

              <SelectField
                label="Voice"
                value={settings.ttsVoiceUri ?? ''}
                onChange={(event) => update('ttsVoiceUri', event.target.value || null)}
                options={voiceOptions}
                hint="“Automatic” picks the best voice installed for the selected language."
              />

              <RangeField
                label="Speaking rate"
                hint="Lower is slower and usually clearer on a noisy ward."
                value={settings.ttsRate}
                min={0.5}
                max={1.6}
                step={0.05}
                onChange={(value) => update('ttsRate', value)}
                format={(value) => `${value.toFixed(2)}×`}
              />

              <SelectField
                label="Speech recognition language"
                value={settings.asrLanguage}
                onChange={(event) => update('asrLanguage', event.target.value)}
                options={SUPPORTED_SPEECH_LANGUAGES.map((language) => ({
                  value: language.code,
                  label: `${language.label} — ${language.nativeLabel} (${language.code})`,
                }))}
                hint="The language the hearing person will speak in. Only these two are supported for now."
              />
            </Panel>
          </Card>
        </section>

        {/* ---------------------------------------------------------------------------
         * Recognition
         * ------------------------------------------------------------------------- */}
        <section aria-labelledby="recognition-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-5">
              <SectionHeading
                id="recognition-heading"
                level={2}
                title="Sign recognition"
                icon="hand"
                actions={<Badge tone={summary.tone === 'neutral' ? 'neutral' : summary.tone} icon="info">{summary.label}</Badge>}
              />

              <RadioGroup<'normal' | 'strict'>
                legend="How strict should recognition be?"
                hint="Strict means fewer wrong words and more “Not recognised”. Nothing is ever accepted below the threshold in either mode."
                value={settings.confidenceMode}
                onChange={(value) => update('confidenceMode', value)}
                options={[
                  {
                    value: 'normal',
                    label: 'Normal',
                    description: 'Accepts a sign at 70% confidence with a clear margin over the runner-up.',
                  },
                  {
                    value: 'strict',
                    label: 'Strict',
                    description: 'Requires 85% confidence, a wider margin and more consistent frames.',
                  },
                ]}
              />

              {availability.state === 'ready' ? (
                <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-raised p-4 text-sm sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="font-semibold text-muted">Model version</dt>
                    <dd>{availability.card.modelVersion}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-semibold text-muted">Signs</dt>
                    <dd>{availability.card.vocabulary.length}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-semibold text-muted">Trained on</dt>
                    <dd>{availability.card.trainedOn || '—'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-semibold text-muted">Data</dt>
                    <dd>
                      {availability.card.dataset.signerCount} {settingsMetricCount},{' '}
                      {availability.card.dataset.sampleCount} samples
                    </dd>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="font-semibold text-muted">Runtime</dt>
                    <dd>
                      {availability.runtime === 'backend'
                        ? 'Landmark-only inference server'
                        : 'On this device (ONNX Runtime Web)'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <Callout tone="warning" icon="alert" title={summary.label}>
                  {summary.detail}
                </Callout>
              )}

              {availability.state === 'ready' && availability.card.notForRealUse ? (
                <Callout
                  tone="danger"
                  icon="alert"
                  title={notForRealUseCopy(availability.card).title}
                  assertive
                >
                  {notForRealUseCopy(availability.card).detail}
                </Callout>
              ) : null}

              {availability.state === 'ready' && availability.card.limitations.length > 0 ? (
                <div className="rounded-2xl bg-raised p-4">
                  <p className="font-semibold">Known limitations of this model</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted">
                    {availability.card.limitations.map((limitation) => (
                      <li key={limitation} className="flex gap-2">
                        <Icon name="alert" size="1rem" className="mt-1 text-warning" />
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Panel>
          </Card>
        </section>

        {/* ---------------------------------------------------------------------------
         * Phrases
         * ------------------------------------------------------------------------- */}
        <section aria-labelledby="phrases-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-5">
              <SectionHeading id="phrases-heading" level={2} title="Phrases and ISL video" icon="video" />

              <ToggleField
                label="Show unverified phrases"
                description="Reveals draft phrases that no ISL signer has reviewed. They always carry a visible UNVERIFIED badge and are never described as verified ISL."
                checked={settings.showUnverifiedPhrases}
                onChange={(checked) => update('showUnverifiedPhrases', checked)}
                note={settings.showUnverifiedPhrases ? 'Draft content is currently visible in the phrase board.' : undefined}
              />
            </Panel>
          </Card>
        </section>

        {/* ---------------------------------------------------------------------------
         * Data and privacy
         * ------------------------------------------------------------------------- */}
        <section aria-labelledby="data-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-5">
              <SectionHeading id="data-heading" level={2} title="Data and privacy" icon="shield" />

              <Callout tone="success" icon="lock" title="Nothing is stored by default">
                SignSpeak keeps your conversation in this browser tab&apos;s memory only. It is deleted
                when you end the conversation, close the tab or reload the page. Camera frames and
                microphone audio are never recorded, stored or uploaded. The only exception is your
                browser&apos;s own speech recognition service, which may receive audio to turn it into
                text — see the Privacy page.
              </Callout>

              <RangeField
                label="Auto-clear the conversation after inactivity"
                hint="Useful on a shared ward tablet. Set to 0 to keep the conversation until you end it manually."
                value={settings.autoClearMinutes}
                min={0}
                max={60}
                step={5}
                onChange={(value) => update('autoClearMinutes', value)}
                format={(value) => (value === 0 ? 'Off — never auto-clear' : `${value} minutes`)}
              />

              <ToggleField
                label="Save correction examples on this device"
                description="When you correct a wrong prediction, SignSpeak can keep the hand-landmark numbers and the corrected word so the model can be improved later. Only landmark numbers are saved — never images, video, audio or your conversation."
                checked={settings.logLandmarksLocally}
                onChange={(checked) => update('logLandmarksLocally', checked)}
                note={
                  settings.logLandmarksLocally
                    ? 'Saving to this browser only. Nothing is uploaded.'
                    : undefined
                }
              />

              {settings.logLandmarksLocally ? (
                <div className="rounded-2xl bg-raised p-4">
                  <p className="font-semibold">
                    Saved samples:{' '}
                    {sampleCount === null ? 'checking…' : sampleCount}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      icon="download"
                      disabled={!sampleCount}
                      onClick={async () => {
                        const data = await exportLandmarkLog();
                        downloadJson(`signspeak-landmark-log-${Date.now()}.json`, data);
                        setStatus(`Exported ${data.sampleCount} samples as a JSON file.`);
                      }}
                    >
                      Export as JSON
                    </Button>
                    <Button
                      variant="danger"
                      icon="trash"
                      disabled={!sampleCount}
                      onClick={() => setConfirmClearLog(true)}
                    >
                      Delete all samples
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    The export feeds directly into <code className="font-mono text-xs">ml/scripts/import_corrections.py</code>.
                  </p>
                </div>
              ) : null}
            </Panel>
          </Card>
        </section>

        {/* ---------------------------------------------------------------------------
         * Advanced
         * ------------------------------------------------------------------------- */}
        <section aria-labelledby="advanced-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-5">
              <SectionHeading
                id="advanced-heading"
                level={2}
                title="Advanced and demo options"
                icon="sparkles"
              />

              <ToggleField
                label="Demo: replay recorded landmarks"
                description="Runs recorded landmark sequences through the real model and decision logic, instead of the camera. Used as the honest fallback in a live demo when the camera or lighting fails. A banner makes clear that the input is recorded, while the model is live."
                checked={settings.demoReplayLandmarks}
                onChange={(checked) => update('demoReplayLandmarks', checked)}
                note={
                  settings.demoReplayLandmarks
                    ? 'Replay is on. Start the camera panel to run the recorded fixtures.'
                    : undefined
                }
              />

              <ToggleField
                label="Use a landmark inference server"
                description={
                  hasInferenceBackend()
                    ? 'Sends the numeric hand-landmark vector to the configured server for scoring. Raw video is never sent. If the server is unreachable, SignSpeak automatically falls back to on-device recognition.'
                    : 'No inference server is configured in this build, so recognition always runs on this device. Set NEXT_PUBLIC_INFERENCE_BACKEND_URL to enable this option.'
                }
                checked={settings.useInferenceBackend}
                onChange={(checked) => update('useInferenceBackend', checked)}
                disabled={!hasInferenceBackend()}
              />

              <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-raised p-4 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="font-semibold text-muted">App version</dt>
                  <dd>{APP_VERSION}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold text-muted">Model file</dt>
                  <dd className="break-all font-mono text-xs">{config.modelUrl}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold text-muted">Inference server</dt>
                  <dd className="break-all font-mono text-xs">
                    {hasInferenceBackend() ? config.inferenceBackendUrl : 'not configured'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold text-muted">Emergency number shown</dt>
                  <dd>{config.emergencyNumber}</dd>
                </div>
              </dl>
            </Panel>
          </Card>
        </section>

        {/* ---------------------------------------------------------------------------
         * Reset
         * ------------------------------------------------------------------------- */}
        <section aria-labelledby="reset-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading id="reset-heading" level={2} title="Reset" icon="refresh" />
              <p className="text-muted">
                Restores every setting on this page to its default and clears the saved
                preferences from this browser. Your conversation is not stored, so there is
                nothing else to remove.
              </p>
              <Button variant="danger" icon="refresh" onClick={() => setConfirmReset(true)}>
                Reset all settings
              </Button>
              {!hydrated ? (
                <p className="text-sm text-muted" role="status">
                  Loading saved settings…
                </p>
              ) : null}
            </Panel>
          </Card>
        </section>

        {status ? (
          <Callout
            tone="success"
            icon="check"
            title="Done"
            actions={
              <Button size="sm" variant="ghost" icon="x" onClick={() => setStatus(null)}>
                Dismiss
              </Button>
            }
          >
            {status}
          </Callout>
        ) : null}
      </Stack>

      <ConfirmDialog
        open={confirmClearLog}
        onClose={() => setConfirmClearLog(false)}
        onConfirm={async () => {
          await clearLandmarkLog();
          await refreshSampleCount();
          setConfirmClearLog(false);
          setStatus('All saved landmark samples were deleted from this browser.');
        }}
        title="Delete all saved landmark samples?"
        description="This cannot be undone. The samples exist only in this browser, so there is no copy anywhere else."
        confirmLabel="Delete permanently"
        destructive
      >
        <p className="text-muted">
          {sampleCount ?? 0} sample{sampleCount === 1 ? '' : 's'} will be deleted. Export them first
          if you still need them for training.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          reset();
          patch({ theme: 'day', textScale: 'normal' });
          setConfirmReset(false);
          setStatus('All settings were restored to their defaults.');
        }}
        title="Reset all settings?"
        description="Every preference on this page returns to its default, including text size, theme and privacy options."
        confirmLabel="Reset everything"
        destructive
      >
        <p className="text-muted">
          The saved correction samples are not affected — delete those separately if you want them
          gone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

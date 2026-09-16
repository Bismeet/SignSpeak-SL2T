'use client';

/**
 * Privacy page (docs/privacy-and-safety.md).
 *
 * Written as a data table rather than prose, because the honest answer to "what happens to
 * my data" is a per-item table, and one row is genuinely different from the others: the
 * browser's own speech service. That row is called out separately rather than buried.
 */

import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Card, Panel, SectionHeading, Stack } from '@/components/ui/Surface';
import { config } from '@/lib/config';

interface DataRow {
  data: string;
  where: string;
  stored: string;
  transmitted: string;
  tone: 'success' | 'warning' | 'danger';
}

const DATA_ROWS: DataRow[] = [
  {
    data: 'Camera frames',
    where: 'In this browser tab, in memory',
    stored: 'Never',
    transmitted: 'Never',
    tone: 'success',
  },
  {
    data: 'Hand and pose landmarks',
    where: 'This device',
    stored: 'Never, unless you turn on the correction log',
    transmitted: 'Only if you turn on the optional inference server, and then only the numbers',
    tone: 'success',
  },
  {
    data: 'Recognised words and the conversation',
    where: 'This browser tab, in memory',
    stored: 'Deleted when you end the conversation or reload',
    transmitted: 'Never',
    tone: 'success',
  },
  {
    data: 'Microphone audio',
    where: 'Handled by your browser’s speech service',
    stored: 'Not by SignSpeak',
    transmitted: 'Yes — by your browser vendor, as described below',
    tone: 'danger',
  },
  {
    data: 'Speech transcripts',
    where: 'This browser tab, in memory',
    stored: 'Deleted when you end the conversation or reload',
    transmitted: 'Never',
    tone: 'success',
  },
  {
    data: 'Your settings',
    where: 'This browser’s local storage',
    stored: 'Yes, until you reset them',
    transmitted: 'Never',
    tone: 'success',
  },
  {
    data: 'Correction samples (opt-in only)',
    where: 'This browser’s IndexedDB',
    stored: 'Yes, until you export or delete them',
    transmitted: 'Never',
    tone: 'warning',
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-5 sm:py-8">
      <SectionHeading
        level={1}
        title="Privacy"
        description="What SignSpeak does with your camera, your microphone and your conversation — in plain language, with the one exception stated clearly."
        icon="shield"
      />

      <Stack gap="lg" className="mt-5">
        <Callout tone="success" icon="lock" title="The short version">
          Your camera and microphone only start when you press a button. SignSpeak does not record,
          store or upload video, audio, landmarks or your conversation. Everything runs in your
          browser. There is one exception, and it is about your browser rather than SignSpeak: see
          “Speech recognition sends audio to your browser vendor” below.
        </Callout>

        {/* The exception, stated plainly and early. */}
        <Card elevation="raised" accent="danger">
          <Panel padding="md" className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Icon name="alert" size="1.4rem" className="text-danger" />
              Speech recognition sends audio to your browser vendor
            </h2>
            <p className="text-pretty">
              When you press the microphone, SignSpeak uses the Web Speech API that is built into
              your browser. In Chrome and Edge, that API sends your audio to Google to be turned
              into text. SignSpeak has no control over this and cannot prevent it, so it tells you
              before you use the microphone.
            </p>
            <ul className="space-y-2">
              {[
                'SignSpeak itself never receives, records or stores your audio.',
                'The audio goes to your browser vendor, under their privacy terms, not ours.',
                'Sign recognition does not use this path at all — hand tracking is fully on-device.',
                'If you would rather not send audio anywhere, type your message instead. Typing produces exactly the same result.',
              ].map((point) => (
                <li key={point} className="flex gap-2.5 text-pretty text-muted">
                  <Icon name="chevron-right" size="1rem" className="mt-1.5 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              The microphone is only used while you are actively holding a listening session. It
              stops when you press Stop, when recognition ends, or when you leave the page.
            </p>
          </Panel>
        </Card>

        {/* Data table */}
        <section aria-labelledby="data-table-heading">
          <SectionHeading
            id="data-table-heading"
            level={2}
            title="What happens to each kind of data"
            icon="list"
          />
          <Card elevation="flat" className="mt-4">
            <Panel padding="none" className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left">
                <caption className="sr-only">
                  Data type, where it is processed, whether it is stored, and whether it is transmitted
                </caption>
                <thead>
                  <tr className="border-b border-line bg-raised">
                    <th scope="col" className="p-3 font-semibold">Data</th>
                    <th scope="col" className="p-3 font-semibold">Processed where</th>
                    <th scope="col" className="p-3 font-semibold">Stored</th>
                    <th scope="col" className="p-3 font-semibold">Transmitted</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_ROWS.map((row) => (
                    <tr key={row.data} className="border-b border-line last:border-0">
                      <th scope="row" className="p-3 align-top font-medium">
                        {row.data}
                      </th>
                      <td className="p-3 align-top text-muted">{row.where}</td>
                      <td className="p-3 align-top text-muted">{row.stored}</td>
                      <td className="p-3 align-top">
                        <Badge
                          tone={row.tone}
                          icon={row.tone === 'danger' ? 'alert' : row.tone === 'warning' ? 'info' : 'check'}
                        >
                          {row.transmitted}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Card>
        </section>

        {/* Retention and shared devices */}
        <section aria-labelledby="retention-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading id="retention-heading" level={2} title="How long things last" icon="clock" />
              <dl className="space-y-3">
                {[
                  {
                    term: 'The conversation',
                    detail:
                      'Held in memory for the current tab only. It disappears when you press End conversation, when you reload the page, or after the inactivity timer you set in Settings (10 minutes by default).',
                  },
                  {
                    term: 'Camera and microphone',
                    detail:
                      'Stopped the moment you press Stop, Pause, or End conversation. Closing the tab also releases them.',
                  },
                  {
                    term: 'Settings',
                    detail:
                      'Kept in this browser’s local storage so your preferences survive a reload. Press Reset all settings to remove them.',
                  },
                  {
                    term: 'Correction samples',
                    detail:
                      'Only if you turn the option on. Kept in this browser’s IndexedDB until you export or delete them. They contain hand-landmark numbers and the corrected word — no images, no audio, no conversation text.',
                  },
                ].map((item) => (
                  <div key={item.term} className="ss-bordered rounded-xl bg-raised p-3.5">
                    <dt className="font-semibold">{item.term}</dt>
                    <dd className="mt-1 text-pretty text-muted">{item.detail}</dd>
                  </div>
                ))}
              </dl>
              <Callout tone="neutral" icon="info" title="Shared devices">
                On a shared ward tablet, press <strong>End conversation</strong> when you are
                finished, and consider setting the auto-clear timer to 5 minutes in Settings. There
                is also a <strong>Hide conversation</strong> button for when someone walks past.
              </Callout>
            </Panel>
          </Card>
        </section>

        {/* What we do not do */}
        <section aria-labelledby="never-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading id="never-heading" level={2} title="Things SignSpeak never does" icon="lock" />
              <ul className="grid gap-2 sm:grid-cols-2">
                {[
                  'No user accounts and no sign-in.',
                  'No analytics, no tracking, no advertising.',
                  'No database and no server that stores your data.',
                  'No recording of video or audio.',
                  'No collection of your name, ID numbers or medical record.',
                  'No requests to third parties — no external fonts, no CDNs, no embeds. A YouTube ISL clip is only loaded if you press the button to load it.',
                  'No storage of the conversation outside the current tab.',
                  'No sharing of your data with anyone, because there is nothing to share.',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-pretty">
                    <Icon name="check" size="1.15rem" className="mt-1 shrink-0 text-success" />
                    <span className="text-muted">{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Card>
        </section>

        {/* Optional backend */}
        <section aria-labelledby="backend-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-3">
              <SectionHeading
                id="backend-heading"
                level={2}
                title="The optional inference server"
                icon="upload"
              />
              <p className="text-pretty text-muted">
                SignSpeak runs sign recognition on your device by default. A team deploying it can
                optionally configure a small server to score the hand-landmark numbers instead, for
                devices where on-device inference is too slow. If that is configured, and you turn
                the option on in Settings, then:
              </p>
              <ul className="space-y-2">
                {[
                  'only the numeric landmark vector is sent, over an encrypted connection;',
                  'no video frames, no images and no audio are ever sent;',
                  'the server is documented to keep no state and log no payloads;',
                  'if the server cannot be reached, SignSpeak automatically falls back to on-device recognition and tells you.',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-pretty text-muted">
                    <Icon name="chevron-right" size="1rem" className="mt-1.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {!config.inferenceBackendUrl ? (
                <Badge tone="success" icon="check">
                  Not configured in this build — recognition runs entirely on your device
                </Badge>
              ) : null}
            </Panel>
          </Card>
        </section>

        {/* Security */}
        <section aria-labelledby="security-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-3">
              <SectionHeading id="security-heading" level={2} title="Security" icon="shield" />
              <ul className="space-y-2">
                {[
                  'The app must be served over HTTPS. That is also a browser requirement for using a camera or microphone at all, so the two constraints agree.',
                  'No third-party scripts are loaded, which removes a whole class of supply-chain risk.',
                  'Dependencies are scanned in continuous integration.',
                  'The app can be run entirely offline after the first load, so a hospital network outage does not stop the phrase board.',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-pretty text-muted">
                    <Icon name="check" size="1.15rem" className="mt-1 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Card>
        </section>

        <Callout tone="warning" icon="alert" title="Sensitive conversations">
          Hospital conversations can contain sensitive health information. Because nothing is stored,
          the exposure is limited to the screen in front of you. Use the Hide conversation button
          when others are nearby, and press End conversation when you are done. SignSpeak never asks
          for your name, an ID number, or a diagnosis.
        </Callout>

        <Callout tone="warning" icon="alert" title="SignSpeak is not a medical device">
          It does not diagnose, triage or recommend treatment, and it does not replace a qualified ISL
          interpreter or emergency services. In an emergency, call {config.emergencyNumber} and get
          staff.
        </Callout>
      </Stack>
    </div>
  );
}

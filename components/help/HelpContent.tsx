'use client';

/**
 * Help content.
 *
 * Two principles: every instruction names the button to press, and every failure mode in
 * `docs/technical-architecture.md` §6 has a matching entry here so the help page is
 * complete rather than aspirational.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Card, Panel, SectionHeading, Stack } from '@/components/ui/Surface';
import { ReadinessPanel } from '@/components/common/ReadinessPanel';
import { Kbd } from '@/components/ui/Badge';
import { config } from '@/lib/config';

interface TaskGuide {
  title: string;
  steps: string[];
  icon: 'hand' | 'mic' | 'list' | 'siren' | 'speaker' | 'video';
}

const GUIDES: TaskGuide[] = [
  {
    icon: 'hand',
    title: 'Recognise a sign',
    steps: [
      'Open Conversation from the navigation, or press Start conversation on the home screen.',
      'In the Deaf user panel, press Start camera and allow camera access when your browser asks.',
      'Wait for the green “Hand tracked” indicator.',
      'Hold one supported sign steady in the middle of the frame, with your hand clearly lit.',
      'A chip appears with the word and a confidence level. Press Confirm, or Not this to correct it.',
      'Nothing is spoken until you press Speak.',
    ],
  },
  {
    icon: 'mic',
    title: 'Speak as the hearing person',
    steps: [
      'In the Hearing user panel, press the round microphone button.',
      'Speak clearly. The words appear as you talk, then settle into the editable box.',
      'Check the transcript and fix anything the recogniser misheard.',
      'Press Send message.',
      'SignSpeak matches your words against the curated phrase list and tells you whether the deaf user is seeing a verified ISL video or text only.',
    ],
  },
  {
    icon: 'list',
    title: 'Use the phrase board',
    steps: [
      'Open Phrases from the navigation.',
      'Choose a category, then a phrase.',
      'Press Speak to hear it aloud, or Add to put it into the conversation.',
      'If a phrase has a verified ISL video, press Show ISL. If not, SignSpeak explains why instead of inventing a sign.',
    ],
  },
  {
    icon: 'siren',
    title: 'Use Emergency mode',
    steps: [
      'Press Emergency phrases on the home screen. It is one tap away from anywhere.',
      'Press the large button for what you need. It is spoken aloud immediately and added to the list shown to staff.',
      'Use the 0 to 10 pain scale to say how much it hurts.',
      'Emergency mode needs no camera, no microphone, no model and no network.',
    ],
  },
  {
    icon: 'speaker',
    title: 'Have your message spoken aloud',
    steps: [
      'Type or sign your message so it appears in the conversation.',
      'Press Speak under “Speak everything you have said”.',
      'Press Stop at any time. Press Repeat to hear it again.',
      'The text stays on screen in large type whether or not audio is available.',
    ],
  },
  {
    icon: 'video',
    title: 'What happens when there is no ISL video',
    steps: [
      'SignSpeak only shows an ISL video that a qualified ISL signer has verified for that exact phrase.',
      'When there is none, you see the message “No verified ISL video for this phrase” and the text in large type.',
      'SignSpeak never assembles English word clips and presents them as ISL, because the word order and grammar would be wrong.',
    ],
  },
];

interface TroubleshootingItem {
  problem: string;
  what: string;
  fix: string;
}

const TROUBLESHOOTING: TroubleshootingItem[] = [
  {
    problem: 'The camera does not start',
    what: 'Permission may have been declined, another app may be using the camera, or the page may not be on HTTPS.',
    fix: 'Press Try again. If it still fails, allow the camera in your browser’s address bar, close other apps using the camera, and reload. The phrase board and typing work without a camera.',
  },
  {
    problem: '“Move hands into frame” will not turn green',
    what: 'Lighting is too dim, the background is very busy, or your hands are outside the frame.',
    fix: 'Face a light source, keep your hands inside the preview, and move a little closer. A plain background helps.',
  },
  {
    problem: 'It keeps saying “Not recognised”',
    what: 'The sign may not be in the supported list, or the model may be unsure. No word is emitted when the model is unsure, by design.',
    fix: 'Hold the sign still for a moment longer. After two failed attempts SignSpeak offers the phrase board, which needs no camera. You can also open the Limitations page to check which signs are supported.',
  },
  {
    problem: 'A recognised word is wrong',
    what: 'Recognition is a small prototype and can misread a sign.',
    fix: 'Press the chip and choose Not this to pick from the alternatives or type what you meant. You can also delete the word so it is never spoken.',
  },
  {
    problem: 'The microphone button is disabled',
    what: 'This browser does not support the Web Speech API (Firefox is the common case), or the page is not on HTTPS.',
    fix: 'Type your message instead — it goes through exactly the same phrase matching. Chrome, Edge and Safari support speech recognition.',
  },
  {
    problem: 'Speech recognition stops by itself',
    what: 'Recognition stops after a pause, and it can also stop on a noisy ward or a slow connection.',
    fix: 'Press the microphone again to restart. Typing never has this problem.',
  },
  {
    problem: 'No sound when I press Speak',
    what: 'Your device may have no voice installed for the selected language, the volume may be down, or the browser may block audio.',
    fix: 'Check the volume, then choose a different voice or language in Settings. The text is always shown on screen in large type so the conversation can continue.',
  },
  {
    problem: 'Everything is running slowly',
    what: 'Hand tracking is heavy. A warning appears when it drops below ' + config.lowFpsThreshold + ' frames per second.',
    fix: 'Close other tabs and apps. Turn off the landmark overlay in Settings. On a phone, use the phrase board instead.',
  },
  {
    problem: '“No sign-recognition model is installed”',
    what: 'This build ships without a trained model, because a model can only be trained on consented landmark data collected from ISL signers.',
    fix: 'Everything except sign recognition works: the phrase board, Emergency mode, typing and speech. See the Limitations page for the full picture.',
  },
];

export function HelpContent() {
  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-5 sm:py-8">
      <SectionHeading
        level={1}
        title="Help"
        description="How to use each screen, what to do when something fails, and which browsers are supported."
        icon="help"
      />

      <Stack gap="lg" className="mt-5">
        <ReadinessPanel />

        {/* Quick links */}
        <nav aria-label="Help sections">
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              { href: '/privacy', label: 'Privacy', icon: 'shield' as const, text: 'What stays on your device' },
              { href: '/limitations', label: 'Limitations', icon: 'alert' as const, text: 'Supported signs and phrases' },
              { href: '/settings', label: 'Settings', icon: 'settings' as const, text: 'Text size, contrast, voices' },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-2xl">
                  <Card elevation="flat" className="h-full hover:bg-raised">
                    <Panel padding="md" className="flex items-center gap-3">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        <Icon name={item.icon} size="1.4rem" />
                      </span>
                      <span>
                        <span className="block font-semibold">{item.label}</span>
                        <span className="block text-sm text-muted">{item.text}</span>
                      </span>
                    </Panel>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Task guides */}
        <section aria-labelledby="tasks-heading">
          <SectionHeading id="tasks-heading" level={2} title="Step by step" icon="list" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {GUIDES.map((guide) => (
              <Card key={guide.title} elevation="flat" className="h-full">
                <Panel padding="md">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Icon name={guide.icon} size="1.3rem" className="text-primary" />
                    {guide.title}
                  </h3>
                  <ol className="mt-3 space-y-2">
                    {guide.steps.map((step, index) => (
                      <li key={step} className="flex gap-2.5 text-pretty">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                          {index + 1}
                        </span>
                        <span className="text-muted">{step}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </Card>
            ))}
          </div>
        </section>

        {/* Keyboard and screen reader */}
        <section aria-labelledby="keyboard-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading
                id="keyboard-heading"
                level={2}
                title="Keyboard and screen reader"
                icon="keyboard"
              />
              <p className="text-muted">
                Every screen is fully operable from the keyboard. A visible focus ring shows where
                you are, and a “Skip to main content” link appears as soon as you press{' '}
                <Kbd>Tab</Kbd>.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  { keys: ['Tab'], text: 'Move to the next control, including the skip link first.' },
                  { keys: ['Shift', 'Tab'], text: 'Move to the previous control.' },
                  { keys: ['Enter'], text: 'Activate the focused button or link.' },
                  { keys: ['Space'], text: 'Toggle the focused switch or button.' },
                  { keys: ['Esc'], text: 'Close the open dialog or correction sheet and return focus.' },
                  { keys: ['Arrow keys'], text: 'Move between options in the theme, text size and confidence groups.' },
                ].map((shortcut) => (
                  <li key={shortcut.keys.join('+')} className="ss-bordered rounded-xl bg-raised p-3">
                    <p className="flex flex-wrap items-center gap-1.5 font-mono text-sm">
                      {shortcut.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </p>
                    <p className="mt-1.5 text-sm text-muted">{shortcut.text}</p>
                  </li>
                ))}
              </ul>
              <Callout tone="neutral" icon="info" title="Screen reader behaviour">
                New messages are announced politely, so they do not interrupt what you are reading.
                The hand-tracking status and turn indicator are separate live regions and only
                announce when they actually change. Every clip is accompanied by its caption as
                text, so no information is available only as audio.
              </Callout>
            </Panel>
          </Card>
        </section>

        {/* Troubleshooting */}
        <section aria-labelledby="troubleshooting-heading">
          <SectionHeading
            id="troubleshooting-heading"
            level={2}
            title="When something goes wrong"
            icon="alert"
          />
          <div className="mt-4 space-y-3">
            {TROUBLESHOOTING.map((item) => (
              <Card key={item.problem} elevation="flat">
                <Panel padding="md" className="space-y-2">
                  <h3 className="font-semibold">{item.problem}</h3>
                  <p className="text-pretty text-muted">
                    <span className="font-medium text-ink">Why: </span>
                    {item.what}
                  </p>
                  <p className="text-pretty text-muted">
                    <span className="font-medium text-ink">What to do: </span>
                    {item.fix}
                  </p>
                </Panel>
              </Card>
            ))}
          </div>
        </section>

        {/* Browser support */}
        <section aria-labelledby="browsers-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading id="browsers-heading" level={2} title="Browser support" icon="info" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left">
                  <caption className="sr-only">
                    Feature support by browser
                  </caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 pe-4 font-semibold">Feature</th>
                      <th scope="col" className="py-2 pe-4 font-semibold">Chrome / Edge</th>
                      <th scope="col" className="py-2 pe-4 font-semibold">Safari</th>
                      <th scope="col" className="py-2 font-semibold">Firefox</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feature: 'Camera and hand tracking', chrome: 'Yes', safari: 'Yes', firefox: 'Yes' },
                      { feature: 'On-device sign recognition', chrome: 'Yes', safari: 'Yes', firefox: 'Yes' },
                      { feature: 'Speech recognition (microphone)', chrome: 'Yes', safari: 'Yes', firefox: 'No — type instead' },
                      { feature: 'Text-to-speech', chrome: 'Yes', safari: 'Yes', firefox: 'Yes' },
                      { feature: 'Phrase board and Emergency mode', chrome: 'Yes', safari: 'Yes', firefox: 'Yes' },
                    ].map((row) => (
                      <tr key={row.feature} className="border-b border-line last:border-0">
                        <th scope="row" className="py-2.5 pe-4 font-medium">{row.feature}</th>
                        <td className="py-2.5 pe-4">{row.chrome}</td>
                        <td className="py-2.5 pe-4">{row.safari}</td>
                        <td className="py-2.5">{row.firefox}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral" icon="lock">HTTPS or localhost required for camera and microphone</Badge>
                <Badge tone="neutral" icon="refresh">Works offline after the first load</Badge>
              </div>
            </Panel>
          </Card>
        </section>

        {/* Not medical */}
        <Callout tone="warning" icon="alert" title="SignSpeak is not a medical device">
          It does not diagnose, triage or recommend treatment, and it does not replace a qualified ISL
          interpreter or emergency services. In an emergency, call {config.emergencyNumber} and get
          staff.
        </Callout>
      </Stack>
    </div>
  );
}

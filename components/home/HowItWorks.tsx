'use client';

/**
 * "How it works" explainer. Three steps, each paired with an icon and a text label, so
 * the meaning survives without colour and without audio.
 */

import { Card, Panel, SectionHeading } from '@/components/ui/Surface';
import { Icon, type IconName } from '@/components/ui/Icon';

interface Step {
  icon: IconName;
  title: string;
  body: string;
  tone: 'primary' | 'accent' | 'warning';
}

const STEPS: Step[] = [
  {
    icon: 'hand',
    title: '1. The deaf user signs, taps or types',
    body: 'Hold a supported sign in front of the camera, or pick a phrase from the hospital board. The recognised word appears as a chip with a confidence level you can confirm, correct or delete.',
    tone: 'primary',
  },
  {
    icon: 'mic',
    title: '2. The hearing person speaks or types',
    body: 'Speech is turned into an editable transcript, and typing is always available. Nothing is sent until the hearing person presses Send.',
    tone: 'accent',
  },
  {
    icon: 'video',
    title: '3. The reply comes back as ISL or as clear text',
    body: 'If a qualified ISL signer has verified a clip for that phrase, it plays with a "verified" badge. If not, SignSpeak shows the text in large type and says so — it never invents a sign.',
    tone: 'warning',
  },
];

const TONE_CLASS: Record<Step['tone'], string> = {
  primary: 'bg-primary-soft text-primary',
  accent: 'bg-accent-soft text-accent',
  warning: 'bg-warning-soft text-warning',
};

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading">
      <SectionHeading
        id="how-it-works-heading"
        title="How a conversation works"
        description="Three steps, in order, with a fallback at every stage."
        icon="sparkles"
      />
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.title}>
            <Card elevation="flat" className="h-full">
              <Panel padding="md" className="flex h-full flex-col gap-3">
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${TONE_CLASS[step.tone]}`}>
                  <Icon name={step.icon} size="1.6rem" />
                </span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-pretty text-muted">{step.body}</p>
              </Panel>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

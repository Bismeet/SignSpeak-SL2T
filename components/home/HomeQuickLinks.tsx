'use client';

/**
 * Home quick links: Settings, Help, Privacy, Limitations.
 *
 * The Limitations link is one tap from Home on every screen size (NFR-07).
 */

import Link from 'next/link';
import { Card, Panel, SectionHeading } from '@/components/ui/Surface';
import { Icon, type IconName } from '@/components/ui/Icon';

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: IconName;
}

const LINKS: QuickLink[] = [
  {
    href: '/settings',
    label: 'Settings & accessibility',
    description: 'Text size, contrast, reduced motion, voices, confidence threshold, data controls.',
    icon: 'settings',
  },
  {
    href: '/help',
    label: 'Help',
    description: 'How to use each screen, what to do when something fails, keyboard shortcuts.',
    icon: 'help',
  },
  {
    href: '/privacy',
    label: 'Privacy',
    description: 'Exactly what stays on your device, and the one thing that does not.',
    icon: 'shield',
  },
  {
    href: '/limitations',
    label: 'Limitations',
    description: 'The supported signs and phrases, and everything SignSpeak cannot do.',
    icon: 'alert',
  },
  {
    href: '/collect',
    label: 'Data collection tool',
    description: 'For the team: record consented landmark samples to train a real recognition model.',
    icon: 'download',
  },
];

export function HomeQuickLinks() {
  return (
    <section aria-labelledby="quick-links-heading">
      <SectionHeading id="quick-links-heading" title="More" icon="list" />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="block rounded-2xl">
              <Card elevation="flat" interactive className="h-full">
                <Panel padding="md" className="flex h-full gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary-soft text-primary">
                    <Icon name={link.icon} size="1.4rem" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {link.label}
                      <Icon name="chevron-right" size="1rem" className="text-faint" />
                    </span>
                    <span className="mt-1 block text-pretty text-sm leading-relaxed text-muted">
                      {link.description}
                    </span>
                  </span>
                </Panel>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

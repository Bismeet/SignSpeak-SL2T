'use client';

/**
 * Readiness panel — the honest status of the two AI-dependent features.
 *
 * This is the single most important honesty surface in the app (NFR-07). It states, from
 * live data rather than hardcoded copy:
 *   - whether a sign-recognition model is actually installed and what it was trained on;
 *   - how many phrases an ISL signer has actually verified;
 *   - what still works when either is unavailable.
 *
 * Laid out as a two-up bento grid: hairline-bordered panels that lift their border on
 * hover, with the status carried by a micro-pill rather than a saturated alert block.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card, Panel } from '@/components/ui/Surface';
import { Icon } from '@/components/ui/Icon';
import { availabilitySummary, useModel } from '@/lib/state/model-provider';
import { phraseSummary } from '@/lib/phrases/data';
import { signVocabularySummary } from '@/lib/signs/vocabulary';
import { cn } from '@/lib/utils/cn';

export function ReadinessPanel({ className }: { className?: string }) {
  const { availability } = useModel();
  const summary = availabilitySummary(availability);
  const phrases = phraseSummary();
  const signs = signVocabularySummary();

  const clipTone = phrases.withClip > 0 ? 'success' : 'warning';

  return (
    <Card elevation="flat" className={cn('overflow-hidden', className)}>
      <Panel padding="md" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon name="info" size="1.25rem" className="text-primary" />
            What is working right now
          </h2>
          <Link
            href="/limitations"
            className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
          >
            Full limitations
            <Icon name="chevron-right" size="1rem" />
          </Link>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {/* Sign recognition */}
          <li className="group rounded-xl border border-line bg-raised/40 p-5 transition-colors hover:border-strong">
            <div className="flex items-start gap-3">
              <Icon name="hand" size="1.4rem" className="mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-semibold">Sign to text</p>
                <p className="mt-2">
                  <Badge
                    size="micro"
                    tone={summary.tone === 'neutral' ? 'neutral' : summary.tone}
                    icon={summary.tone === 'success' ? 'badge-check' : 'alert'}
                  >
                    {summary.label}
                  </Badge>
                </p>
                {summary.detail ? (
                  <p className="mt-2.5 text-pretty text-sm leading-relaxed text-muted">
                    {summary.detail}
                  </p>
                ) : null}
                <p className="mt-2.5 text-pretty text-sm leading-relaxed text-muted">
                  Published vocabulary: {signs.total} candidate signs, {signs.must} at Must tier.{' '}
                  {signs.verified === 0
                    ? 'None has been confirmed by an ISL signer yet, so no accuracy is claimed.'
                    : `${signs.verified} confirmed by an ISL signer.`}
                </p>
              </div>
            </div>
          </li>

          {/* Text to ISL video */}
          <li className="group rounded-xl border border-line bg-raised/40 p-5 transition-colors hover:border-strong">
            <div className="flex items-start gap-3">
              <Icon name="video" size="1.4rem" className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="font-semibold">Text to ISL video</p>
                <p className="mt-2">
                  <Badge
                    size="micro"
                    tone={clipTone}
                    icon={phrases.withClip > 0 ? 'badge-check' : 'alert'}
                  >
                    {phrases.withClip > 0
                      ? `${phrases.withClip} verified clip${phrases.withClip === 1 ? '' : 's'} available`
                      : 'No verified clips yet'}
                  </Badge>
                </p>
                <p className="mt-2.5 text-pretty text-sm leading-relaxed text-muted">
                  {phrases.withClip > 0
                    ? `${phrases.verified} of ${phrases.total} phrases are expert-verified.`
                    : `All ${phrases.total} phrases are curated and matchable, but none has an ISL clip verified by a qualified signer. Unmatched or unverified phrases show the text with a clear notice instead of an invented sign.`}
                </p>
              </div>
            </div>
          </li>
        </ul>

        <p className="text-pretty text-sm leading-relaxed text-muted">
          The phrase board, Emergency mode, typing, speech-to-text and text-to-speech do not depend
          on either AI feature and work even with no camera, no model and no network.
        </p>
      </Panel>
    </Card>
  );
}

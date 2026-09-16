'use client';

/**
 * Home hero (docs/ui-ux-specification.md §3.1).
 *
 * Three actions, in priority order: Start conversation, Emergency phrases, Hospital
 * phrases. Emergency is reachable in exactly one tap from here (FR-HOSP-04).
 *
 * No camera or microphone permission is requested on this screen, or anywhere else
 * before an explicit user action (docs/privacy-and-safety.md §2).
 */

import { BrandMark } from '@/components/layout/BrandMark';
import { LinkButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { config } from '@/lib/config';

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-heading"
      className="relative overflow-hidden border-b border-line bg-surface"
    >
      {/* Decorative gradient wash. Hidden from assistive technology and disabled under
          reduced-motion (it is static, so there is nothing to animate). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            'radial-gradient(60rem 24rem at 12% -10%, rgb(var(--ss-primary) / 0.28), transparent 62%), radial-gradient(46rem 22rem at 92% 8%, rgb(var(--ss-accent) / 0.22), transparent 60%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl px-3 pb-8 pt-8 sm:px-5 sm:pb-10 sm:pt-12">
        <div className="flex items-center gap-3">
          <BrandMark size={52} labelled />
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">
            Indian Sign Language
          </p>
        </div>

        <h1
          id="home-heading"
          className="mt-5 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl"
        >
          Two-way communication when the other person does not sign
        </h1>

        <p className="mt-4 max-w-2xl text-pretty text-lg text-muted sm:text-xl">
          SignSpeak helps a deaf Indian Sign Language user and a hearing person understand each
          other in a hospital or an emergency. It supports a small set of hospital signs and
          phrases — and it says plainly when it does not know something.
        </p>

        <p className="mt-4 flex max-w-2xl items-start gap-2 text-pretty text-sm text-muted">
          <Icon name="alert" size="1.1rem" className="mt-0.5 shrink-0 text-warning" />
          <span>
            SignSpeak is a communication aid. It is not a medical device, it does not diagnose or
            advise, and it does not replace a qualified ISL interpreter or emergency services. In an
            emergency, call {config.emergencyNumber} and get staff.
          </span>
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LinkButton href="/talk" size="lg" icon="users" block className="sm:col-span-2 lg:col-span-1">
            Start conversation
          </LinkButton>
          <LinkButton href="/emergency" size="lg" variant="danger" icon="siren" block>
            Emergency phrases
          </LinkButton>
          <LinkButton href="/phrases" size="lg" variant="secondary" icon="list" block>
            Hospital phrases
          </LinkButton>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <Icon name="camera-off" size="1.1rem" />
            Camera stays off until you start it
          </span>
          <span className="inline-flex items-center gap-2">
            <Icon name="mic-off" size="1.1rem" />
            Microphone stays off until you tap it
          </span>
          <span className="inline-flex items-center gap-2">
            <Icon name="lock" size="1.1rem" />
            Nothing is recorded or uploaded
          </span>
        </div>
      </div>
    </section>
  );
}

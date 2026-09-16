'use client';

/**
 * First-run intro (docs/ui-ux-specification.md §3.1): three cards covering what the app
 * does, how permissions work, and what it cannot do. Skippable, and shown only once.
 *
 * The card content is deliberately blunt about limitations, because the intro is the
 * only screen a first-time user is guaranteed to see.
 */

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

export const INTRO_STORAGE_KEY = 'signspeak.intro.seen.v1';

interface IntroCard {
  icon: IconName;
  title: string;
  body: string;
  points: string[];
}

const CARDS: IntroCard[] = [
  {
    icon: 'users',
    title: 'Two-way help, one screen',
    body: 'SignSpeak helps a deaf ISL user and a hearing person understand each other in a hospital or an emergency.',
    points: [
      'The deaf user signs or taps a phrase.',
      'The hearing person speaks or types.',
      'Everything appears in one shared conversation.',
    ],
  },
  {
    icon: 'shield',
    title: 'Your camera and microphone stay yours',
    body: 'Nothing starts until you press a button. SignSpeak does not record or upload video or audio.',
    points: [
      'Hand tracking runs on this device.',
      'The camera only opens when you start it, and you can pause it at any time.',
      'One caveat: your browser’s own speech service may send audio to turn speech into text. The app tells you when you use it.',
    ],
  },
  {
    icon: 'alert',
    title: 'What SignSpeak cannot do',
    body: 'Being honest about the limits is what makes this tool safe to use.',
    points: [
      'It recognises only a small, published set of signs, and it can be wrong.',
      'It shows an ISL video only when a qualified signer has verified that exact phrase.',
      'It is not a medical device, and it does not replace an interpreter or emergency services.',
    ],
  },
];

export function FirstRunIntro() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(INTRO_STORAGE_KEY) !== '1') setOpen(true);
    } catch {
      // Storage unavailable (private mode): show the intro rather than skip it.
      setOpen(true);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      /* preferences simply do not persist */
    }
    setOpen(false);
  }

  // `CARDS` is a non-empty literal; the second fallback only satisfies the index-access
  // type check (`noUncheckedIndexedAccess`), it is never reached in practice.
  const card: IntroCard = CARDS[index] ?? (CARDS[0] as IntroCard);
  const isLast = index === CARDS.length - 1;

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title={`${card.title} (${index + 1} of ${CARDS.length})`}
      variant="centered"
      footer={
        <>
          {index > 0 ? (
            <Button variant="secondary" icon="arrow-left" onClick={() => setIndex((value) => value - 1)}>
              Back
            </Button>
          ) : null}
          <Button
            variant="primary"
            className="flex-1"
            trailingIcon={isLast ? 'check' : 'arrow-right'}
            onClick={() => (isLast ? dismiss() : setIndex((value) => value + 1))}
          >
            {isLast ? 'Get started' : 'Next'}
          </Button>
          {!isLast ? (
            <Button variant="ghost" onClick={dismiss}>
              Skip
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon name={card.icon} size="1.9rem" />
        </span>
        <p className="text-pretty text-lg">{card.body}</p>
        <ul className="space-y-2">
          {card.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-pretty text-muted">
              <Icon name="check" size="1.15rem" className="mt-1 text-accent" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-center gap-1.5 pt-2" aria-hidden="true">
          {CARDS.map((entry, entryIndex) => (
            <span
              key={entry.title}
              className={`h-2 w-8 rounded-full ${entryIndex === index ? 'bg-primary' : 'bg-line'}`}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

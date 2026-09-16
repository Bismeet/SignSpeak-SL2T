/**
 * Conversation reducer tests (FR-CONV-01..04, T-CONV-01..03).
 *
 * Two behaviours here are safety-relevant rather than cosmetic:
 *
 *  - `rejectRecognition` *removes* the message. A wrong word left in the record is a wrong
 *    word a nurse might act on.
 *  - the reducer is pure and in-memory only. Nothing in this file touches storage, and
 *    there is a test asserting that the module does not import any storage API.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INITIAL_CONVERSATION_STATE,
  conversationReducer,
  createMessage,
  lastMessage,
  unreviewedRecognitionCount,
  unspeokenDeafUserText,
  type ConversationAction,
  type ConversationState,
} from '@/lib/state/conversation-reducer';
import type { ConversationMessage } from '@/lib/types';

function apply(state: ConversationState, actions: ConversationAction[]): ConversationState {
  return actions.reduce(conversationReducer, state);
}

function addMessage(
  state: ConversationState,
  message: Omit<ConversationMessage, 'id' | 'createdAt'> & { id?: string },
): ConversationState {
  return conversationReducer(state, { type: 'add', message });
}

describe('adding messages', () => {
  it('appends a message and generates an id and timestamp', () => {
    const next = addMessage(INITIAL_CONVERSATION_STATE, {
      party: 'deaf_user',
      source: 'sign_recognition',
      text: 'PAIN',
    });
    expect(next.messages).toHaveLength(1);
    const message = next.messages[0];
    expect(message?.id).toBeTruthy();
    expect(message?.createdAt).toBeGreaterThan(0);
    expect(message?.text).toBe('PAIN');
  });

  it('hands the turn to the other party', () => {
    const afterDeaf = addMessage(INITIAL_CONVERSATION_STATE, {
      party: 'deaf_user',
      source: 'typed',
      text: 'I need water.',
    });
    expect(afterDeaf.activeParty).toBe('hearing_user');

    const afterHearing = addMessage(afterDeaf, {
      party: 'hearing_user',
      source: 'typed',
      text: 'Here you are.',
    });
    expect(afterHearing.activeParty).toBe('deaf_user');
  });

  it('keeps messages in insertion order', () => {
    const state = apply(INITIAL_CONVERSATION_STATE, [
      { type: 'add', message: { party: 'deaf_user', source: 'typed', text: 'first' } },
      { type: 'add', message: { party: 'hearing_user', source: 'typed', text: 'second' } },
      { type: 'add', message: { party: 'deaf_user', source: 'typed', text: 'third' } },
    ]);
    expect(state.messages.map((message) => message.text)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the previous state', () => {
    const before = INITIAL_CONVERSATION_STATE;
    const after = addMessage(before, { party: 'deaf_user', source: 'typed', text: 'hello' });
    expect(before.messages).toHaveLength(0);
    expect(after).not.toBe(before);
    expect(after.messages).not.toBe(before.messages);
  });
});

describe('editing and correcting', () => {
  const base = addMessage(INITIAL_CONVERSATION_STATE, {
    id: 'm1',
    party: 'deaf_user',
    source: 'sign_recognition',
    text: 'PAIN',
    recognition: {
      originalLabel: 'PAIN',
      probability: 0.91,
      band: 'high',
      alternatives: [{ label: 'STOMACH', probability: 0.05 }],
      reviewed: false,
      corrected: false,
      rejected: false,
    },
  });

  it('edits the text without touching the recognition metadata', () => {
    const next = conversationReducer(base, { type: 'setText', id: 'm1', text: 'Pain here' });
    expect(next.messages[0]?.text).toBe('Pain here');
    expect(next.messages[0]?.recognition?.reviewed).toBe(false);
  });

  it('marks a prediction as reviewed on confirmation', () => {
    const next = conversationReducer(base, { type: 'confirmRecognition', id: 'm1' });
    expect(next.messages[0]?.recognition?.reviewed).toBe(true);
    expect(next.messages[0]?.recognition?.corrected).toBe(false);
    expect(next.messages[0]?.text).toBe('PAIN');
  });

  it('records a correction with the new label and keeps the original for the log', () => {
    const next = conversationReducer(base, { type: 'correctRecognition', id: 'm1', label: 'STOMACH' });
    const message = next.messages[0];
    expect(message?.text).toBe('STOMACH');
    expect(message?.recognition?.reviewed).toBe(true);
    expect(message?.recognition?.corrected).toBe(true);
    // The original prediction is retained: it is the supervision signal the correction log
    // writes out, and losing it would make the log useless for training.
    expect(message?.recognition?.originalLabel).toBe('PAIN');
    expect(message?.recognition?.probability).toBeCloseTo(0.91, 6);
  });

  it('clears the rejected flag when a previously rejected message is corrected', () => {
    const rejected = conversationReducer(base, {
      type: 'correctRecognition',
      id: 'm1',
      label: 'STOMACH',
    });
    const withRejected = {
      ...rejected,
      messages: rejected.messages.map((message) => ({
        ...message,
        recognition: message.recognition ? { ...message.recognition, rejected: true } : undefined,
      })),
    };
    const fixed = conversationReducer(withRejected, {
      type: 'correctRecognition',
      id: 'm1',
      label: 'WATER',
    });
    expect(fixed.messages[0]?.recognition?.rejected).toBe(false);
  });

  it('leaves non-recognition messages alone when correcting', () => {
    const typed = addMessage(INITIAL_CONVERSATION_STATE, {
      id: 't1',
      party: 'hearing_user',
      source: 'typed',
      text: 'Where does it hurt?',
    });
    const next = conversationReducer(typed, { type: 'correctRecognition', id: 't1', label: 'x' });
    expect(next.messages[0]?.text).toBe('Where does it hurt?');
  });

  it('ignores actions for unknown ids without throwing', () => {
    expect(conversationReducer(base, { type: 'setText', id: 'nope', text: 'x' }).messages).toHaveLength(1);
    expect(conversationReducer(base, { type: 'delete', id: 'nope' }).messages).toHaveLength(1);
    expect(conversationReducer(base, { type: 'move', id: 'nope', direction: 'up' }).messages).toHaveLength(1);
  });
});

describe('rejecting a wrong prediction', () => {
  it('removes the message entirely rather than leaving a wrong word in the record', () => {
    const state = apply(INITIAL_CONVERSATION_STATE, [
      { type: 'add', message: { id: 'keep', party: 'hearing_user', source: 'typed', text: 'ok' } },
      {
        type: 'add',
        message: {
          id: 'drop',
          party: 'deaf_user',
          source: 'sign_recognition',
          text: 'PAIN',
          recognition: {
            originalLabel: 'PAIN',
            probability: 0.72,
            band: 'medium',
            alternatives: [],
            reviewed: false,
            corrected: false,
            rejected: false,
          },
        },
      },
    ]);

    const next = conversationReducer(state, { type: 'rejectRecognition', id: 'drop' });
    expect(next.messages.map((message) => message.id)).toEqual(['keep']);
    expect(next.messages.some((message) => message.text === 'PAIN')).toBe(false);
  });
});

describe('misunderstood flag (FR-CONV-03)', () => {
  it('toggles on and off', () => {
    const state = addMessage(INITIAL_CONVERSATION_STATE, {
      id: 'm1',
      party: 'hearing_user',
      source: 'typed',
      text: 'Sit down.',
    });
    const on = conversationReducer(state, { type: 'toggleMisunderstood', id: 'm1' });
    expect(on.messages[0]?.misunderstood).toBe(true);
    const off = conversationReducer(on, { type: 'toggleMisunderstood', id: 'm1' });
    expect(off.messages[0]?.misunderstood).toBe(false);
  });
});

describe('reordering', () => {
  const three = apply(INITIAL_CONVERSATION_STATE, [
    { type: 'add', message: { id: 'a', party: 'deaf_user', source: 'typed', text: 'a' } },
    { type: 'add', message: { id: 'b', party: 'hearing_user', source: 'typed', text: 'b' } },
    { type: 'add', message: { id: 'c', party: 'deaf_user', source: 'typed', text: 'c' } },
  ]);

  it('moves a message up', () => {
    const next = conversationReducer(three, { type: 'move', id: 'b', direction: 'up' });
    expect(next.messages.map((message) => message.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a message down', () => {
    const next = conversationReducer(three, { type: 'move', id: 'b', direction: 'down' });
    expect(next.messages.map((message) => message.id)).toEqual(['a', 'c', 'b']);
  });

  it('refuses to move past the ends', () => {
    expect(conversationReducer(three, { type: 'move', id: 'a', direction: 'up' }).messages).toEqual(
      three.messages,
    );
    expect(conversationReducer(three, { type: 'move', id: 'c', direction: 'down' }).messages).toEqual(
      three.messages,
    );
  });
});

describe('delivery and speech flags', () => {
  it('records how a hearing-user message reached the deaf user', () => {
    const state = addMessage(INITIAL_CONVERSATION_STATE, {
      id: 'm1',
      party: 'hearing_user',
      source: 'typed',
      text: 'Sit down.',
    });
    const next = conversationReducer(state, {
      type: 'setDelivery',
      id: 'm1',
      delivery: { mode: 'text_only', phraseId: 'i_sit_down', clipStatus: 'unverified' },
    });
    expect(next.messages[0]?.delivery?.mode).toBe('text_only');
    expect(next.messages[0]?.delivery?.phraseId).toBe('i_sit_down');
  });

  it('tracks whether a message was spoken aloud', () => {
    const state = addMessage(INITIAL_CONVERSATION_STATE, {
      id: 'm1',
      party: 'deaf_user',
      source: 'typed',
      text: 'I need water.',
    });
    expect(
      conversationReducer(state, { type: 'markSpoken', id: 'm1', spoken: true }).messages[0]?.spoken,
    ).toBe(true);
  });
});

describe('privacy controls', () => {
  it('hides content without deleting it', () => {
    const state = addMessage(INITIAL_CONVERSATION_STATE, {
      party: 'deaf_user',
      source: 'typed',
      text: 'sensitive',
    });
    const hidden = conversationReducer(state, { type: 'setHidden', hidden: true });
    expect(hidden.hidden).toBe(true);
    expect(hidden.messages).toHaveLength(1);
  });

  it('clears the conversation and records when it happened', () => {
    const state = apply(INITIAL_CONVERSATION_STATE, [
      { type: 'add', message: { party: 'deaf_user', source: 'typed', text: 'a' } },
      { type: 'add', message: { party: 'hearing_user', source: 'typed', text: 'b' } },
    ]);
    const cleared = conversationReducer(state, { type: 'clear' });
    expect(cleared.messages).toHaveLength(0);
    expect(cleared.lastClearedAt).toBeGreaterThan(0);
    expect(cleared.activeParty).toBe('deaf_user');
  });

  it('is in-memory only: the reducer module imports no storage API', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'lib', 'state', 'conversation-reducer.ts'),
      'utf8',
    );
    // Strip comments so the documentation above does not trip the assertion.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest']) {
      expect(
        code.includes(api),
        `conversation-reducer.ts must not reference ${api} (FR-CONV-04: the conversation is in memory only).`,
      ).toBe(false);
    }
  });
});

describe('helpers', () => {
  const messages: ConversationMessage[] = [
    createMessage({ id: '1', party: 'deaf_user', source: 'typed', text: 'I have pain here.' }),
    createMessage({ id: '2', party: 'hearing_user', source: 'typed', text: 'Where?' }),
    createMessage({ id: '3', party: 'deaf_user', source: 'typed', text: 'Here.' }),
  ];

  it('lastMessage returns the newest message overall', () => {
    expect(lastMessage(messages)?.id).toBe('3');
  });

  it('lastMessage can filter by party', () => {
    expect(lastMessage(messages, 'hearing_user')?.id).toBe('2');
    expect(lastMessage(messages, 'deaf_user')?.id).toBe('3');
  });

  it('lastMessage returns undefined for an empty list', () => {
    expect(lastMessage([])).toBeUndefined();
  });

  it('joins deaf-user text for speaking, dropping trailing punctuation', () => {
    expect(unspeokenDeafUserText(messages)).toBe('I have pain here. Here');
  });

  it('skips blank messages when building the spoken string', () => {
    const withBlank = [...messages, createMessage({ party: 'deaf_user', source: 'typed', text: '   ' })];
    expect(unspeokenDeafUserText(withBlank)).toBe('I have pain here. Here');
  });

  it('counts unreviewed AI predictions', () => {
    const recognition = (id: string, reviewed: boolean): ConversationMessage =>
      createMessage({
        id,
        party: 'deaf_user',
        source: 'sign_recognition',
        text: 'PAIN',
        recognition: {
          originalLabel: 'PAIN',
          probability: 0.9,
          band: 'high',
          alternatives: [],
          reviewed,
          corrected: false,
          rejected: false,
        },
      });
    expect(unreviewedRecognitionCount([recognition('a', false), recognition('b', true)])).toBe(1);
    expect(unreviewedRecognitionCount(messages)).toBe(0);
  });

  it('createMessage generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createMessage({ party: 'deaf_user', source: 'typed', text: 'x' }).id));
    expect(ids.size).toBe(50);
  });
});

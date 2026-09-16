/**
 * Pure conversation reducer.
 *
 * Kept separate from the React provider so the whole conversation model can be unit
 * tested without a DOM (see `tests/conversation.test.ts`).
 *
 * FR-CONV-04: this state lives in memory only. It is never written to `localStorage`,
 * `sessionStorage`, `IndexedDB` or any server, and it is discarded on reload.
 */

import type { ConversationMessage, ConversationParty } from '@/lib/types';
import { createId } from '@/lib/utils/misc';

export interface ConversationState {
  messages: ConversationMessage[];
  /** Whose turn the UI is currently set up for (FR-CONV-02). */
  activeParty: ConversationParty;
  /** Privacy toggle: content is obscured until revealed (`docs/privacy-and-safety.md` §6). */
  hidden: boolean;
  /** Set when "End conversation" cleared the log, so the UI can show a confirmation. */
  lastClearedAt: number | null;
}

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  messages: [],
  activeParty: 'deaf_user',
  hidden: false,
  lastClearedAt: null,
};

export type ConversationAction =
  | { type: 'add'; message: Omit<ConversationMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number } }
  | { type: 'setText'; id: string; text: string }
  | { type: 'confirmRecognition'; id: string }
  | { type: 'correctRecognition'; id: string; label: string }
  | { type: 'rejectRecognition'; id: string }
  | { type: 'toggleMisunderstood'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'markSpoken'; id: string; spoken: boolean }
  | {
      type: 'setDelivery';
      id: string;
      delivery: NonNullable<ConversationMessage['delivery']>;
    }
  | { type: 'setActiveParty'; party: ConversationParty }
  | { type: 'setHidden'; hidden: boolean }
  | { type: 'clear' };

/** Create a message with a generated id and timestamp. */
export function createMessage(
  input: Omit<ConversationMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): ConversationMessage {
  return {
    ...input,
    id: input.id ?? createId('msg'),
    createdAt: input.createdAt ?? Date.now(),
  };
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case 'add': {
      const message = createMessage(action.message);
      return {
        ...state,
        messages: [...state.messages, message],
        // Adding a message from one party hands the turn to the other.
        activeParty: message.party === 'deaf_user' ? 'hearing_user' : 'deaf_user',
      };
    }

    case 'setText':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id ? { ...message, text: action.text } : message,
        ),
      };

    case 'confirmRecognition':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id && message.recognition
            ? { ...message, recognition: { ...message.recognition, reviewed: true } }
            : message,
        ),
      };

    case 'correctRecognition':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id && message.recognition
            ? {
                ...message,
                text: action.label,
                recognition: {
                  ...message.recognition,
                  reviewed: true,
                  corrected: true,
                  rejected: false,
                },
              }
            : message,
        ),
      };

    case 'rejectRecognition':
      // FR-STT-06 / UC5: rejecting removes the word from the record rather than
      // leaving a wrong word in the conversation.
      return {
        ...state,
        messages: state.messages.filter((message) => message.id !== action.id),
      };

    case 'toggleMisunderstood':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id ? { ...message, misunderstood: !message.misunderstood } : message,
        ),
      };

    case 'delete':
      return { ...state, messages: state.messages.filter((message) => message.id !== action.id) };

    case 'move': {
      const index = state.messages.findIndex((message) => message.id === action.id);
      if (index === -1) return state;
      const target = action.direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= state.messages.length) return state;
      const messages = [...state.messages];
      const [moved] = messages.splice(index, 1);
      if (!moved) return state;
      messages.splice(target, 0, moved);
      return { ...state, messages };
    }

    case 'markSpoken':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id ? { ...message, spoken: action.spoken } : message,
        ),
      };

    case 'setDelivery':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id ? { ...message, delivery: action.delivery } : message,
        ),
      };

    case 'setActiveParty':
      return { ...state, activeParty: action.party };

    case 'setHidden':
      return { ...state, hidden: action.hidden };

    case 'clear':
      return { ...INITIAL_CONVERSATION_STATE, lastClearedAt: Date.now() };

    default:
      return state;
  }
}

/** Messages grouped for the "speak everything recognised since the last turn" action. */
export function unspeokenDeafUserText(messages: ConversationMessage[]): string {
  return messages
    .filter((message) => message.party === 'deaf_user' && message.text.trim().length > 0)
    .map((message) => message.text.trim().replace(/[.।]+$/, ''))
    .join('. ');
}

/** The most recent message, for the "repeat that" affordance. */
export function lastMessage(
  messages: ConversationMessage[],
  party?: ConversationParty,
): ConversationMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    if (!party || message.party === party) return message;
  }
  return undefined;
}

/** Count of messages that still need review (unconfirmed AI predictions). */
export function unreviewedRecognitionCount(messages: ConversationMessage[]): number {
  return messages.filter((message) => message.recognition && !message.recognition.reviewed).length;
}

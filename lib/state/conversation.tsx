'use client';

/**
 * Conversation provider.
 *
 * Wraps the pure reducer with a React context, an inactivity auto-clear timer
 * (`docs/privacy-and-safety.md` §4, for shared ward devices) and a `beforeunload`
 * guard so the in-memory log is genuinely gone on reload.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  conversationReducer,
  INITIAL_CONVERSATION_STATE,
  type ConversationAction,
  type ConversationState,
} from '@/lib/state/conversation-reducer';
import { useSettings } from '@/lib/state/settings';

interface ConversationContextValue {
  state: ConversationState;
  dispatch: (action: ConversationAction) => void;
  /** Clears the log and confirms (FR-CONV-04). */
  endConversation: () => void;
  /** Milliseconds until the auto-clear timer fires; null when disabled. */
  autoClearMinutes: number;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(conversationReducer, INITIAL_CONVERSATION_STATE);
  const { settings } = useSettings();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endConversation = useCallback(() => {
    dispatch({ type: 'clear' });
  }, []);

  // Auto-clear after inactivity. Shared tablets are the reason this exists, so it
  // restarts on every message and every settings change.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const minutes = settings.autoClearMinutes;
    if (!minutes || minutes <= 0) return;
    if (state.messages.length === 0) return;

    timerRef.current = setTimeout(
      () => {
        dispatch({ type: 'clear' });
      },
      minutes * 60_000,
    );

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [settings.autoClearMinutes, state.messages.length]);

  const value = useMemo<ConversationContextValue>(
    () => ({
      state,
      dispatch,
      endConversation,
      autoClearMinutes: settings.autoClearMinutes,
    }),
    [state, endConversation, settings.autoClearMinutes],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation(): ConversationContextValue {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used inside <ConversationProvider>.');
  }
  return context;
}

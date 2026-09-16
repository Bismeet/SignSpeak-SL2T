'use client';

/**
 * Conversation feed (FR-CONV-01, FR-CONV-04) and turn indicator (FR-CONV-02).
 *
 * Accessibility: the feed is an `aria-live="polite"` log, so a blind hearing user (for
 * example a blind relative) hears each new message announced without the whole log being
 * re-read. The turn indicator is a separate `role="status"` region so mode changes are
 * announced once rather than on every frame.
 */

import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon, type IconName } from '@/components/ui/Icon';
import { EmptyState } from '@/components/common/PermissionState';
import { MessageBubble } from '@/components/conversation/MessageBubble';
import { cn } from '@/lib/utils/cn';
import type { ConversationMessage, ConversationParty } from '@/lib/types';

/* ------------------------------------------------------------------------------------
 * Turn indicator
 * ---------------------------------------------------------------------------------- */

export interface TurnIndicatorProps {
  activeParty: ConversationParty;
  cameraActive: boolean;
  micActive: boolean;
  className?: string;
}

export function TurnIndicator({
  activeParty,
  cameraActive,
  micActive,
  className,
}: TurnIndicatorProps) {
  const label =
    activeParty === 'deaf_user'
      ? cameraActive
        ? 'Deaf user’s turn — signing'
        : 'Deaf user’s turn — sign, tap a phrase, or type'
      : micActive
        ? 'Hearing user’s turn — listening'
        : 'Hearing user’s turn — speak or type';

  const icon: IconName = activeParty === 'deaf_user' ? 'hand' : 'mic';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-raised px-3 py-2.5 sm:px-5',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        <Icon name={icon} size="1.15rem" className="text-primary" />
        Turn: {label}
      </span>
      <span className="ms-auto flex flex-wrap items-center gap-2">
        {cameraActive ? (
          <Badge tone="success" icon="camera">
            Camera on
          </Badge>
        ) : null}
        {micActive ? (
          <Badge tone="success" icon="mic">
            Mic listening
          </Badge>
        ) : null}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------------------
 * Feed
 * ---------------------------------------------------------------------------------- */

export interface ConversationFeedProps {
  messages: ConversationMessage[];
  hidden: boolean;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onToggleMisunderstood: (id: string) => void;
  onCorrectRecognition: (id: string) => void;
  onSpeak: (message: ConversationMessage) => void;
  onPlayClip: (message: ConversationMessage) => void;
  /** Content shown when the feed is empty; the parent supplies screen-specific actions. */
  emptyState?: React.ReactNode;
  className?: string;
}

export function ConversationFeed({
  messages,
  hidden,
  onEdit,
  onDelete,
  onMove,
  onToggleMisunderstood,
  onCorrectRecognition,
  onSpeak,
  onPlayClip,
  emptyState,
  className,
}: ConversationFeedProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(messages.length);

  // Keep the newest message in view without stealing focus.
  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    lastCountRef.current = messages.length;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? (
          <EmptyState
            icon="users"
            title="No messages yet"
            description="Start by signing at the camera, tapping a phrase, or typing."
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Conversation messages"
        className="space-y-4"
      >
        <ul className="space-y-4">
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              index={index}
              total={messages.length}
              hidden={hidden}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
              onToggleMisunderstood={onToggleMisunderstood}
              onCorrectRecognition={onCorrectRecognition}
              onSpeak={onSpeak}
              onPlayClip={onPlayClip}
            />
          ))}
        </ul>
      </div>
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}

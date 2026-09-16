'use client';

/**
 * A single conversation message (FR-CONV-01).
 *
 * Every message shows: who said it, when, how it was produced, and — for anything the AI
 * touched — a confidence or verification badge plus correction controls. Nothing the AI
 * produced is presented as fact without a badge (NFR-07).
 */

import { useState } from 'react';
import { Badge, ConfidenceBadge, VerificationBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { TextAreaField } from '@/components/ui/Field';
import { formatTime } from '@/lib/utils/misc';
import { glossLabel } from '@/lib/signs/vocabulary';
import { NO_VERIFIED_CLIP_MESSAGE } from '@/lib/phrases/matcher';
import type { ConversationMessage, MessageSource } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

const PARTY_META: Record<
  ConversationMessage['party'],
  { label: string; icon: IconName; align: string; bubble: string; accent: string }
> = {
  deaf_user: {
    label: 'Deaf user',
    icon: 'hand',
    align: 'items-start',
    bubble: 'bg-primary-soft border-primary',
    accent: 'text-primary',
  },
  hearing_user: {
    label: 'Hearing user',
    icon: 'mic',
    align: 'items-end',
    bubble: 'bg-accent-soft border-accent',
    accent: 'text-accent',
  },
  system: {
    label: 'SignSpeak',
    icon: 'info',
    align: 'items-center',
    bubble: 'bg-raised border-line',
    accent: 'text-muted',
  },
};

const SOURCE_LABEL: Record<MessageSource, string> = {
  sign_recognition: 'Recognised from signing',
  typed: 'Typed',
  speech_recognition: 'Spoken, then transcribed',
  phrase_board: 'From the phrase board',
  emergency: 'From Emergency mode',
  system: 'SignSpeak',
};

export interface MessageBubbleProps {
  message: ConversationMessage;
  /** Index within the feed, used to disable move-up on the first message. */
  index: number;
  total: number;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onToggleMisunderstood: (id: string) => void;
  onCorrectRecognition: (id: string) => void;
  onSpeak: (message: ConversationMessage) => void;
  onPlayClip: (message: ConversationMessage) => void;
  /** Obscures the content while "Hide conversation" is on. */
  hidden?: boolean;
}

export function MessageBubble({
  message,
  index,
  total,
  onEdit,
  onDelete,
  onMove,
  onToggleMisunderstood,
  onCorrectRecognition,
  onSpeak,
  onPlayClip,
  hidden = false,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const meta = PARTY_META[message.party];
  const recognition = message.recognition;

  const hasClip = message.delivery?.mode === 'isl_clip';

  return (
    <li className={cn('flex flex-col gap-1.5', meta.align)}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn('inline-flex items-center gap-1.5 font-semibold', meta.accent)}>
          <Icon name={meta.icon} size="1rem" />
          {meta.label}
        </span>
        <span className="text-muted">{formatTime(message.createdAt)}</span>
        <span className="text-faint">· {SOURCE_LABEL[message.source]}</span>
      </div>

      <div
        className={cn(
          'ss-bordered max-w-full rounded-2xl px-4 py-3 sm:max-w-[85%]',
          meta.bubble,
        )}
      >
        {editing ? (
          <div className="space-y-3">
            <TextAreaField
              label="Edit this message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                icon="check"
                onClick={() => {
                  onEdit(message.id, draft.trim());
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(message.text);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              'text-pretty text-xl leading-snug sm:text-2xl',
              hidden && 'select-none blur-sm',
            )}
            aria-hidden={hidden || undefined}
          >
            {message.text}
          </p>
        )}

        {hidden ? (
          <p className="mt-2 text-sm text-muted">
            Content hidden for privacy. Press “Show conversation” in the header to reveal it.
          </p>
        ) : null}

        {/* Badges: confidence, correction state, delivery, misunderstanding. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {recognition ? (
            <>
              <ConfidenceBadge
                band={recognition.band}
                probability={recognition.probability}
                showNumeric
              />
              {recognition.corrected ? (
                <Badge tone="neutral" icon="pencil">
                  Corrected by user
                </Badge>
              ) : recognition.reviewed ? (
                <Badge tone="success" icon="check">
                  Confirmed
                </Badge>
              ) : (
                <Badge tone="warning" icon="alert">
                  Not yet confirmed
                </Badge>
              )}
            </>
          ) : null}

          {message.party === 'hearing_user' && message.delivery ? (
            message.delivery.mode === 'isl_clip' ? (
              <VerificationBadge
                status={message.delivery.clipStatus ?? 'expert_verified'}
                className="!border-success"
              />
            ) : message.delivery.mode === 'text_only' ? (
              <Badge tone="warning" icon="alert">
                Shown as text only
              </Badge>
            ) : (
              <Badge tone="neutral" icon="clock">
                Delivering…
              </Badge>
            )
          ) : null}

          {message.misunderstood ? (
            <Badge tone="danger" icon="alert">
              Flagged as misunderstood
            </Badge>
          ) : null}

          {message.spoken ? (
            <Badge tone="neutral" icon="speaker">
              Spoken aloud
            </Badge>
          ) : null}
        </div>

        {/* FR-VIS-03: the exact wording required when no verified clip exists. */}
        {message.party === 'hearing_user' && message.delivery?.mode === 'text_only' ? (
          <p className="mt-2 text-sm text-muted">{NO_VERIFIED_CLIP_MESSAGE}</p>
        ) : null}

        {!editing ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recognition && !recognition.reviewed ? (
              <Button size="sm" variant="subtle" icon="pencil" onClick={() => onCorrectRecognition(message.id)}>
                Correct
              </Button>
            ) : null}
            {hasClip ? (
              <Button size="sm" variant="subtle" icon="play" onClick={() => onPlayClip(message)}>
                Replay ISL clip
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" icon="speaker" onClick={() => onSpeak(message)}>
              Speak
            </Button>
            <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="help"
              onClick={() => onToggleMisunderstood(message.id)}
              aria-pressed={message.misunderstood}
            >
              {message.misunderstood ? 'Clear flag' : 'Misunderstood?'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="chevron-up"
              disabled={index === 0}
              onClick={() => onMove(message.id, 'up')}
              aria-label={`Move "${message.text}" earlier in the conversation`}
            >
              Earlier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="chevron-down"
              disabled={index === total - 1}
              onClick={() => onMove(message.id, 'down')}
              aria-label={`Move "${message.text}" later in the conversation`}
            >
              Later
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              onClick={() => onDelete(message.id)}
              aria-label={`Delete "${message.text}"`}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Small helper used by the feed header to describe a recognition in one line. */
export function describeRecognition(message: ConversationMessage): string {
  if (!message.recognition) return '';
  const label = glossLabel(message.recognition.originalLabel);
  return `${label} · ${(message.recognition.probability * 100).toFixed(0)}% confidence`;
}

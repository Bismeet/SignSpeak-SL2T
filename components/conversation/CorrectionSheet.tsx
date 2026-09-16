'use client';

/**
 * Recognition correction sheet (FR-STT-06, docs/ui-ux-specification.md §3.6, UC5).
 *
 * Opens when the user taps a recognition chip. Offers the model's top alternatives with
 * their probabilities, plus free typing. Choosing an alternative or typing a replacement
 * marks the message as "corrected by user" in the conversation.
 *
 * The probabilities are shown deliberately: they let the user judge how close the call
 * was, which is exactly the honesty the requirements ask for.
 */

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TextField } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { glossLabel } from '@/lib/signs/vocabulary';
import { confidenceBand } from '@/lib/vision/decision';
import type { ConversationMessage } from '@/lib/types';

export interface CorrectionSheetProps {
  open: boolean;
  message: ConversationMessage | null;
  onClose: () => void;
  /** Replace the recognised word with `label`. */
  onChoose: (messageId: string, label: string) => void;
  /** Replace with free text typed by the user. */
  onType: (messageId: string, text: string) => void;
  /** Remove the message entirely. */
  onDelete: (messageId: string) => void;
}

export function CorrectionSheet({
  open,
  message,
  onClose,
  onChoose,
  onType,
  onDelete,
}: CorrectionSheetProps) {
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (open) setCustom('');
  }, [open, message?.id]);

  if (!message || !message.recognition) return null;

  const { recognition } = message;
  const band = confidenceBand(recognition.probability);
  const alternatives = recognition.alternatives.slice(0, 3);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Was this right?"
      description="Correcting a wrong word keeps the conversation accurate. Nothing is spoken until you press Speak."
      footer={
        <Button variant="secondary" block icon="arrow-left" onClick={onClose}>
          Keep as it is
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="ss-bordered rounded-2xl bg-raised p-4">
          <p className="text-sm text-muted">You signed</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold">
            <Icon name="hand" size="1.5rem" className="text-primary" />
            {glossLabel(recognition.originalLabel)}
            <Badge tone={band === 'high' ? 'success' : band === 'medium' ? 'warning' : 'danger'}>
              {(recognition.probability * 100).toFixed(0)}% confidence
            </Badge>
          </p>
          {recognition.corrected ? (
            <p className="mt-2 text-sm text-muted">
              You already corrected this to “{message.text}”.
            </p>
          ) : null}
        </div>

        <div>
          <p className="font-semibold">Did you mean one of these?</p>
          <p className="mt-1 text-sm text-muted">
            These are the alternatives the model considered, with how likely each one was.
          </p>
          <ul className="mt-3 grid gap-2">
            {alternatives.map((alternative) => {
              const isCurrent = alternative.label === recognition.originalLabel;
              return (
                <li key={alternative.label}>
                  <button
                    type="button"
                    onClick={() => {
                      onChoose(message.id, alternative.label);
                      onClose();
                    }}
                    className="ss-bordered flex min-h-touch w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left hover:bg-raised"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon name="hand" size="1.15rem" className="text-primary" />
                      {glossLabel(alternative.label)}
                      {isCurrent ? <span className="text-sm font-normal text-muted">(current)</span> : null}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-muted">
                      {(alternative.probability * 100).toFixed(0)}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-3">
          <TextField
            label="Or type what you meant"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="For example: medicine"
            hint="Typing always works, even when recognition cannot help."
          />
          <Button
            variant="primary"
            icon="check"
            disabled={custom.trim().length === 0}
            onClick={() => {
              onType(message.id, custom.trim());
              onClose();
            }}
          >
            Use this instead
          </Button>
        </div>

        <div className="border-t border-line pt-4">
          <Button
            variant="danger"
            icon="trash"
            onClick={() => {
              onDelete(message.id);
              onClose();
            }}
          >
            Delete this word
          </Button>
          <p className="mt-2 text-sm text-muted">
            Deleting removes the word from the conversation so a wrong prediction is never read
            out.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

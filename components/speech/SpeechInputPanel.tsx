'use client';

/**
 * Hearing-user input panel: speech-to-text with typing as the always-available fallback
 * (FR-ASR-01 to FR-ASR-05).
 *
 * Behaviours:
 *   - the microphone starts only on an explicit press;
 *   - the interim transcript is muted, the final transcript is editable;
 *   - when recognition is unsupported or denied, the microphone is disabled with an
 *     explanation and the textarea is focused automatically (UC6);
 *   - the disclosure that the browser vendor may receive audio is shown inline, not
 *     buried in a policy page (FR-ASR-05).
 */

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { ASR_PRIVACY_NOTICE } from '@/lib/speech/asr';
import { SUPPORTED_SPEECH_LANGUAGES } from '@/lib/speech/capabilities';
import type { UseAsrResult } from '@/lib/speech/use-asr';
import { cn } from '@/lib/utils/cn';

export interface SpeechInputPanelProps {
  asr: UseAsrResult;
  /**
   * Called with the text the hearing user wants to send, plus how it was produced, so the
   * conversation feed can label the message honestly.
   */
  onSend: (text: string, source: 'speech_recognition' | 'typed') => void;
  /** Clears the draft after a successful send. */
  onAfterSend?: () => void;
  className?: string;
}

export function SpeechInputPanel({ asr, onSend, onAfterSend, className }: SpeechInputPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const unsupported = asr.capabilities.support === 'unsupported';

  // UC6: when speech is unavailable, put the cursor straight in the textarea.
  useEffect(() => {
    if (unsupported || asr.error?.code === 'not-allowed') {
      textareaRef.current?.focus();
    }
  }, [unsupported, asr.error?.code]);

  const canSend = asr.transcript.trim().length > 0;

  function handleSend() {
    const text = asr.transcript.trim();
    if (!text) return;
    onSend(text, asr.lastInputWasSpeech ? 'speech_recognition' : 'typed');
    asr.reset();
    onAfterSend?.();
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-end gap-3">
        {/* Microphone button with explicit visual states. */}
        <div className="relative">
          {asr.listening ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-pulse-ring rounded-full bg-danger/45 motion-reduce:hidden"
            />
          ) : null}
          <button
            type="button"
            onClick={asr.listening ? asr.stop : asr.start}
            disabled={unsupported}
            aria-pressed={asr.listening}
            aria-describedby="asr-state"
            className={cn(
              'relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-2 transition-colors duration-150',
              unsupported
                ? 'cursor-not-allowed border-line bg-raised text-faint'
                : asr.listening
                  ? 'border-danger bg-danger text-danger-ink'
                  : 'border-primary bg-primary text-primary-ink hover:bg-primary-strong',
            )}
          >
            <Icon name={asr.listening ? 'stop' : 'mic'} size="2rem" />
            <span className="sr-only">
              {asr.listening ? 'Stop listening' : 'Start listening for speech'}
            </span>
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <p id="asr-state" className="font-semibold" role="status" aria-live="polite">
            {unsupported
              ? 'Speech recognition is not available here'
              : asr.listening
                ? 'Listening… speak now'
                : 'Press the microphone to speak'}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Or type below — typing always works, even without a microphone.
          </p>
        </div>
      </div>

      <SelectField
        label="Speech language"
        value={asr.language}
        onChange={(event) => asr.setLanguage(event.target.value)}
        disabled={asr.listening}
        options={SUPPORTED_SPEECH_LANGUAGES.map((language) => ({
          value: language.code,
          label: `${language.label} — ${language.nativeLabel} (${language.code})`,
        }))}
        hint="The language the hearing person will speak in."
      />

      {asr.interim ? (
        <p className="ss-bordered rounded-xl bg-raised px-3 py-2 text-lg text-muted" aria-hidden="true">
          {asr.interim}
        </p>
      ) : null}

      <TextAreaField
        label="Message to send"
        inputRef={textareaRef}
        value={asr.transcript}
        onChange={(event) => asr.setTranscript(event.target.value)}
        placeholder="The transcript appears here. Edit it before sending if anything looks wrong."
        rows={4}
        hint="Check the transcript before sending. Speech recognition mishears words, especially in a noisy ward."
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon="arrow-right" disabled={!canSend} onClick={handleSend}>
          Send message
        </Button>
        <Button
          variant="ghost"
          icon="trash"
          disabled={asr.transcript.length === 0 && !asr.error}
          onClick={asr.reset}
        >
          Clear
        </Button>
      </div>

      {unsupported ? (
        <Callout tone="warning" icon="mic-off" title="This browser cannot recognise speech">
          {asr.capabilities.reason} Typing is fully supported and gives the same result: your message
          is matched against the curated phrase list exactly the same way.
        </Callout>
      ) : null}

      {asr.error ? (
        <Callout
          tone={asr.error.code === 'not-allowed' ? 'danger' : 'warning'}
          icon="alert"
          title={asr.error.message}
          assertive
          actions={
            asr.error.retryable ? (
              <Button size="sm" variant="secondary" icon="refresh" onClick={asr.start}>
                Try again
              </Button>
            ) : undefined
          }
        >
          {asr.error.remedy}
        </Callout>
      ) : null}

      <Callout tone="neutral" icon="shield" title="Where your speech goes">
        {ASR_PRIVACY_NOTICE}
      </Callout>
    </div>
  );
}

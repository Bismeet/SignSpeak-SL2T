'use client';

/**
 * Text-to-speech controls (FR-SPK-01 to FR-SPK-04).
 *
 * Play, Stop and Repeat, plus the language/voice that will be used. The text being spoken
 * is always shown in large type next to the controls, so the feature degrades to a large
 * readable display when no voice is installed (FR-SPK-04).
 */

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { SelectField } from '@/components/ui/Field';
import { SUPPORTED_SPEECH_LANGUAGES } from '@/lib/speech/capabilities';
import { useSettings } from '@/lib/state/settings';
import type { UseSpeakerResult } from '@/lib/speech/use-speaker';
import { cn } from '@/lib/utils/cn';

export interface SpeakControlsProps {
  speaker: UseSpeakerResult;
  /** The text that will be spoken. */
  text: string;
  /** Shown above the buttons, e.g. "Speak this to the nurse". */
  label?: string;
  /** Optional callback when the user presses Speak, e.g. to mark the message as spoken. */
  onSpoken?: () => void;
  className?: string;
  /** Hide the language selector in tight layouts (it is still in Settings). */
  showLanguageSelector?: boolean;
}

export function SpeakControls({
  speaker,
  text,
  label = 'Speak this aloud',
  onSpoken,
  className,
  showLanguageSelector = true,
}: SpeakControlsProps) {
  const { settings, update } = useSettings();
  const trimmed = text.trim();
  const disabled = trimmed.length === 0;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{label}</p>
        <span className="text-sm text-muted">
          {speaker.supported ? 'Text-to-speech available' : 'Text-to-speech unavailable'}
        </span>
      </div>

      {/* The text is always visible in large type. */}
      <p
        className="ss-bordered rounded-2xl bg-raised px-4 py-3 text-pretty text-xl font-medium leading-snug"
        lang={settings.ttsLanguage.startsWith('hi') ? 'hi' : 'en'}
      >
        {trimmed.length > 0 ? trimmed : <span className="text-muted">Nothing to speak yet.</span>}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon="speaker"
          disabled={disabled || !speaker.supported}
          onClick={() => {
            void speaker.speak(trimmed);
            onSpoken?.();
          }}
        >
          Speak
        </Button>
        <Button
          variant="secondary"
          icon="stop"
          disabled={!speaker.speaking}
          onClick={speaker.stop}
          aria-label="Stop speaking"
        >
          Stop
        </Button>
        <Button
          variant="secondary"
          icon="repeat"
          disabled={disabled || !speaker.supported}
          onClick={() => {
            void speaker.repeat();
          }}
        >
          Repeat
        </Button>

        {speaker.speaking ? (
          <span
            className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-sm font-semibold text-success"
            role="status"
            aria-live="polite"
          >
            <Icon name="speaker" size="1rem" />
            Speaking…
          </span>
        ) : null}
      </div>

      {showLanguageSelector ? (
        <SelectField
          label="Spoken language"
          value={settings.ttsLanguage}
          onChange={(event) => update('ttsLanguage', event.target.value)}
          hint="Used for every phrase you speak aloud. Hindi needs a Hindi voice installed on this device."
          options={SUPPORTED_SPEECH_LANGUAGES.map((language) => ({
            value: language.code,
            label: `${language.label} (${language.code})`,
          }))}
        />
      ) : null}

      {!speaker.supported ? (
        <Callout tone="warning" icon="volume-off" title="Audio is not available in this browser">
          The text above stays on screen in large type so you can show it to the other person.
        </Callout>
      ) : null}

      {speaker.missingVoiceForLanguage ? (
        <Callout tone="warning" icon="volume-off" title="No voice installed for this language">
          No {settings.ttsLanguage} voice was found on this device, so a different voice will read
          the text. The text is always shown on screen as well.
        </Callout>
      ) : null}

      {speaker.notice ? (
        <Callout tone="neutral" icon="info">
          {speaker.notice}
        </Callout>
      ) : null}

      {speaker.error ? (
        <Callout tone="danger" icon="alert" title="Speech failed" assertive>
          {speaker.error}
        </Callout>
      ) : null}
    </div>
  );
}

'use client';

/**
 * Doctor communication panel (docs/ui-ux-specification.md §3.2, wireframe media_1789848449713.png).
 *
 * Provides:
 * - 3D robot preview box / ISL animation area with honest limitation notice.
 * - Exactly five configurable hospital phrase cards.
 * - Selected phrase state and Play Sign button.
 * - Animation states (idle, loading, playing, completed, stop/reset, replay).
 * - Transcript integration (adds played phrase to shared transcript).
 * - Audio speech-to-text / typing fallback options for hearing doctors.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ClipPlayer } from '@/components/phrases/ClipPlayer';
import { PHRASE_MATCHER, clipAvailability } from '@/lib/phrases/data';
import type { Phrase } from '@/lib/types';
import type { UseAsrResult } from '@/lib/speech/use-asr';
import { SpeechInputPanel } from '@/components/speech/SpeechInputPanel';
import { cn } from '@/lib/utils/cn';

export interface DoctorPhraseItem {
  id: string;
  textEn: string;
  textHi: string;
  category?: string;
}

export const DEFAULT_DOCTOR_PHRASES: DoctorPhraseItem[] = [
  {
    id: 'q_where_hurt',
    textEn: 'Where does it hurt?',
    textHi: 'दर्द कहाँ है?',
  },
  {
    id: 'q_pain_scale',
    textEn: 'How much pain, from 0 to 10?',
    textHi: 'दर्द कितना है, 0 से 10 में?',
  },
  {
    id: 'i_deep_breath',
    textEn: 'Take a deep breath',
    textHi: 'गहरी साँस लीजिए',
  },
  {
    id: 'c_medicine_now',
    textEn: 'I am giving you medicine now',
    textHi: 'मैं अब आपको दवा दे रहा हूँ',
  },
  {
    id: 'i_wait_here',
    textEn: 'Please wait here',
    textHi: 'कृपया यहाँ प्रतीक्षा कीजिए',
  },
];

export interface DoctorPanelProps {
  onSendMessage: (text: string, phrase?: Phrase) => void;
  onOpenPhraseBoard?: () => void;
  asr?: UseAsrResult;
  className?: string;
}

export function DoctorPanel({
  onSendMessage,
  onOpenPhraseBoard,
  asr,
  className,
}: DoctorPanelProps) {
  const [selectedItem, setSelectedItem] = useState<DoctorPhraseItem | null>(null);
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'completed'>('idle');
  const [showSpeechFallback, setShowSpeechFallback] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Resolve full Phrase object if found in curated phrases
  const resolvedPhrase = selectedItem
    ? PHRASE_MATCHER.all().find((p) => p.id === selectedItem.id) ??
      PHRASE_MATCHER.match(selectedItem.textEn, { includeUnverified: true }).phrase
    : null;

  const hasVerifiedClip = resolvedPhrase
    ? clipAvailability(resolvedPhrase) === 'verified_clip'
    : false;

  const handleSelectAndPlayPhrase = useCallback(
    (item: DoctorPhraseItem) => {
      // Clear previous timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setSelectedItem(item);
      setPlaybackState('playing');

      const phrase =
        PHRASE_MATCHER.all().find((p) => p.id === item.id) ??
        PHRASE_MATCHER.match(item.textEn, { includeUnverified: true }).phrase;

      const hasClip = phrase ? clipAvailability(phrase) === 'verified_clip' : false;

      // Add to conversation transcript immediately (no confirmation needed)
      onSendMessage(item.textEn, phrase ?? undefined);

      if (hasClip) {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          void videoRef.current.play().catch((error) => {
            console.warn('[SignSpeak] Video playback error:', error);
          });
        }
      } else {
        // Fallback simulation for unverified phrase
        timerRef.current = setTimeout(() => {
          setPlaybackState('completed');
          timerRef.current = null;
        }, 2800);
      }
    },
    [onSendMessage],
  );

  // Auto-play whenever a new item with verified clip is selected
  useEffect(() => {
    if (selectedItem && hasVerifiedClip && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [selectedItem?.id, hasVerifiedClip]);

  const handlePlaySign = useCallback(() => {
    if (!selectedItem) return;

    // Prevent overlapping animations
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setPlaybackState('playing');

    // Add the phrase to the conversation transcript
    onSendMessage(selectedItem.textEn, resolvedPhrase ?? undefined);

    if (hasVerifiedClip && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch((error) => {
        console.warn('[SignSpeak] Video playback error:', error);
      });
    } else if (!hasVerifiedClip) {
      // If there is no verified video clip, show honest signing/presentation state for ~2.8s
      timerRef.current = setTimeout(() => {
        setPlaybackState('completed');
        timerRef.current = null;
      }, 2800);
    }
  }, [selectedItem, resolvedPhrase, hasVerifiedClip, onSendMessage]);

  const handleStopReset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setPlaybackState('idle');
  }, []);

  return (
    <div className={cn('space-y-4', className)}>
      {/* 3D Robot Preview Box / ISL Animation Box */}
      <div className="relative flex aspect-4/3 min-h-[260px] w-full flex-col overflow-hidden rounded-2xl border border-[#D8CFBA] bg-[#E7E2D6] p-4 text-[#292D38]">
        {/* Top bar inside preview: Status badge */}
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-[#F4EFEA]/90 px-2.5 py-1 text-xs font-semibold text-[#596F57] shadow-2xs">
            <Icon name="bot" size="0.95rem" />
            <span>Robot Preview</span>
          </div>

          {selectedItem ? (
            <Badge
              tone={hasVerifiedClip ? 'success' : 'warning'}
              icon={hasVerifiedClip ? 'badge-check' : 'alert'}
            >
              {hasVerifiedClip ? 'Verified ISL clip' : 'Text only · No verified clip'}
            </Badge>
          ) : (
            <span className="text-xs text-[#71856A]">Ready for phrase</span>
          )}
        </div>

        {/* Center content */}
        <div className="my-auto flex flex-col items-center justify-center text-center">
          {!selectedItem ? (
            /* Idle Wireframe State */
            <>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F4EFEA]/80 text-[#596F57] shadow-xs">
                <Icon name="bot" size="1.75rem" />
              </div>
              <h3 className="text-base font-semibold text-[#292D38]">3D robot preview</h3>
              <p className="mt-1 text-sm text-[#71856A]">ISL animation plays here</p>
            </>
          ) : hasVerifiedClip && resolvedPhrase ? (
            /* Verified Animation Video State */
            <div className="flex flex-col items-center w-full max-w-sm space-y-2 px-1">
              <div className="relative w-full overflow-hidden rounded-xl border border-[#71856A]/40 bg-black shadow-xs aspect-video max-h-[175px]">
                <video
                  ref={videoRef}
                  key={resolvedPhrase.clip.src}
                  src={
                    resolvedPhrase.clip.src.startsWith('/')
                      ? resolvedPhrase.clip.src
                      : `/clips/${resolvedPhrase.clip.src}`
                  }
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  onPlay={() => setPlaybackState('playing')}
                  onEnded={() => setPlaybackState('completed')}
                  className="h-full w-full object-contain"
                  aria-label={`ISL animation for: ${selectedItem.textEn}`}
                />
                {playbackState === 'completed' ? (
                  <button
                    type="button"
                    onClick={handlePlaySign}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 hover:bg-black/25 text-white transition-colors cursor-pointer group"
                    aria-label="Replay animation"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#596F57] text-white shadow-md group-hover:scale-105 transition-transform">
                      <Icon name="repeat" size="1.3rem" />
                    </div>
                    <span className="mt-2 text-xs font-semibold drop-shadow-sm">Replay Animation</span>
                  </button>
                ) : null}
              </div>

              {/* Phrase text - stays visible while playing */}
              <div className="w-full rounded-xl border border-[#D8CFBA]/80 bg-[#FAF6EE] p-2 shadow-2xs text-center">
                <p className="text-base font-bold text-[#292D38] leading-tight">
                  “{selectedItem.textEn}”
                </p>
                {selectedItem.textHi ? (
                  <p className="mt-0.5 text-xs font-medium text-[#71856A]">
                    {selectedItem.textHi}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            /* Selected Phrase State without verified clip (honest text fallback) */
            <div className="w-full max-w-sm space-y-3 px-2">
              {/* Robot Avatar Illustration / Animation state */}
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-[#D8CFBA]/60 bg-[#F4EFEA] text-[#596F57] shadow-xs">
                <Icon
                  name="bot"
                  size="2.5rem"
                  className={cn(
                    'transition-transform duration-300',
                    playbackState === 'playing' && 'scale-110 text-[#3F5745] animate-pulse',
                  )}
                />
                {playbackState === 'playing' ? (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#596F57] opacity-75" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-[#3F5745]" />
                  </span>
                ) : null}
              </div>

              {/* Phrase text - stays visible while playing */}
              <div className="rounded-xl border border-[#D8CFBA]/80 bg-[#FAF6EE] p-3 shadow-2xs">
                <p className="text-lg font-bold text-[#292D38] leading-tight">
                  “{selectedItem.textEn}”
                </p>
                {selectedItem.textHi ? (
                  <p className="mt-1 text-sm font-medium text-[#71856A]">
                    {selectedItem.textHi}
                  </p>
                ) : null}
              </div>

              {/* Honest limitation notice */}
              <p className="text-xs text-[#71856A] italic">
                {playbackState === 'playing'
                  ? 'Playing simulation… No verified ISL animation exists for this phrase.'
                  : 'No verified ISL animation available yet — shown as text only.'}
              </p>
            </div>
          )}
        </div>

        {/* Playback progress bar while playing */}
        {playbackState === 'playing' ? (
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-[#D8CFBA] overflow-hidden">
            <div className="h-full bg-[#596F57] animate-[pulse_1.5s_ease-in-out_infinite]" />
          </div>
        ) : null}
      </div>

      {/* Five Configurable Phrase Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#71856A]">
          <span>Clinical Phrases</span>
          {onOpenPhraseBoard ? (
            <button
              type="button"
              onClick={onOpenPhraseBoard}
              className="text-[#596F57] hover:underline cursor-pointer"
            >
              All phrases →
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2">
          {DEFAULT_DOCTOR_PHRASES.map((phrase) => {
            const isSelected = selectedItem?.id === phrase.id;
            return (
              <button
                key={phrase.id}
                type="button"
                onClick={() => handleSelectAndPlayPhrase(phrase)}
                className={cn(
                  'flex items-center justify-between rounded-xl border p-2.5 text-left transition-all cursor-pointer',
                  isSelected
                    ? 'border-[#596F57] bg-[#FAF6EE] shadow-2xs ring-2 ring-[#596F57]/20 font-semibold text-[#292D38]'
                    : 'border-[#D8CFBA]/70 bg-[#F4EFEA]/70 hover:border-[#596F57]/40 hover:bg-[#FAF6EE] text-[#292D38]/90',
                )}
                aria-pressed={isSelected}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{phrase.textEn}</p>
                  <p className="truncate text-xs text-[#71856A]">{phrase.textHi}</p>
                </div>
                <div
                  className={cn(
                    'ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                    isSelected
                      ? 'border-[#596F57] bg-[#596F57] text-white'
                      : 'border-[#D8CFBA] bg-[#FAF6EE] text-[#71856A]',
                  )}
                >
                  {isSelected ? (
                    playbackState === 'playing' ? (
                      <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                    ) : (
                      <Icon name="check" size="0.8rem" />
                    )
                  ) : (
                    <Icon name="play" size="0.7rem" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Action Button matching wireframe */}
      <div className="space-y-2">
        {!selectedItem ? (
          <Button
            variant="secondary"
            size="lg"
            block
            disabled
            className="!bg-[#E7E2D6] !border-[#D8CFBA] !text-[#71856A] py-3 font-semibold rounded-xl"
          >
            Choose a phrase
          </Button>
        ) : playbackState === 'playing' ? (
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="lg"
              block
              icon="stop"
              onClick={handleStopReset}
              className="!bg-[#C77D60] hover:!bg-[#b56f54] text-white py-3 font-semibold rounded-xl flex-1"
            >
              Stop / Reset
            </Button>
          </div>
        ) : playbackState === 'completed' ? (
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="lg"
              icon="repeat"
              onClick={handlePlaySign}
              className="!bg-[#596F57] hover:!bg-[#475b45] text-white py-3 font-semibold rounded-xl flex-1"
            >
              Replay Sign
            </Button>
            <Button
              variant="secondary"
              size="lg"
              icon="refresh"
              onClick={handleStopReset}
              className="py-3 font-semibold rounded-xl"
            >
              Reset
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            icon="play"
            onClick={handlePlaySign}
            className="!bg-[#596F57] hover:!bg-[#475b45] text-white py-3 font-semibold rounded-xl shadow-xs"
          >
            Play Sign
          </Button>
        )}
      </div>

      {/* Optional Doctor Speech / Typing Fallback toggle */}
      {asr ? (
        <div>
          <button
            type="button"
            onClick={() => setShowSpeechFallback((prev) => !prev)}
            className="text-xs text-[#71856A] hover:text-[#292D38] hover:underline cursor-pointer flex items-center gap-1"
          >
            <Icon name={showSpeechFallback ? 'chevron-up' : 'mic'} size="0.85rem" />
            {showSpeechFallback ? 'Hide doctor mic/typing' : 'Speak or type custom text instead'}
          </button>

          {showSpeechFallback ? (
            <div className="mt-3 rounded-2xl border border-[#D8CFBA] bg-[#FAF6EE] p-3">
              <SpeechInputPanel
                asr={asr}
                onSend={(text) => onSendMessage(text)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

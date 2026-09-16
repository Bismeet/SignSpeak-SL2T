'use client';

/**
 * ISL clip player (FR-VIS-01 to FR-VIS-04).
 *
 * Hard rules encoded here:
 *   - only `expert_verified` clips are presented as ISL by default;
 *   - a draft clip is shown with a permanent, unmissable "NOT VERIFIED" banner and is
 *     never described as ISL;
 *   - when there is no clip, the player shows the text plus the exact required message
 *     "No verified ISL video for this phrase" — it never invents or concatenates signs;
 *   - every clip carries its caption, verifier and licence;
 *   - a YouTube embed is click-to-load, so no third-party request happens until the user
 *     asks for it.
 */

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { NO_VERIFIED_CLIP_MESSAGE } from '@/lib/phrases/matcher';
import { clipAvailability } from '@/lib/phrases/data';
import type { Phrase } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

export interface ClipPlayerProps {
  phrase: Phrase;
  /** Language for the large caption fallback. */
  language?: 'en' | 'hi';
  /** Rendered under the player, e.g. a Speak button. */
  actions?: React.ReactNode;
  className?: string;
  /** Autoplay is off by default: nothing plays without a user action. */
  autoPlay?: boolean;
}

export function ClipPlayer({
  phrase,
  language = 'en',
  actions,
  className,
  autoPlay = false,
}: ClipPlayerProps) {
  const availability = clipAvailability(phrase);
  const [videoError, setVideoError] = useState(false);
  const [embedRequested, setEmbedRequested] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setVideoError(false);
    setEmbedRequested(false);
  }, [phrase.id]);

  const caption = phrase.caption.trim() || phrase.textEn;
  const captionHi = phrase.textHi.trim();
  const primaryText = language === 'hi' && captionHi ? captionHi : phrase.textEn;

  /* ---------------------------------------------------------------------------------
   * No clip at all — the honest default in this build.
   * ------------------------------------------------------------------------------- */

  if (availability === 'no_clip' || phrase.clip.type === 'none') {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="ss-bordered rounded-2xl border-warning bg-warning-soft p-4">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <Icon name="alert" size="1.2rem" />
            {NO_VERIFIED_CLIP_MESSAGE}
          </p>
          <p className="mt-2 text-pretty text-sm text-muted">
            No qualified ISL signer has verified a video for this phrase yet. SignSpeak does not
            invent a sign, and it does not assemble English word clips and call that ISL — the word
            order and grammar would be wrong.
          </p>
        </div>

        <div className="ss-bordered rounded-2xl bg-surface p-4">
          <p className="text-sm font-semibold text-muted">Shown as text instead</p>
          <p className="mt-1 text-pretty text-2xl font-semibold leading-snug">{primaryText}</p>
          {captionHi && language === 'en' ? (
            <p className="mt-2 text-pretty text-lg text-muted" lang="hi">
              {captionHi}
            </p>
          ) : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------------------
   * A clip exists.
   * ------------------------------------------------------------------------------- */

  const isVerified = availability === 'verified_clip';

  return (
    <div className={cn('space-y-3', className)}>
      {!isVerified ? (
        <div className="flex items-center gap-2 rounded-2xl bg-danger px-3 py-2.5 text-danger-ink" role="alert">
          <Icon name="alert" size="1.3rem" />
          <p className="font-bold">
            NOT VERIFIED — this is a development placeholder, not ISL
          </p>
        </div>
      ) : (
        <Badge tone="success" icon="badge-check">
          Verified ISL clip
        </Badge>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-ink/90">
        {phrase.clip.type === 'youtube' ? (
          embedRequested ? (
            <div className="aspect-video">
              <iframe
                title={`ISL clip for: ${caption}`}
                src={`https://www.youtube-nocookie.com/embed/${phrase.clip.src}${
                  phrase.clip.startSeconds ? `?start=${Math.floor(phrase.clip.startSeconds)}` : ''
                }`}
                allow="accelerometer; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <Icon name="video" size="2.2rem" />
              <p className="text-lg font-semibold">This clip is hosted on YouTube</p>
              <p className="max-w-sm text-sm opacity-90">
                Loading it will contact YouTube. SignSpeak does not request anything from third
                parties until you ask.
              </p>
              <Button variant="secondary" icon="play" onClick={() => setEmbedRequested(true)}>
                Load the clip
              </Button>
            </div>
          )
        ) : videoError ? (
          <div className="flex aspect-camera flex-col items-center justify-center gap-2 p-6 text-center text-white">
            <Icon name="alert" size="2rem" />
            <p className="text-lg font-semibold">Video unavailable</p>
            <p className="max-w-sm text-sm opacity-90">
              The clip file could not be played. The phrase text is shown below so the
              conversation can continue.
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={phrase.clip.src}
            controls
            autoPlay={autoPlay}
            playsInline
            preload="metadata"
            onError={() => setVideoError(true)}
            className="aspect-camera w-full bg-ink"
            aria-label={`ISL video for: ${caption}`}
          >
            <track kind="captions" label={caption} default />
          </video>
        )}
      </div>

      {/* Caption is always present, even when the video plays (accessibility §4). */}
      <div className="ss-bordered rounded-2xl bg-surface p-4">
        <p className="text-sm font-semibold text-muted">Caption</p>
        <p className="mt-1 text-pretty text-2xl font-semibold leading-snug">{caption}</p>
        {captionHi ? (
          <p className="mt-2 text-pretty text-lg text-muted" lang="hi">
            {captionHi}
          </p>
        ) : null}

        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="font-semibold text-muted">Verified by</dt>
            <dd>{phrase.validation.verifiedBy || 'Not verified'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-muted">Date</dt>
            <dd>{phrase.validation.verifiedOn || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-muted">Licence</dt>
            <dd>{phrase.licence || 'Not stated'}</dd>
          </div>
          {phrase.islGloss ? (
            <div className="flex gap-2">
              <dt className="font-semibold text-muted">ISL gloss</dt>
              <dd className="font-mono text-xs">{phrase.islGloss}</dd>
            </div>
          ) : null}
        </dl>

        {phrase.attribution ? (
          <p className="mt-2 text-sm text-muted">{phrase.attribution}</p>
        ) : null}

        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      {!isVerified ? (
        <Callout tone="danger" icon="alert" title="Why you are seeing this" assertive>
          Draft clips are hidden by default. This one is visible because “Show unverified phrases”
          is switched on in Settings. Turn it off to hide draft and unverified content.
        </Callout>
      ) : null}
    </div>
  );
}

'use client';

/**
 * Wabi-Sabi & Doodle Art Home Hero.
 *
 * Full visual presentation:
 * - Single continuous illustration (/hero-wabi-sabi-bg.jpg) with zero smoke, cuts, or artificial overlays.
 * - Left edge: Complete organic eucalyptus leaves, sage blob & terracotta corner art.
 * - Right edge: Complete conversation scene with 100% opacity (signing patient, her chair,
 *   lush background plant, floating leaf doodles, doctor with stethoscope, desk, clipboard,
 *   speech bubbles, hanging eucalyptus, and bottom ink sprig).
 * - Center: Seamless Warm Beige paper canvas (#F1E8D8) hosting large, bold, prominent headline,
 *   subheading, Bamboo Sage CTA, and trust badges.
 * - Single-Screen Fit: Perfectly calibrated to fit 100% on one screen without scrolling on compact laptop
 *   and desktop displays.
 *
 * Palette:
 * - Warm Beige: #F1E8D8 (background)
 * - Bamboo Sage: #71856A (primary green)
 * - Deep Bamboo: #3F5745 (dark green hover & accents)
 * - Natural Sand: #D5C4A8 (borders & subtle surfaces)
 * - Charcoal: #292D38 (text)
 * - Terracotta: #C77D60 (warm accent)
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { config } from '@/lib/config';

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-heading"
      className="relative w-full h-[calc(100vh-3.25rem)] min-h-[380px] bg-[#F1E8D8] flex items-center overflow-hidden transition-colors duration-200"
    >
      {/* Hero backdrop: eager + fetchpriority high — it is the LCP element.
          Deliberately a plain <img>, not next/image: `images.unoptimized` + static
          export means next/image adds runtime machinery but does no resizing; the
          pre-encoded 1600px mozjpeg in public/ is already optimal. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-wabi-sabi-bg.jpg"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-2 sm:px-6 sm:py-3 lg:px-8">
        <div className="max-w-md sm:max-w-xl lg:max-w-2xl xl:max-w-3xl pl-2 sm:pl-4 lg:pl-6">
          {/* Doodle botanical sketch & Eyebrow */}
          <div className="flex items-center gap-1.5">
            <svg
              className="h-4 w-4 text-[#71856A] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" opacity="0.3" />
              <path d="M12 6c-2 2-3 5-3 8" />
              <path d="M12 10c2-1 4-2 5-1" />
              <path d="M12 14c-1.5 1-3 1.5-4 1" />
            </svg>
            <p className="font-serif text-[17px] sm:text-[19px] font-semibold tracking-wide text-[#3F5745]">
              Communication without barriers
            </p>
          </div>

          {/* Headline - large, bold, prominent typography */}
          <h1
            id="home-heading"
            className="mt-1.5 sm:mt-2 font-serif text-[29px] sm:text-[35px] lg:text-[43px] xl:text-[47px] font-bold text-[#292D38] leading-[1.14] tracking-tight"
          >
            <span className="block whitespace-nowrap">Every conversation deserves</span>
            <span>to be </span>
            <span className="relative inline-block text-[#71856A] italic font-serif mt-0.5">
              understood.
              {/* Hand-drawn wavy doodle underline */}
              <svg
                className="absolute -bottom-1 left-0 w-full text-[#71856A]"
                viewBox="0 0 260 16"
                fill="none"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M4 11C60 4 125 14 195 7C220 5 245 9 256 10"
                  stroke="currentColor"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          {/* Subheading */}
          <p className="mt-2 sm:mt-2.5 max-w-md text-[17px] sm:text-[19px] md:text-[20px] leading-relaxed text-[#292D38]/85 font-normal">
            SignSpeak helps deaf and hearing people communicate through Indian Sign Language,
            text, and speech — with a focus on hospital and emergency situations.
          </p>

          {/* CTA Buttons - prominent, tactile, high contrast */}
          <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              href="/talk/"
              prefetch={true}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#71856A] hover:bg-[#3F5745] text-white px-6 py-2.5 sm:px-7 sm:py-3 text-xs sm:text-sm md:text-base font-semibold shadow-md transition-all duration-150 hover:shadow-lg active:scale-[0.98] cursor-pointer"
            >
              <span>Start a conversation</span>
              <span aria-hidden="true" className="text-base leading-none">&rarr;</span>
            </Link>

            <Link
              href="/help"
              className="inline-flex items-center gap-2.5 rounded-full px-3 py-2 text-xs sm:text-sm md:text-base font-semibold text-[#292D38] hover:text-[#3F5745] transition-colors"
            >
              <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-[#71856A] text-white shadow-xs">
                <svg className="h-3.5 w-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span>Watch how it works</span>
            </Link>
          </div>

          {/* Trust Badges */}
          <div className="mt-3 sm:mt-3.5 border-t border-[#D5C4A8]/80 pt-2 sm:pt-2.5 max-w-md">
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-[13px] font-medium text-[#292D38]/85">
              <li className="inline-flex items-center gap-1.5">
                <Icon name="shield" size="1.05rem" className="text-[#292D38]" />
                <span>Privacy conscious</span>
              </li>

              <li className="inline-flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-[#C77D60]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span>Made for real people</span>
              </li>

              <li className="inline-flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-[#71856A]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                </svg>
                <span>Clear about limitations</span>
              </li>
            </ul>
          </div>

          {/* Standing safety statement note */}
          <p className="mt-1.5 text-[11px] sm:text-xs text-[#292D38]/65 leading-tight max-w-md">
            <span className="font-semibold text-[#292D38]">SignSpeak is a communication aid</span>, not a medical device. In an emergency call{' '}
            <strong className="text-[#292D38] font-semibold">{config.emergencyNumber}</strong>.
          </p>
        </div>
      </div>
    </section>
  );
}

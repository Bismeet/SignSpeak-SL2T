'use client';

/**
 * Wabi-Sabi & Doodle Art "How SignSpeak works" section.
 *
 * Uses the hand-drawn illustration (/how-it-works-wabi-sabi.png) explaining the
 * 3-step conversation loop:
 * 01. Sign or type (deaf user at camera, types, or picks phrase)
 * 02. Speak or type (hearing person speaks or types)
 * 03. Understand (reply shown as text or verified ISL clip)
 * Plus the honest limitation notice and doodle details.
 */

import Image from 'next/image';

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="relative w-full bg-[#F1E8D8] pt-6 sm:pt-8 overflow-hidden transition-colors duration-200"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 700px' }}
    >
      {/* Chapter Eyebrow Tag */}
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 pb-2">
        <div className="h-[1px] w-10 sm:w-16 bg-[#D5C4A8]" />
        <span className="font-serif text-xs uppercase tracking-widest text-[#3F5745] font-semibold">
          Chapter 01 · The Three-Step Loop
        </span>
        <div className="h-[1px] w-10 sm:w-16 bg-[#D5C4A8]" />
      </div>

      {/* Full-bleed illustrated explainer graphic. Below the fold: lazy + async decode. */}
      <div className="w-full">

        <Image
          src="/how-it-works-wabi-sabi.jpg"
          alt="How SignSpeak works: Three simple steps, one shared conversation. Step 1: Sign or type (The deaf user signs at the camera, types, or selects a phrase from the board). Step 2: Speak or type (The hearing person speaks or types and reviews the message). Step 3: Understand (The reply is shown as text or a verified ISL clip when available). Limitation note: Sign recognition and ISL videos are limited, and SignSpeak does not replace a qualified interpreter."
          width={1600}
          height={800}
          sizes="100vw"
          className="w-full h-auto block"
          loading="lazy"
          fetchPriority="low"
        />

      </div>



        {/* Screen-reader accessible semantic transcript */}
        <div className="sr-only">
          <h2 id="how-it-works-heading">How SignSpeak works</h2>
          <p>Three simple steps, one shared conversation.</p>
          <ol>
            <li>
              <h3>01. Sign or type</h3>
              <p>The deaf user signs at the camera, types, or selects a phrase from the board.</p>
            </li>
            <li>
              <h3>02. Speak or type</h3>
              <p>The hearing person speaks or types and reviews the message.</p>
            </li>
            <li>
              <h3>03. Understand</h3>
              <p>The reply is shown as text or a verified ISL clip when available.</p>
            </li>
          </ol>
          <p>
            We&apos;re honest about what&apos;s available: Sign recognition and ISL videos are limited, and
            SignSpeak does not replace a qualified interpreter.
          </p>
        </div>
    </section>
  );
}

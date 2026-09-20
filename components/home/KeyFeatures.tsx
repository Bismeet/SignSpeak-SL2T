'use client';

/**
 * Wabi-Sabi & Doodle Art "Key Features" section.
 *
 * Full-bleed illustrated showcase presenting:
 * - "More ways to communicate. A more inclusive world."
 * - 6 Key Features:
 *   1. Indian Sign Language Recognition (Detects and understands ISL gestures in real time)
 *   2. Text & Speech Support (Convert between speech, text, and ISL for smooth conversations)
 *   3. Emergency Mode (Quick access to essential phrases when every second matters)
 *   4. Built for Real People (Designed for hospitals, clinics, public spaces, and everyday use)
 *   5. Privacy First (Your conversations stay private and secure)
 *   6. More Inclusive Spaces (Helping create a kinder, more accessible society for everyone)
 * - Philosophy callout: "Technology is a bridge. People make it meaningful."
 * - Doodle annotations: "Different People Brighter Conversations <3", "People Understand People", "Small Steps Big Change <3"
 */

import Image from 'next/image';

export function KeyFeatures() {
  return (
    <section
      id="key-features"
      aria-labelledby="key-features-heading"
      className="relative w-full bg-[#F1E8D8] pt-6 sm:pt-10 overflow-hidden transition-colors duration-200"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 700px' }}
    >
      {/* Narrative Bridge: Transition from Real-World Situations to Core Capabilities */}
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 pb-4 sm:pb-6 text-center">
        {/* Subtle doodle connector trail */}
        <div className="flex items-center gap-2 text-[#71856A]">
          <span className="h-1 w-1 rounded-full bg-[#71856A]/60" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#71856A]" />
          <span className="h-2 w-2 rounded-full bg-[#71856A]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#71856A]" />
          <span className="h-1 w-1 rounded-full bg-[#71856A]/60" />
        </div>

        {/* Chapter marker */}
        <div className="mt-3 flex items-center justify-center gap-3">
          <div className="h-[1px] w-10 sm:w-16 bg-[#D5C4A8]" />
          <span className="font-serif text-xs uppercase tracking-widest text-[#3F5745] font-semibold">
            Chapter 03 · Core Capabilities
          </span>
          <div className="h-[1px] w-10 sm:w-16 bg-[#D5C4A8]" />
        </div>

        {/* Narrative connecting text */}
        <p className="mt-1.5 font-serif text-xs sm:text-sm italic text-[#292D38]/70 max-w-md">
          Behind every simple conversation is thoughtful technology built for people.
        </p>
      </div>

      {/* Full-bleed illustrated graphic */}
      <div className="w-full">

        <Image
          src="/key-features.jpg"
          alt="Key Features: More ways to communicate. A more inclusive world. SignSpeak brings together sign language, text, and speech to make communication simpler, faster, and more human. Features: 1. Indian Sign Language Recognition (Detects and understands ISL gestures in real time). 2. Text & Speech Support (Convert between speech, text, and ISL for smooth conversations). 3. Emergency Mode (Quick access to essential phrases when every second matters). 4. Built for Real People (Designed for hospitals, clinics, public spaces, and everyday use). 5. Privacy First (Your conversations stay private and secure). 6. More Inclusive Spaces (Helping create a kinder, more accessible society for everyone). Philosophy: Technology is a bridge. People make it meaningful. SignSpeak is more than a tool — it's a step towards fairer, kinder, and more connected communities."
          width={1600}
          height={900}
          sizes="100vw"
          className="w-full h-auto block"
          loading="lazy"
          fetchPriority="low"
        />

      </div>


      {/* Screen-reader accessible semantic transcript and navigation links */}
      <div className="sr-only">
        <p>Key Features</p>
        <h2 id="key-features-heading">More ways to communicate. A more inclusive world.</h2>
        <p>
          SignSpeak brings together sign language, text, and speech to make communication simpler,
          faster, and more human.
        </p>
        <ul>
          <li>
            <h3>Indian Sign Language Recognition</h3>
            <p>Detects and understands ISL gestures in real time.</p>
            <a href="/talk">Learn more about Sign Recognition</a>
          </li>
          <li>
            <h3>Text &amp; Speech Support</h3>
            <p>Convert between speech, text, and ISL for smooth conversations.</p>
            <a href="/talk">Learn more about Speech and Text</a>
          </li>
          <li>
            <h3>Emergency Mode</h3>
            <p>Quick access to essential phrases when every second matters.</p>
            <a href="/emergency">Learn more about Emergency Mode</a>
          </li>
          <li>
            <h3>Built for Real People</h3>
            <p>Designed for hospitals, clinics, public spaces, and everyday use.</p>
            <a href="/phrases">Learn more about Phrase library</a>
          </li>
          <li>
            <h3>Privacy First</h3>
            <p>Your conversations stay private and secure.</p>
            <a href="/settings">Learn more about Privacy</a>
          </li>
          <li>
            <h3>More Inclusive Spaces</h3>
            <p>Helping create a kinder, more accessible society for everyone.</p>
          </li>
        </ul>
        <blockquote>
          <p>Technology is a bridge. People make it meaningful.</p>
          <p>
            SignSpeak is more than a tool — it&apos;s a step towards fairer, kinder, and more connected
            communities.
          </p>
        </blockquote>
      </div>
    </section>
  );
}

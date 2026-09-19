'use client';

/**
 * Wabi-Sabi & Doodle Art "Where SignSpeak can help" section.
 *
 * Uses the hand-drawn illustration (/where-signspeak-helps.png) presenting 4 real situations:
 * - Hospital communication
 * - Emergency situations
 * - Everyday interactions
 * - More inclusive spaces
 * Plus the trust statement: "Communication builds trust. When people understand each other, care becomes better for everyone."
 * And hand-drawn doodle notes: "A Kinder World Is Possible", "People Understand People", "Inclusion Heals", "Same Care. More Understanding."
 */

import Image from 'next/image';

export function WhereItHelps() {
  return (
    <section
      id="where-it-helps"
      aria-labelledby="where-it-helps-heading"
      className="relative w-full bg-[#F1E8D8] pt-6 sm:pt-10 overflow-hidden transition-colors duration-200"
    >
      {/* Narrative Bridge: Transition from How It Works to Real-World Situations */}
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 pb-4 sm:pb-6 text-center">
        {/* Subtle doodle connector trail */}
        <div className="flex items-center gap-2 text-[#71856A]">
          <span className="h-1 w-1 rounded-full bg-[#71856A]/60" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#71856A]" />
          <span className="h-2 w-2 rounded-full bg-[#C77D60]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#71856A]" />
          <span className="h-1 w-1 rounded-full bg-[#71856A]/60" />
        </div>

        {/* Chapter marker */}
        <div className="mt-3 flex items-center justify-center gap-3">
          <div className="h-[1px] w-10 sm:w-16 bg-[#D5C4A8]" />
          <span className="font-serif text-xs uppercase tracking-widest text-[#3F5745] font-semibold">
            Chapter 02 · Real-World Situations
          </span>
          <div className="h-[1px] w-10 sm:w-16 bg-[#D5C4A8]" />
        </div>

        {/* Narrative connecting text */}
        <p className="mt-1.5 font-serif text-xs sm:text-sm italic text-[#292D38]/70 max-w-md">
          Once you know the steps — see where SignSpeak creates understanding in daily life.
        </p>
      </div>

      {/* Full-bleed illustrated showcase graphic */}
      <div className="w-full">

        <Image
          src="/where-signspeak-helps.png"
          alt="Where SignSpeak can help: Designed for real situations. From hospitals and clinics to everyday spaces, SignSpeak makes communication more inclusive, clear, and human. 1. Hospital communication (Support simple exchanges about symptoms, needs, and basic requests). 2. Emergency situations (Quick access to essential phrases when every second matters). 3. Everyday interactions (Use at clinics, public spaces, transport, and daily life conversations). 4. More inclusive spaces (A step towards a kinder, more accessible society). Communication builds trust: When people understand each other, care becomes better for everyone."
          width={2048}
          height={1024}
          sizes="100vw"
          className="w-full h-auto block"
          loading="lazy"
        />

      </div>


      {/* Screen-reader accessible semantic transcript */}
      <div className="sr-only">
        <p>Designed for real situations</p>
        <h2 id="where-it-helps-heading">Where SignSpeak can help</h2>
        <p>
          From hospitals and clinics to everyday spaces, SignSpeak makes communication more
          inclusive, clear, and human.
        </p>
        <ul>
          <li>
            <h3>Hospital communication</h3>
            <p>Support simple exchanges about symptoms, needs, and basic requests.</p>
          </li>
          <li>
            <h3>Emergency situations</h3>
            <p>Quick access to essential phrases when every second matters.</p>
          </li>
          <li>
            <h3>Everyday interactions</h3>
            <p>Use at clinics, public spaces, transport, and daily life conversations.</p>
          </li>
          <li>
            <h3>More inclusive spaces</h3>
            <p>A step towards a kinder, more accessible society.</p>
          </li>
        </ul>
        <p>
          Communication builds trust. When people understand each other, care becomes better for
          everyone.
        </p>
      </div>
    </section>
  );
}

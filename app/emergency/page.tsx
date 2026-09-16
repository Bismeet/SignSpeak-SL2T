'use client';

/**
 * Emergency mode (FR-HOSP-04).
 *
 * Reachable in one tap from Home. Deliberately the simplest screen in the app: no camera,
 * no microphone, no model, no network. That is what makes it a usable fallback when every
 * other feature is unavailable.
 */

import { EmergencyBoard } from '@/components/emergency/EmergencyBoard';
import { useSpeaker } from '@/lib/speech/use-speaker';
import { useSettings } from '@/lib/state/settings';

export default function EmergencyPage() {
  const { settings } = useSettings();
  const speaker = useSpeaker();

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-5 sm:py-8">
      <EmergencyBoard showUnverified={settings.showUnverifiedPhrases} speaker={speaker} />
    </div>
  );
}

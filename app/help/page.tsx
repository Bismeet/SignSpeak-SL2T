import type { Metadata } from 'next';
import { HelpContent } from '@/components/help/HelpContent';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'How to use SignSpeak: sign recognition, speech and typing, the phrase board, Emergency mode, and what to do when something fails.',
};

export default function HelpPage() {
  return <HelpContent />;
}

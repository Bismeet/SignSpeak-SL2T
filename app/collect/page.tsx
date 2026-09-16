import type { Metadata } from 'next';
import { Callout } from '@/components/ui/Callout';
import { SectionHeading } from '@/components/ui/Surface';
import { CollectionTool } from '@/components/collect/CollectionTool';

export const metadata: Metadata = {
  title: 'Data collection',
  description:
    'Team tool for recording consented hand-landmark samples to train a real Indian Sign Language recognition model.',
  // A working tool for the team, not a page for patients.
  robots: { index: false, follow: false },
};

export default function CollectPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-5 sm:py-8">
      <SectionHeading
        level={1}
        title="Landmark data collection"
        description="Records hand-landmark numbers from consented ISL signers so a real recognition model can be trained. This page is a team tool, not part of the patient-facing flow."
        icon="download"
      />

      <Callout tone="warning" icon="alert" title="Why this page exists" className="mt-4">
        No recognition model ships with this build, because a model can only be trained on landmark
        data collected from real ISL signers with their consent. This tool produces that data. Until
        it has been collected, validated and trained on, SignSpeak is honest about having no
        recognition: the phrase board, Emergency mode, typing and speech carry the product.
      </Callout>

      <div className="mt-5">
        <CollectionTool />
      </div>
    </div>
  );
}

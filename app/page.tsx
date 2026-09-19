import type { Metadata } from 'next';
import { FirstRunIntro } from '@/components/home/FirstRunIntro';
import { HomeHero } from '@/components/home/HomeHero';
import { HowItWorks } from '@/components/home/HowItWorks';
import { WhereItHelps } from '@/components/home/WhereItHelps';
import { KeyFeatures } from '@/components/home/KeyFeatures';
import { ReadinessPanel } from '@/components/common/ReadinessPanel';
import { PageContainer } from '@/components/layout/AppShell';
import { Stack } from '@/components/ui/Surface';
import { HomeQuickLinks } from '@/components/home/HomeQuickLinks';

export const metadata: Metadata = {
  title: 'SignSpeak — Indian Sign Language communication aid',
};

export default function HomePage() {
  return (
    <>
      <FirstRunIntro />
      <HomeHero />
      <HowItWorks />
      <WhereItHelps />
      <KeyFeatures />


      <PageContainer>
        <Stack gap="lg">
          <ReadinessPanel />
          <HomeQuickLinks />
        </Stack>
      </PageContainer>
    </>
  );
}



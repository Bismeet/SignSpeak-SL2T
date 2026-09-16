import type { Metadata } from 'next';
import { FirstRunIntro } from '@/components/home/FirstRunIntro';
import { HomeHero } from '@/components/home/HomeHero';
import { ReadinessPanel } from '@/components/common/ReadinessPanel';
import { PageContainer } from '@/components/layout/AppShell';
import { Stack } from '@/components/ui/Surface';
import { HomeQuickLinks } from '@/components/home/HomeQuickLinks';
import { HowItWorks } from '@/components/home/HowItWorks';

export const metadata: Metadata = {
  title: 'SignSpeak — Indian Sign Language communication aid',
};

export default function HomePage() {
  return (
    <>
      <FirstRunIntro />
      <HomeHero />
      <PageContainer>
        <Stack gap="lg">
          <ReadinessPanel />
          <HowItWorks />
          <HomeQuickLinks />
        </Stack>
      </PageContainer>
    </>
  );
}

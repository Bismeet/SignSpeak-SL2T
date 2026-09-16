import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { PageContainer } from '@/components/layout/AppShell';
import { Card, Panel, SectionHeading } from '@/components/ui/Surface';

/**
 * 404 page. Even here, the rule holds: no dead ends. Every route in the app is offered as
 * a way forward, and the emergency route is included because a mistyped URL should never
 * be the reason someone cannot reach Emergency mode.
 */
export default function NotFound() {
  const destinations = [
    { href: '/', label: 'Home', icon: 'home' as const },
    { href: '/talk', label: 'Start a conversation', icon: 'users' as const },
    { href: '/phrases', label: 'Hospital phrases', icon: 'list' as const },
    { href: '/emergency', label: 'Emergency phrases', icon: 'siren' as const },
    { href: '/help', label: 'Help', icon: 'help' as const },
    { href: '/limitations', label: 'Limitations', icon: 'alert' as const },
  ];

  return (
    <PageContainer width="narrow">
      <SectionHeading
        level={1}
        title="That page does not exist"
        description="The link may be mistyped or the page may have moved. Nothing is broken — here is everything SignSpeak offers."
        icon="alert"
      />

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {destinations.map((destination) => (
          <li key={destination.href}>
            <Link href={destination.href} className="block rounded-2xl">
              <Card elevation="flat" className="h-full hover:bg-raised">
                <Panel padding="md" className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon name={destination.icon} size="1.4rem" />
                  </span>
                  <span className="font-semibold">{destination.label}</span>
                </Panel>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-pretty text-muted">
        If you were looking for something and cannot find it, the Limitations page lists exactly
        which signs and phrases this build supports, and what it deliberately does not do.
      </p>
    </PageContainer>
  );
}

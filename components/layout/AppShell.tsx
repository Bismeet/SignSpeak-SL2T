'use client';

/**
 * Application shell: skip link, header with live device status, main region, footer and
 * a mobile bottom navigation bar.
 *
 * Navigation contract (docs/ui-ux-specification.md §2 and §4):
 *   - every screen is reachable from every other screen (no dead ends);
 *   - a skip link jumps straight to the main region;
 *   - the header pills state, at all times, whether the camera and microphone are on;
 *   - on phones the four primary destinations sit in a thumb-reachable bottom bar.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandLockup, BrandMark } from '@/components/layout/BrandMark';
import { Icon, type IconName } from '@/components/ui/Icon';
import { StatusPill } from '@/components/ui/Badge';
import { cameraPill, micPill, useDeviceStatus } from '@/lib/state/device-status';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Shown in the mobile bottom bar. */
  primary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: 'home', primary: true },
  { href: '/talk', label: 'Conversation', icon: 'users', primary: true },
  { href: '/phrases', label: 'Phrases', icon: 'list', primary: true },
  { href: '/emergency', label: 'Emergency', icon: 'siren', primary: true },
  { href: '/settings', label: 'Settings', icon: 'settings' },
  { href: '/help', label: 'Help', icon: 'help' },
];

function resolveIcon(icon: IconName): IconName {
  return icon;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only-focusable absolute start-3 top-3 z-[60] inline-flex min-h-touch items-center rounded-xl bg-primary px-4 font-semibold text-primary-ink"
    >
      Skip to main content
    </a>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { camera, mic } = useDeviceStatus();
  const cameraState = cameraPill(camera);
  const micState = micPill(mic);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/92 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-5">
        <Link
          href="/"
          className="rounded-xl py-1 focus-visible:outline focus-visible:outline-3"
          aria-label="SignSpeak home"
        >
          <span className="hidden sm:block">
            <BrandLockup compact />
          </span>
          <span className="flex sm:hidden">
            <BrandMark size={34} labelled />
          </span>
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-touch items-center gap-2 rounded-xl px-3 font-semibold transition-colors duration-150',
                      active
                        ? 'bg-primary-soft text-primary'
                        : 'text-muted hover:bg-raised hover:text-ink',
                    )}
                  >
                    <Icon name={resolveIcon(item.icon)} size="1.15rem" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {/* Persistent device indicators (docs/ui-ux-specification.md §4). */}
          <div className="hidden items-center gap-2 sm:flex">
            <StatusPill
              tone={cameraState.tone === 'neutral' ? 'neutral' : cameraState.tone}
              icon={cameraState.icon}
              label={cameraState.label}
            />
            <StatusPill
              tone={micState.tone === 'neutral' ? 'neutral' : micState.tone}
              icon={micState.icon}
              label={micState.label}
            />
          </div>

          <Link
            href="/settings"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-raised lg:hidden"
            aria-label="Settings"
          >
            <Icon name="settings" size="1.25rem" />
          </Link>
          <Link
            href="/help"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-raised"
            aria-label="Help, privacy and limitations"
          >
            <Icon name="help" size="1.25rem" />
          </Link>
        </div>
      </div>

      {/* Compact device indicators for very small screens. */}
      <div className="flex items-center gap-2 overflow-x-auto border-t border-line px-3 py-1.5 sm:hidden">
        <StatusPill tone={cameraState.tone} icon={cameraState.icon} label={cameraState.label} />
        <StatusPill tone={micState.tone} icon={micState.icon} label={micState.label} />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-md">
            <BrandLockup compact />
            <p className="mt-3 text-pretty text-sm text-muted">
              A communication aid for Indian Sign Language in hospital and emergency settings. Not
              a medical device, not a diagnostic tool, and not a replacement for a qualified ISL
              interpreter or emergency services.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-1">
            <Link href="/help" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-muted hover:text-ink">
              Help
            </Link>
            <Link href="/privacy" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-muted hover:text-ink">
              Privacy
            </Link>
            <Link href="/limitations" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-muted hover:text-ink">
              Limitations
            </Link>
            <Link href="/settings" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-muted hover:text-ink">
              Settings
            </Link>
          </nav>
        </div>
        <p className="mt-6 border-t border-line pt-4 text-xs text-faint">
          SignSpeak processes camera and audio on your device. Nothing is stored or uploaded by
          default. Camera and microphone are only used after you start them.
        </p>
      </div>
    </footer>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const primary = NAV_ITEMS.filter((item) => item.primary);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          const isEmergency = item.href === '/emergency';
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-touch flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-semibold',
                  active ? 'text-primary' : isEmergency ? 'text-danger' : 'text-muted',
                )}
              >
                <Icon name={resolveIcon(item.icon)} size="1.35rem" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 pb-24 lg:pb-0">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

/** Standard page container with consistent horizontal padding and max width. */
export function PageContainer({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode;
  className?: string;
  width?: 'default' | 'wide' | 'narrow';
}) {
  const widths = {
    narrow: 'max-w-3xl',
    default: 'max-w-5xl',
    wide: 'max-w-7xl',
  };
  return (
    <div className={cn('mx-auto w-full px-3 py-6 sm:px-5 sm:py-8', widths[width], className)}>
      {children}
    </div>
  );
}

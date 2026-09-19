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
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { BrandLockup, BrandMark } from '@/components/layout/BrandMark';
import { Icon, type IconName } from '@/components/ui/Icon';
import { StatusPill } from '@/components/ui/Badge';
import { cameraPill, micPill, useDeviceStatus } from '@/lib/state/device-status';
import { useSettings } from '@/lib/state/settings';
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
  { href: '/talk/', label: 'Conversation', icon: 'users', primary: true },
  { href: '/phrases/', label: 'Phrases', icon: 'list', primary: true },
  { href: '/emergency/', label: 'Emergency', icon: 'siren', primary: true },
  { href: '/settings/', label: 'Settings', icon: 'settings' },
  { href: '/help/', label: 'Help', icon: 'help' },
];

function resolveIcon(icon: IconName): IconName {
  return icon;
}

function isActive(pathname: string, href: string): boolean {
  const normPath = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const normHref = href.endsWith('/') ? href : `${href}/`;
  if (normHref === '/') return normPath === '/';
  return normPath === normHref || normPath.startsWith(normHref);
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only-focusable absolute start-3 top-3 z-[60] inline-flex min-h-touch items-center rounded-xl bg-primary-solid px-4 font-semibold text-primary-ink"
    >
      Skip to main content
    </a>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { camera, mic } = useDeviceStatus();
  const { settings, update } = useSettings();
  const cameraState = cameraPill(camera);
  const micState = micPill(mic);

  // Eagerly prefetch routes in client router cache
  useEffect(() => {
    NAV_ITEMS.forEach((item) => {
      try {
        router.prefetch(item.href);
      } catch {
        // Safe fallback
      }
    });
  }, [router]);

  // Clear pending indicator once the new pathname mounts
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-sand bg-bg/90 backdrop-blur-md transition-colors duration-200">
      {/* Instant navigation loading progress line */}
      {pendingHref ? (
        <div className="absolute top-0 inset-x-0 h-0.5 bg-bamboo-deep z-50 animate-pulse" />
      ) : null}
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-x-4 px-4 py-2 sm:px-6 sm:py-2.5">
        {/* Brand logo */}
        <Link
          href="/"
          className="rounded-xl py-0.5 focus-visible:outline focus-visible:outline-3 shrink-0"
          aria-label="SignSpeak home"
        >
          <span className="hidden sm:block">
            <BrandLockup compact />
          </span>
          <span className="flex sm:hidden">
            <BrandMark size={34} labelled />
          </span>
        </Link>

        {/* Center pill navigation capsule */}
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1 rounded-full border border-sand bg-surface/85 px-2 py-1 shadow-xs">
            {NAV_ITEMS.map((item) => {
              const active = pendingHref ? pendingHref === item.href : isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={true}
                    onClick={() => {
                      if (pathname !== item.href) {
                        setPendingHref(item.href);
                      }
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-100',
                      active
                        ? 'font-semibold text-bamboo-deep bg-sand/30 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-bamboo-deep after:rounded-full'
                        : 'text-charcoal/80 hover:text-bamboo-deep hover:bg-raised/70',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right side controls: status pills, theme toggle, profile */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Persistent device indicators */}
          <div className="hidden items-center gap-2 sm:flex">
            <StatusPill
              dot
              tone={cameraState.tone === 'neutral' ? 'neutral' : cameraState.tone}
              icon={cameraState.icon}
              label={cameraState.label}
            />
            <StatusPill
              dot
              tone={micState.tone === 'neutral' ? 'neutral' : micState.tone}
              icon={micState.icon}
              label={micState.label}
            />
          </div>

          {/* Theme toggle button */}
          <button
            type="button"
            onClick={() => update('theme', settings.theme === 'dark' ? 'day' : 'dark')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-raised/80 text-muted hover:text-ink hover:bg-raised transition-colors shadow-xs"
            aria-label={`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {settings.theme === 'dark' ? (
              <svg className="h-4 w-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg className="h-4 w-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            )}
          </button>

          {/* Warm terracotta avatar pill */}
          <Link
            href="/settings/"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-terracotta text-white font-medium shadow-xs transition-transform hover:scale-105 active:scale-95"
            aria-label="User settings"
          >
            <span className="text-xs font-semibold leading-none">SS</span>
          </Link>

          <Link
            href="/help/"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-raised/80 text-muted transition-colors hover:bg-raised hover:text-ink lg:hidden"
            aria-label="Help, privacy and limitations"
          >
            <Icon name="help" size="1.1rem" />
          </Link>
        </div>
      </div>

      {/* Compact device indicators for mobile screens */}
      <div className="flex items-center gap-2 overflow-x-auto border-t border-line px-3 py-1.5 sm:hidden">
        <StatusPill dot tone={cameraState.tone} icon={cameraState.icon} label={cameraState.label} />
        <StatusPill dot tone={micState.tone} icon={micState.icon} label={micState.label} />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-sand bg-bg">
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-md">
            <BrandLockup compact />
            <p className="mt-3 text-pretty text-sm text-charcoal/80">
              A communication aid for Indian Sign Language in hospital and emergency settings. Not
              a medical device, not a diagnostic tool, and not a replacement for a qualified ISL
              interpreter or emergency services.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-1">
            <Link href="/help/" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-charcoal/80 hover:text-bamboo-deep">
              Help
            </Link>
            <Link href="/privacy/" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-charcoal/80 hover:text-bamboo-deep">
              Privacy
            </Link>
            <Link href="/limitations/" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-charcoal/80 hover:text-bamboo-deep">
              Limitations
            </Link>
            <Link href="/settings/" className="inline-flex min-h-[2.5rem] items-center text-sm font-medium text-charcoal/80 hover:text-bamboo-deep">
              Settings
            </Link>
          </nav>
        </div>
        <p className="mt-6 border-t border-sand pt-4 text-xs text-charcoal/60">
          SignSpeak processes camera and audio on your device. Nothing is stored or uploaded by
          default. Camera and microphone are only used after you start them.
        </p>
      </div>
    </footer>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const primary = NAV_ITEMS.filter((item) => item.primary);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sand bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {primary.map((item) => {
          const active = pendingHref ? pendingHref === item.href : isActive(pathname, item.href);
          const isEmergency = item.href.startsWith('/emergency');
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={true}
                onClick={() => {
                  if (pathname !== item.href) {
                    setPendingHref(item.href);
                  }
                }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-touch flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-semibold transition-colors duration-100',
                  active ? 'text-bamboo-deep' : isEmergency ? 'text-danger' : 'text-charcoal/70',
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

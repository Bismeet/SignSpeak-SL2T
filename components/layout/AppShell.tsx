'use client';

/**
 * SignSpeak Application Shell & Navigation Bar.
 *
 * Design & Layout:
 * - Desktop order: SignSpeak Logo | Home | Conversation | Quick Phrases | Emergency | Theme Toggle | Profile
 * - Healthcare-focused, calm wabi-sabi palette (#F1E8D8 warm beige, #71856A bamboo sage,
 *   #3F5745 deep bamboo, #292D38 charcoal text, #D5C4A8 sand borders, #C04838 emergency red).
 * - Compact profile dropdown hosting user badge, Settings, Help & Support, and Sign Out.
 * - Mobile responsive header with hamburger menu + persistent 4-destination mobile bottom tab bar.
 * - Dedicated camera & mic controls live in the Conversation workspace, keeping the global navbar clean.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandLockup, BrandMark } from '@/components/layout/BrandMark';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cameraPill, micPill, useDeviceStatus } from '@/lib/state/device-status';
import { useSettings } from '@/lib/state/settings';
import { cn } from '@/lib/utils/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  isEmergency?: boolean;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/talk/', label: 'Conversation', icon: 'message-square' },
  { href: '/phrases/', label: 'Quick Phrases', icon: 'book-open' },
  { href: '/emergency/', label: 'Emergency', icon: 'alert', isEmergency: true },
];

const ALL_PREFETCH_ROUTES = [
  '/',
  '/talk/',
  '/phrases/',
  '/emergency/',
  '/settings/',
  '/help/',
];

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
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signedOutNote, setSignedOutNote] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const { camera, mic } = useDeviceStatus();
  const { settings, update } = useSettings();
  const cameraState = cameraPill(camera);
  const micState = micPill(mic);

  // Eagerly prefetch core routes into client router cache
  useEffect(() => {
    ALL_PREFETCH_ROUTES.forEach((href) => {
      try {
        router.prefetch(href);
      } catch {
        // Safe fallback
      }
    });
  }, [router]);

  // Clear pending indicator and close menus on route change
  useEffect(() => {
    setPendingHref(null);
    setIsProfileOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  // Handle click outside & keyboard accessibility (Escape key)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
        setMobileMenuOpen(false);
      }
    }

    if (isProfileOpen || mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileOpen, mobileMenuOpen]);

  const handleSignOut = () => {
    setIsProfileOpen(false);
    setMobileMenuOpen(false);
    setSignedOutNote(true);
    setTimeout(() => {
      setSignedOutNote(false);
      if (typeof window !== 'undefined' && pathname !== '/') {
        router.push('/');
      }
    }, 1500);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F1E8D8]/95 dark:bg-bg/95 backdrop-blur-md transition-colors duration-200 py-2 sm:py-2.5 px-3 sm:px-6">
      {/* Instant navigation loading progress line */}
      {pendingHref ? (
        <div className="absolute top-0 inset-x-0 h-0.5 bg-bamboo-deep z-50 animate-pulse" />
      ) : null}

      {/* Screen-reader accessible device status announcements */}
      <div className="opacity-0 pointer-events-none select-none absolute -z-50 text-[1px] leading-none" aria-live="polite">
        <div>{cameraState.label}</div>
        <div>{micState.label}</div>
      </div>

      {/* Floating Pill Navbar Container */}
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-x-3 rounded-full border border-[#D5C4A8] bg-[#FAF6EE]/95 dark:bg-surface/95 px-3 py-1.5 sm:px-5 sm:py-2 shadow-xs transition-colors duration-200">
        
        {/* 1. SignSpeak Logo (Clickable -> Home) */}
        <Link
          href="/"
          onClick={() => {
            if (pathname !== '/') setPendingHref('/');
          }}
          className="rounded-full py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bamboo-deep shrink-0 transition-opacity hover:opacity-90"
          aria-label="SignSpeak home"
        >
          <span className="hidden sm:block">
            <BrandLockup compact={false} subtitle="People Understand People" />
          </span>
          <span className="flex sm:hidden">
            <BrandMark size={32} labelled />
          </span>
        </Link>

        {/* 2. Desktop Primary Navigation */}
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1.5">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = pendingHref ? pendingHref === item.href : isActive(pathname, item.href);

            if (item.isEmergency) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => {
                    if (pathname !== item.href) setPendingHref(item.href);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold transition-all duration-150 shadow-xs active:scale-[0.98]',
                    'bg-[#C04838] hover:bg-[#A83B2D] text-white',
                    active && 'ring-2 ring-offset-2 ring-[#C04838]',
                  )}
                >
                  <Icon name="alert" size="1.05rem" className="text-white" />
                  <span>{item.label}</span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => {
                  if (pathname !== item.href) setPendingHref(item.href);
                }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-[#EAE2D2] text-[#292D38] dark:bg-raised dark:text-ink font-semibold shadow-xs'
                    : 'text-[#292D38]/80 dark:text-ink/80 hover:text-[#3F5745] dark:hover:text-primary hover:bg-[#EAE2D2]/50',
                )}
              >
                <Icon
                  name={item.icon}
                  size="1.05rem"
                  className={active ? 'text-[#3F5745] dark:text-primary' : 'text-[#292D38]/70 dark:text-ink/70'}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 3. Right Controls: Divider, Theme Toggle & Profile Dropdown */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Subtle vertical divider on desktop */}
          <div className="hidden lg:block h-5 w-px bg-[#D5C4A8]/80 dark:bg-line mx-1" aria-hidden="true" />

          {/* Theme toggle button */}
          <button
            type="button"
            onClick={() => update('theme', settings.theme === 'dark' ? 'day' : 'dark')}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-[#D5C4A8] bg-[#FAF6EE] dark:bg-raised text-[#292D38]/85 dark:text-ink hover:text-[#3F5745] dark:hover:text-primary hover:bg-[#EAE2D2]/50 transition-colors shadow-xs"
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

          {/* Desktop Profile Dropdown Container */}
          <div ref={profileRef} className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setIsProfileOpen((prev) => !prev)}
              aria-label="User profile and navigation menu"
              aria-expanded={isProfileOpen}
              aria-haspopup="menu"
              className="flex items-center gap-1.5 rounded-full p-0.5 pr-2 border border-[#D5C4A8] bg-[#FAF6EE] dark:bg-raised text-[#292D38] hover:bg-[#EAE2D2]/50 transition-colors shadow-xs"
            >
              <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-[#3F5745] text-white text-xs font-semibold leading-none shadow-xs">
                SS
              </span>
              <Icon
                name="chevron-down"
                size="0.85rem"
                className={cn('text-[#292D38]/70 transition-transform duration-150', isProfileOpen && 'rotate-180')}
              />
            </button>

            {/* Dropdown Menu Card */}
            {isProfileOpen ? (
              <div
                role="menu"
                aria-label="Profile and settings options"
                className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-[#D5C4A8] bg-[#FAF6EE] dark:bg-surface p-2.5 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                {/* User Identity Header */}
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3F5745] text-white font-semibold text-xs shadow-xs">
                    SS
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-xs sm:text-sm text-[#292D38] dark:text-ink truncate">
                      Student
                    </span>
                    <span className="text-[11px] text-[#292D38]/60 dark:text-muted truncate">
                      Using SignSpeak
                    </span>
                  </div>
                </div>

                <div className="my-1.5 h-px bg-[#D5C4A8]/60 dark:bg-line" aria-hidden="true" />

                {/* Dropdown Links */}
                <Link
                  role="menuitem"
                  href="/settings/"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs sm:text-sm font-medium text-[#292D38] dark:text-ink hover:bg-[#EAE2D2]/60 dark:hover:bg-raised transition-colors"
                >
                  <Icon name="settings" size="1.05rem" className="text-[#3F5745] dark:text-primary" />
                  <span>Settings</span>
                </Link>

                <Link
                  role="menuitem"
                  href="/help/"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs sm:text-sm font-medium text-[#292D38] dark:text-ink hover:bg-[#EAE2D2]/60 dark:hover:bg-raised transition-colors"
                >
                  <Icon name="help" size="1.05rem" className="text-[#3F5745] dark:text-primary" />
                  <span>Help & Support</span>
                </Link>

                <div className="my-1.5 h-px bg-[#D5C4A8]/60 dark:bg-line" aria-hidden="true" />

                {/* Sign Out Action */}
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs sm:text-sm font-medium text-[#292D38] dark:text-ink hover:bg-[#F7E5DE] hover:text-[#C04838] transition-colors cursor-pointer text-left"
                >
                  <Icon name="log-out" size="1.05rem" className="text-[#C04838]" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : null}
          </div>

          {/* Mobile Hamburger Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-[#D5C4A8] bg-[#FAF6EE] dark:bg-raised text-[#292D38] hover:bg-[#EAE2D2]/50 transition-colors lg:hidden shadow-xs"
          >
            <Icon name="menu" size="1.15rem" />
          </button>
        </div>
      </div>

      {/* Sign Out Friendly Notice Banner */}
      {signedOutNote ? (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-full border border-[#D5C4A8] bg-[#FAF6EE] px-4 py-2 text-xs sm:text-sm font-medium text-[#292D38] shadow-lg animate-in fade-in slide-in-from-top-2">
          ✓ Signed out. Session refreshed.
        </div>
      ) : null}

      {/* Mobile Sidebar Navigation Drawer */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-charcoal/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-over panel */}
          <div
            ref={mobileMenuRef}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-xs bg-[#FAF6EE] dark:bg-surface border-l border-[#D5C4A8] p-5 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
          >
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#D5C4A8]/60">
                <BrandLockup compact subtitle="People Understand People" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="rounded-full p-1.5 text-[#292D38]/70 hover:bg-[#EAE2D2]/60 hover:text-[#292D38] transition-colors"
                >
                  <Icon name="x" size="1.25rem" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="mt-5 space-y-1.5">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    isActive(pathname, '/')
                      ? 'bg-[#EAE2D2] text-[#292D38] dark:bg-raised dark:text-ink'
                      : 'text-[#292D38]/80 hover:bg-[#EAE2D2]/50 hover:text-[#292D38]',
                  )}
                >
                  <Icon name="home" size="1.15rem" className="text-[#3F5745] dark:text-primary" />
                  <span>Home</span>
                </Link>

                <Link
                  href="/talk/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    isActive(pathname, '/talk/')
                      ? 'bg-[#EAE2D2] text-[#292D38] dark:bg-raised dark:text-ink'
                      : 'text-[#292D38]/80 hover:bg-[#EAE2D2]/50 hover:text-[#292D38]',
                  )}
                >
                  <Icon name="message-square" size="1.15rem" className="text-[#3F5745] dark:text-primary" />
                  <span>Conversation</span>
                </Link>

                <Link
                  href="/phrases/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    isActive(pathname, '/phrases/')
                      ? 'bg-[#EAE2D2] text-[#292D38] dark:bg-raised dark:text-ink'
                      : 'text-[#292D38]/80 hover:bg-[#EAE2D2]/50 hover:text-[#292D38]',
                  )}
                >
                  <Icon name="book-open" size="1.15rem" className="text-[#3F5745] dark:text-primary" />
                  <span>Quick Phrases</span>
                </Link>

                {/* Emergency Item with distinct red styling */}
                <Link
                  href="/emergency/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all',
                    'bg-[#F7E5DE] text-[#C04838] border border-[#F0CEC4] hover:bg-[#F2D6CD]',
                  )}
                >
                  <Icon name="alert" size="1.15rem" className="text-[#C04838]" />
                  <span>Emergency</span>
                </Link>

                <div className="my-3 h-px bg-[#D5C4A8]/60" aria-hidden="true" />

                <Link
                  href="/settings/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-[#292D38]/80 hover:bg-[#EAE2D2]/50 hover:text-[#292D38] transition-colors"
                >
                  <Icon name="settings" size="1.15rem" className="text-[#3F5745] dark:text-primary" />
                  <span>Settings</span>
                </Link>

                <Link
                  href="/help/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-[#292D38]/80 hover:bg-[#EAE2D2]/50 hover:text-[#292D38] transition-colors"
                >
                  <Icon name="help" size="1.15rem" className="text-[#3F5745] dark:text-primary" />
                  <span>Help & Support</span>
                </Link>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-[#292D38]/80 hover:bg-[#F7E5DE] hover:text-[#C04838] transition-colors cursor-pointer text-left"
                >
                  <Icon name="log-out" size="1.15rem" className="text-[#C04838]" />
                  <span>Sign Out</span>
                </button>
              </nav>
            </div>

            {/* Mobile Drawer Footer with Gentle Encouragement */}
            <div className="pt-6 border-t border-[#D5C4A8]/60 text-center">
              <p className="font-serif italic text-xs text-[#71856A]">
                Communication creates care ♡
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-[#292D38]/50">
                Inclusion Today · A Brighter Tomorrow
              </p>
            </div>
          </div>
        </div>
      ) : null}
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

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const items: NavItem[] = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/talk/', label: 'Conversation', icon: 'message-square' },
    { href: '/phrases/', label: 'Phrases', icon: 'book-open' },
    { href: '/emergency/', label: 'Emergency', icon: 'alert', isEmergency: true },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D5C4A8] bg-[#FAF6EE]/95 dark:bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden shadow-lg transition-colors"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 px-2 py-1">
        {items.map((item) => {
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
                  'relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-all duration-150',
                  item.isEmergency
                    ? 'text-[#C04838] hover:bg-[#F7E5DE]/50'
                    : active
                      ? 'text-[#3F5745] dark:text-primary font-bold'
                      : 'text-[#292D38]/70 dark:text-ink/70 hover:text-[#292D38]',
                )}
              >
                <Icon
                  name={item.icon}
                  size="1.25rem"
                  className={cn(
                    item.isEmergency
                      ? 'text-[#C04838]'
                      : active
                        ? 'text-[#3F5745] dark:text-primary'
                        : 'text-[#292D38]/70 dark:text-ink/70',
                  )}
                />
                <span>{item.label}</span>
                {/* Active route indicator bar matching mockup */}
                {active && !item.isEmergency ? (
                  <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-[#3F5745] dark:bg-primary" />
                ) : null}
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

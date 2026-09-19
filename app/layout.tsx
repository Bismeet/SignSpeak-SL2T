import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { ConversationProvider } from '@/lib/state/conversation';
import { DeviceStatusProvider } from '@/lib/state/device-status';
import { ModelProvider } from '@/lib/state/model-provider';
import { SettingsProvider } from '@/lib/state/settings';
import { cn } from '@/lib/utils/cn';

/**
 * Plus Jakarta Sans, self-hosted at build time.
 *
 * `next/font/google` downloads the font files during `next build` and serves them from
 * our own origin, so at runtime the app still makes no requests beyond its own origin
 * (docs/privacy-and-safety.md §7) and the "no data leaves the device" claim
 * (docs/privacy-and-safety.md §3) stays literally true.
 *
 * The variable feeds `--ss-font-sans` / `--ss-font-display` in globals.css. The family
 * carries no Devanagari glyphs, so the `hi-IN` strings fall through to Nirmala UI /
 * Noto Sans Devanagari in that fallback chain — deliberate, not a regression.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--ss-font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'SignSpeak — Indian Sign Language communication aid',
    template: '%s · SignSpeak',
  },
  description:
    'A two-way Indian Sign Language communication aid for hospital and emergency settings. On-device sign recognition for a small verified vocabulary, hospital phrase boards, speech and typing fallbacks. Not a medical device.',
  applicationName: 'SignSpeak',
  // No analytics, no third-party embeds: the app makes no requests
  // beyond its own origin at runtime (docs/privacy-and-safety.md §7).
  // The display font is self-hosted at build time via next/font/google, so no
  // browser request leaves the device origin.
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: [{ url: '/apple-icon.png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never blocked: pinch-zoom is an accessibility requirement (NFR-03).
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fc' },
    { media: '(prefers-color-scheme: dark)', color: '#090a0f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(jakarta.variable)}>
      <body>
        <SettingsProvider>
          <DeviceStatusProvider>
            <ModelProvider>
              <ConversationProvider>
                <AppShell>{children}</AppShell>
              </ConversationProvider>
            </ModelProvider>
          </DeviceStatusProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}

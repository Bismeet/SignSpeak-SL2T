import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { ConversationProvider } from '@/lib/state/conversation';
import { DeviceStatusProvider } from '@/lib/state/device-status';
import { ModelProvider } from '@/lib/state/model-provider';
import { SettingsProvider } from '@/lib/state/settings';

export const metadata: Metadata = {
  title: {
    default: 'SignSpeak — Indian Sign Language communication aid',
    template: '%s · SignSpeak',
  },
  description:
    'A two-way Indian Sign Language communication aid for hospital and emergency settings. On-device sign recognition for a small verified vocabulary, hospital phrase boards, speech and typing fallbacks. Not a medical device.',
  applicationName: 'SignSpeak',
  // No analytics, no third-party embeds, no external fonts: the app makes no requests
  // beyond its own origin (docs/privacy-and-safety.md §7).
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg' }],
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
    { media: '(prefers-color-scheme: dark)', color: '#090c17' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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

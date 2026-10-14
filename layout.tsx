import type { Metadata, Viewport } from 'next';
import './globals.css';
import SWRegister from './sw-register';

export const metadata: Metadata = {
  title: 'loop. — reels with your people',
  description: 'A shared home for the reels your friends send.',
  manifest: '/manifest.webmanifest',
  applicationName: 'loop.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'loop.' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0b10',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" />
      </head>
      <body><SWRegister />{children}</body>
    </html>
  );
}

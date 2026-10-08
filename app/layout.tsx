import type { Metadata, Viewport } from 'next';
import { APP_NAME } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Private client and project assistant.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f5f4e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

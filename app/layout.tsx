import type { Metadata } from 'next';
import './globals.css';
import SWRegister from './sw-register';
export const metadata: Metadata = { title: 'loop. — reels with your people', description: 'A private shared feed for your friends’ reels.', manifest: '/manifest.webmanifest', themeColor: '#f7f7f4' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body><SWRegister />{children}</body></html>; }

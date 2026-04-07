import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import GlobalInviteToast from '@/components/game/GlobalInviteToast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Integrame – Multiplayer Word Games',
  description: 'Joacă integrame, slogane și alte jocuri de cuvinte în timp real cu prietenii.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" style={{ backgroundColor: '#020617' }}>
      <body className={`${inter.className} bg-slate-950 text-white min-h-screen`}>
        {children}
        <GlobalInviteToast />
      </body>
    </html>
  );
}

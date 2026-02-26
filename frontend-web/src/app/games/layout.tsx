import type { Metadata } from 'next';
import '../globals-game.css';

export const metadata: Metadata = {
  title: 'Integrame – Joacă',
};

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

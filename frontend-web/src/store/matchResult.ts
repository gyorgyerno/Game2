import { create } from 'zustand';
import { Match } from '@integrame/shared';

interface MatchResultState {
  lastMatch: Match | null;
  setLastMatch: (match: Match) => void;
  clearLastMatch: () => void;
}

export const useMatchResultStore = create<MatchResultState>((set) => ({
  lastMatch: null,
  setLastMatch: (match) => set({ lastMatch: match }),
  clearLastMatch: () => set({ lastMatch: null }),
}));

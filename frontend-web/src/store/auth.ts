import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@integrame/shared';
import { usersApi } from '@/lib/api';

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isLoading: false,
      _hasHydrated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setAuth: (token, user) => {
        if (typeof window !== 'undefined') localStorage.setItem('token', token);
        set({ token, user });
      },

      logout: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('token');
        set({ token: null, user: null });
      },

      fetchMe: async () => {
        set({ isLoading: true });
        try {
          const { data } = await usersApi.getMe();
          set({ user: data });
        } catch (err: any) {
          // Deloghează DOAR dacă serverul spune explicit că token-ul e invalid
          if (err?.response?.status === 401) {
            set({ token: null, user: null });
          }
          // Altfel (network error, 500, etc.) păstrăm sesiunea
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[auth-store] rehydrate failed', error);
        }
        state?.setHasHydrated(true);
      },
    }
  )
);

// 登入狀態（不持久化：session 本身由 supabase-js 保存）。由 services/auth.ts 寫入。
//
// loading 只出現在啟動時，等 supabase-js 從 localStorage 讀回 session（或處理 magic link 導回的網址）。

import { create } from 'zustand';

export type AuthUser = { id: string; email: string };

type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: AuthUser | null;
  // 點了無效的 magic link 時的錯誤訊息，顯示在登入頁。
  linkError: string | null;
  setUser: (user: AuthUser | null) => void;
  setLinkError: (message: string | null) => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  linkError: null,
  setUser: (user) => set({ user, status: user ? 'signedIn' : 'signedOut' }),
  setLinkError: (message) => set({ linkError: message }),
}));

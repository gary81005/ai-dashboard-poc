// 登入流程：email magic link（ADR 0007）。UI 只呼叫這裡，不直接碰 Supabase client。
//
// session 由 supabase-js 自己存在 localStorage 並自動續期；這裡只把登入狀態同步進 authStore。

import { supabase } from './supabase.ts';
import { useAuthStore } from '../store/authStore.ts';

// 在 render 之前呼叫一次（main.tsx）。訂閱後會立刻收到 INITIAL_SESSION，
// 之後登入、登出、token 續期都會再通知。callback 裡不可以 await 其他 supabase 呼叫，否則會卡死。
export function startAuthListener(): void {
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    useAuthStore.getState().setUser(user ? { id: user.id, email: user.email ?? '' } : null);
  });

  // 點了過期或已用過的連結時，Supabase 會帶著 #error=… 導回來；initialize 會回報這個錯誤。
  void supabase.auth.initialize().then(({ error }) => {
    if (!error) return;
    useAuthStore.getState().setLinkError('登入連結無效或已過期，請重新寄送。');
    history.replaceState(null, '', location.pathname + location.search);
  });
}

// 寄出登入連結。信中的連結會導回目前的網址，所以這個網址必須在 Supabase Auth 的 Redirect URLs 允許清單裡。
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin },
  });
  if (error) throw new Error(toMessage(error.status, error.message));
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

function toMessage(status: number | undefined, message: string): string {
  // Supabase 內建的寄信服務每小時只能寄很少封，超過時回 429。
  if (status === 429) return '寄送太頻繁，請稍候再試。';
  return `寄送失敗：${message}`;
}

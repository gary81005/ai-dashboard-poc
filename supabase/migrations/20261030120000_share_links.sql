-- 分享連結（ADR 0012）：拿到連結的人不用登入就能看儀表板，但只拿到算好的圖表結果（snapshot），
-- 拿不到原始資料列。現有三張表的 RLS 不變，anon 照樣讀不到它們；看的人只能呼叫 get_shared_dashboard。

-- ── 分享連結：一個儀表板最多一條 ──────────────────────────────────────────

create table public.dashboard_shares (
  user_id uuid not null default auth.uid(),
  dashboard_id text not null,
  -- 網址裡的 ?share=<token>。gen_random_uuid() 是 122 位元的隨機數，猜不到。
  token uuid not null default gen_random_uuid() unique,
  -- 分享結果：版面、元件的顯示設定與 computeWidget 的結果，格式由前端的 SNAPSHOT_VERSION 決定。
  snapshot jsonb not null,
  -- 分享結果的寫入時間，分享頁顯示成「最後更新於」。只改到期日時不變。
  snapshot_at timestamptz not null default now(),
  -- null 代表永不過期。
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, dashboard_id),
  -- 刪除儀表板時連結跟著刪除。撤銷連結也是直接刪除這一筆，重新建立時會產生新的 token。
  foreign key (user_id, dashboard_id) references public.dashboards (user_id, id) on delete cascade
);

-- 擁有者只能設定要分享哪個儀表板、分享結果與到期日；token 一律由資料庫產生。
revoke all on public.dashboard_shares from anon, authenticated;
grant select, delete on public.dashboard_shares to authenticated;
grant insert (dashboard_id, snapshot, expires_at) on public.dashboard_shares to authenticated;
grant update (snapshot, snapshot_at, expires_at) on public.dashboard_shares to authenticated;

alter table public.dashboard_shares enable row level security;

create policy "owner can manage own dashboard shares"
on public.dashboard_shares for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ── 看的人：用 token 讀分享結果 ───────────────────────────────────────────

-- 連結有效時回傳 { snapshot, snapshotAt }，否則回傳 null，不區分原因（ADR 0012 §4）。
-- 有效 = 沒過期，而且儀表板目前指向的資料集仍存在且已上傳完成（刪除資料集，連結就失效）。
-- security definer：以函式擁有者的權限繞過 RLS，所以只能回傳這一筆的分享結果，不碰其他欄位。
create function public.get_shared_dashboard(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('snapshot', s.snapshot, 'snapshotAt', s.snapshot_at)
  from public.dashboard_shares s
  join public.dashboards d
    on d.user_id = s.user_id and d.id = s.dashboard_id
  join public.datasets ds
    on ds.user_id = d.user_id and ds.id = d.body ->> 'datasetId' and ds.status = 'ready'
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now());
$$;

-- ── 擁有者：儲存儀表板，同時更新分享結果 ──────────────────────────────────

-- 儀表板設定與分享結果在同一個 transaction 裡寫入（ADR 0012 §2）：任何一步失敗就整個回復，
-- 前端維持「未儲存」，再按一次就重試。p_snapshot 是 null 時只存儀表板（沒有分享連結）。
-- security invoker：照呼叫者的權限執行，RLS 照常生效，只改得到自己的資料。
create function public.save_dashboard(
  p_id text,
  p_schema_version integer,
  p_body jsonb,
  p_snapshot jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.dashboards
  set body = p_body, schema_version = p_schema_version
  where user_id = (select auth.uid()) and id = p_id;
  if not found then
    raise exception '資料庫裡找不到這個儀表板，可能已在其他地方刪除' using errcode = 'P0002';
  end if;

  if p_snapshot is not null then
    update public.dashboard_shares
    set snapshot = p_snapshot, snapshot_at = now()
    where user_id = (select auth.uid()) and dashboard_id = p_id;
  end if;
end;
$$;

-- Supabase 預設讓 anon 與 authenticated 都能執行 public 的函式，這裡收回後只開放需要的。
revoke execute on function public.get_shared_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.get_shared_dashboard(uuid) to anon, authenticated;

revoke execute on function public.save_dashboard(text, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_dashboard(text, integer, jsonb, jsonb) to authenticated;

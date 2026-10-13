-- 初始 schema：資料集、資料列、儀表板，以及原始 Excel 檔的 Storage bucket（ADR 0007）。
--
-- 主鍵一律是 (user_id, id)：前端產生的 id 只有 8 碼（utils/ids.ts），匯入 JSON 也會沿用原 id，
-- 若主鍵只用 id，兩個帳號可能撞號。每張表的 RLS 都是「只能存取自己的列」。

-- ── 共用：自動更新 updated_at ─────────────────────────────────────────────

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 資料集：body 是 src/types 的 Dataset（不含資料列）──────────────────────

create table public.datasets (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  -- 分批寫入資料列期間是 uploading，全部寫完才改成 ready；清單只顯示 ready。
  status text not null default 'uploading' check (status in ('uploading', 'ready')),
  schema_version integer not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (body ->> 'id' = id)
);

create trigger datasets_set_updated_at
before update on public.datasets
for each row execute function public.set_updated_at();

-- ── 資料列：一個 Excel 列一筆，data 是「中文標頭 → 值」──────────────────────
-- user_id 刻意冗餘存一份，讓 RLS 不必再查 datasets；組合外鍵保證它和所屬資料集一致。

create table public.dataset_rows (
  user_id uuid not null default auth.uid(),
  dataset_id text not null,
  table_key text not null,
  row_index integer not null,
  data jsonb not null,
  primary key (user_id, dataset_id, table_key, row_index),
  foreign key (user_id, dataset_id) references public.datasets (user_id, id) on delete cascade
);

-- ── 儀表板：body 是 src/types 的 Dashboard ─────────────────────────────────
-- 不對 datasetId 加外鍵：刪除資料集時儀表板要保留，畫面上顯示「資料集遺失」。

create table public.dashboards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  schema_version integer not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (body ->> 'id' = id)
);

create trigger dashboards_set_updated_at
before update on public.dashboards
for each row execute function public.set_updated_at();

-- ── 權限與 RLS ─────────────────────────────────────────────────────────────
-- 只開放給登入的使用者（authenticated），anon 沒有任何 policy，等於完全不能存取。
-- Supabase 的 default privileges 會把新的 public 表開給 anon，這裡先收回，不只靠 RLS 擋。

revoke all on public.datasets, public.dataset_rows, public.dashboards from anon;

grant select, insert, update, delete on public.datasets to authenticated;
grant select, insert, update, delete on public.dataset_rows to authenticated;
grant select, insert, update, delete on public.dashboards to authenticated;

alter table public.datasets enable row level security;
alter table public.dataset_rows enable row level security;
alter table public.dashboards enable row level security;

create policy "owner can manage own datasets"
on public.datasets for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can manage own dataset rows"
on public.dataset_rows for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can manage own dashboards"
on public.dashboards for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ── Storage：原始 Excel 檔，路徑是 <user_id>/<dataset_id>.xlsx ──────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-files',
  'source-files',
  false,
  52428800, -- 50 MB
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
);

create policy "owner can manage own source files"
on storage.objects for all to authenticated
using (
  bucket_id = 'source-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'source-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

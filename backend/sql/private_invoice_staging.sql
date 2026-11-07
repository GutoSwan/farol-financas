-- Reprodutibilidade da estrutura em Supabase Dev; NÃO executar em produção sem revisão.
-- A estrutura foi aplicada no banco Dev por migrações gerenciadas.
create table if not exists public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."Workspace"(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  billing_month varchar(7) not null check (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  encrypted_metadata text not null check (length(encrypted_metadata) between 40 and 16384),
  metadata_key_version varchar(32) not null,
  object_key uuid not null unique default gen_random_uuid(),
  encrypted_file_sha256 char(64),
  encrypted_file_size integer check (encrypted_file_size between 1 and 15728640),
  state varchar(16) not null default 'PENDING' check (state in ('PENDING','READY','QUARANTINED')),
  visibility varchar(12) not null default 'PERSONAL' check (visibility = 'PERSONAL'),
  scan_status varchar(16) not null default 'PENDING' check (scan_status in ('PENDING','CLEAN','INFECTED','FAILED')),
  created_at timestamptz not null default now(),
  constraint ready_file_integrity check (state <> 'READY' or (encrypted_file_sha256 is not null and encrypted_file_size is not null))
);
create index if not exists invoice_documents_workspace_month on public.invoice_documents(workspace_id,billing_month);
alter table public.invoice_documents enable row level security;
revoke all on public.invoice_documents from public, anon, authenticated;
-- Acesso à tabela apenas por servidor autorizado; nenhuma policy de cliente.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('farol-invoices-private','farol-invoices-private',false,15728640,array['application/octet-stream']::text[])
on conflict (id) do update set public=false,file_size_limit=15728640,allowed_mime_types=array['application/octet-stream']::text[];
-- Não adicionar policies em storage.objects para este bucket.

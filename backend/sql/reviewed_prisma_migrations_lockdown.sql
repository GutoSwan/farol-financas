-- Farol Finanças | REVISÃO OBRIGATÓRIA ANTES DE PRODUÇÃO
-- A aplicação NÃO executa este arquivo automaticamente.
-- Confirmar backup, role proprietário e conexão Prisma de migração antes da execução.
-- Problema verificado em 2026-11-09: public._prisma_migrations sem RLS e
-- com SELECT/INSERT/UPDATE expostos a anon e authenticated no Supabase de produção.
--
-- Prisma deve aplicar migrações por conta administrativa confiável, não por
-- anon / authenticated. Nenhuma policy pública deve ser criada aqui.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'Tabela interna do Prisma não localizada. Nenhuma alteração aplicada.';
  END IF;
END $$;

REVOKE ALL PRIVILEGES ON TABLE public."_prisma_migrations"
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Executar APÓS e conferir que os cinco testes de acesso são false:
SELECT
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='_prisma_migrations';

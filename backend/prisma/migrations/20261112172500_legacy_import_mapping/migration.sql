-- Farol v0.30 | Mapeamento legado -> PostgreSQL.
-- Etapa ADITIVA: cria tabela vazia, não importa/exclui/altera registros financeiros.
-- A API ainda NÃO possui endpoint de importação: a Preview segue sem escritas.
-- SHA-256 e UUID de origem não constituem autorização. O backend verifica membro OWNER.
CREATE TABLE IF NOT EXISTS public."LegacyImportMapping" (
  "id" UUID NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "entityType" VARCHAR(32) NOT NULL,
  "sourceWorkspaceKey" CHAR(64) NOT NULL,
  "sourceKey" CHAR(64) NOT NULL,
  "contentFingerprint" CHAR(64) NOT NULL,
  "destinationRecordId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyImportMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LegacyImportMapping_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LegacyImportMapping_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES public."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LegacyImportMapping_sha256_check"
    CHECK ("sourceKey" ~ '^[0-9a-f]{64}$'
       AND "sourceWorkspaceKey" ~ '^[0-9a-f]{64}$'
       AND "contentFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "LegacyImportMapping_entityType_check"
    CHECK ("entityType" IN (
      'workspace', 'bill', 'monthly-entry', 'fixed-expense', 'fixed-payment',
      'transaction', 'budget-project', 'budget-item', 'budget-quote'
    )),
  CONSTRAINT "LegacyImportMapping_workspace_identity_check"
    CHECK (
      ("entityType" = 'workspace'
        AND "destinationRecordId" = "workspaceId"
        AND "sourceWorkspaceKey" = "sourceKey")
      OR
      ("entityType" <> 'workspace'
        AND "sourceWorkspaceKey" <> "sourceKey")
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "LegacyImportMapping_ownerUserId_sourceKey_key"
  ON public."LegacyImportMapping" ("ownerUserId", "sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "LegacyImportMapping_entityType_destinationRecordId_key"
  ON public."LegacyImportMapping" ("entityType", "destinationRecordId");
CREATE INDEX IF NOT EXISTS "LegacyImportMapping_ownerUserId_workspaceId_idx"
  ON public."LegacyImportMapping" ("ownerUserId", "workspaceId");

-- A tabela é acessada somente por Prisma no backend, nunca diretamente por
-- anon/authenticated do Supabase Data API. Não criar policies permissivas.
ALTER TABLE public."LegacyImportMapping" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."LegacyImportMapping" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE public."LegacyImportMapping" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE public."LegacyImportMapping" FROM authenticated;
  END IF;
END $$;

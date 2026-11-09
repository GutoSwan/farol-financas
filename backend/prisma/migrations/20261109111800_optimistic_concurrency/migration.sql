-- Versionamento otimista. Alterações aditivas e seguras em ambientes já migrados.
-- Para cada edição, o backend compara id + workspaceId + version.
ALTER TABLE public."Transaction" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public."RecurringBill" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public."FixedExpense" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public."BudgetProject" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

DO $$
DECLARE
  target text;
  cname text;
BEGIN
  FOREACH target IN ARRAY ARRAY['Transaction','RecurringBill','FixedExpense','BudgetProject']
  LOOP
    cname := target || '_version_positive';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = cname AND conrelid = format('public.%I',target)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ("version" >= 1)',target,cname);
    END IF;
  END LOOP;
END $$;

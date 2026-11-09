-- Versionamento otimista: evita sobrescrita de edições simultâneas.
-- Adição não destrutiva, mantém os registros atuais em version = 1.
-- Somente aplicar ao banco Supabase DEV; produção requer migração aprovada separadamente.
ALTER TABLE public."Transaction"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public."RecurringBill"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public."FixedExpense"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public."BudgetProject"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public."Transaction"
  ADD CONSTRAINT "Transaction_version_positive" CHECK ("version" >= 1);
ALTER TABLE public."RecurringBill"
  ADD CONSTRAINT "RecurringBill_version_positive" CHECK ("version" >= 1);
ALTER TABLE public."FixedExpense"
  ADD CONSTRAINT "FixedExpense_version_positive" CHECK ("version" >= 1);
ALTER TABLE public."BudgetProject"
  ADD CONSTRAINT "BudgetProject_version_positive" CHECK ("version" >= 1);

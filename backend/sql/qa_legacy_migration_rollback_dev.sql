-- EXCLUSIVAMENTE SUPABASE DEV (tvirkrjkgdtybtcundon).
-- Simulação de um lote completo de migração em tabelas reais, com identidades
-- sintéticas e transação integralmente revertida. NUNCA remover ROLLBACK.
-- Este teste de esquema/FK não substitui E2E autenticado pela API.

BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $qa$
DECLARE
  owner_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  workspace_id uuid := gen_random_uuid();
  bill_id uuid := gen_random_uuid();
  entry_id uuid := gen_random_uuid();
  fixed_id uuid := gen_random_uuid();
  payment_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  item_id uuid := gen_random_uuid();
  quote_id uuid := gen_random_uuid();
  transaction_id uuid := gen_random_uuid();
  found_role text;
BEGIN
  INSERT INTO public."User" (id) VALUES (owner_id), (viewer_id);
  INSERT INTO public."Workspace" (id, name)
    VALUES (workspace_id, '__farol_qa_legacy_rollback_20261117__');
  INSERT INTO public."WorkspaceMember" ("userId", "workspaceId", role)
    VALUES (owner_id, workspace_id, 'OWNER'), (viewer_id, workspace_id, 'VIEWER');

  INSERT INTO public."RecurringBill" (id, "workspaceId", name, "dueDay", active)
    VALUES (bill_id, workspace_id, 'QA Energia', 10, true);
  INSERT INTO public."MonthlyBillEntry"
    (id, "billId", "yearMonth", "amountCents", status, "paidAt")
    VALUES (entry_id, bill_id, '2026-11', 1234, 'PAID', '2026-11-10T10:00:00Z');
  INSERT INTO public."FixedExpense"
    (id, "workspaceId", name, "amountCents", "dueDay", "startMonth", "endBeforeMonth")
    VALUES (fixed_id, workspace_id, 'QA Internet', 5678, 15, '2026-11', NULL);
  -- Migrações antigas não podem inventar a data real do pagamento.
  INSERT INTO public."FixedExpensePayment" (id, "fixedExpenseId", "yearMonth", "paidAt")
    VALUES (payment_id, fixed_id, '2026-11', NULL);

  INSERT INTO public."BudgetProject"
    (id, "workspaceId", title, category, "targetCents", status, notes)
    VALUES (project_id, workspace_id, 'QA Reforma', 'Casa', 25000, 'PLANNING', 'Fictício');
  INSERT INTO public."BudgetItem" (id, "projectId", title, "plannedCents")
    VALUES (item_id, project_id, 'QA Serviço', 10000);
  INSERT INTO public."BudgetQuote"
    (id, "itemId", provider, "amountCents", "estimatedDays", "materialsIncluded", notes, selected)
    VALUES (quote_id, item_id, 'Fornecedor fictício', 9000, 5, true, '', true);
  INSERT INTO public."Transaction"
    (id, "workspaceId", description, category, "amountCents", kind, "occurredOn",
     "budgetProjectId", "budgetItemId")
    VALUES (transaction_id, workspace_id, 'QA Despesa', 'Casa', 333, 'EXPENSE',
      '2026-11-17', project_id, item_id);

  INSERT INTO public."LegacyImportMapping"
    (id, "ownerUserId", "workspaceId", "entityType", "sourceWorkspaceKey",
     "sourceKey", "contentFingerprint", "destinationRecordId")
    VALUES (gen_random_uuid(), owner_id, workspace_id, 'workspace', repeat('a',64),
      repeat('a',64), repeat('c',64), workspace_id);
  INSERT INTO public."LegacyImportMapping"
    (id, "ownerUserId", "workspaceId", "entityType", "sourceWorkspaceKey",
     "sourceKey", "contentFingerprint", "destinationRecordId")
    VALUES (gen_random_uuid(), owner_id, workspace_id, 'transaction', repeat('a',64),
      repeat('b',64), repeat('d',64), transaction_id);

  IF NOT EXISTS (
    SELECT 1 FROM public."Transaction" t
    JOIN public."BudgetItem" i ON i.id = t."budgetItemId"
    JOIN public."BudgetProject" p ON p.id = i."projectId"
    WHERE t.id = transaction_id AND t."workspaceId" = workspace_id
      AND p.id = t."budgetProjectId" AND t."amountCents" = 333
  ) THEN
    RAISE EXCEPTION 'QA: lançamento e orçamento não preservaram o vínculo/valor';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."FixedExpensePayment"
    WHERE id = payment_id AND "paidAt" IS NULL AND "yearMonth" = '2026-11'
  ) THEN
    RAISE EXCEPTION 'QA: data desconhecida do pagamento foi inventada';
  END IF;
  SELECT role::text INTO found_role FROM public."WorkspaceMember"
    WHERE "userId" = owner_id AND "workspaceId" = workspace_id;
  IF found_role IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'QA: proprietário inválido';
  END IF;
  SELECT role::text INTO found_role FROM public."WorkspaceMember"
    WHERE "userId" = viewer_id AND "workspaceId" = workspace_id;
  IF found_role IS DISTINCT FROM 'VIEWER' THEN
    RAISE EXCEPTION 'QA: VIEWER recebeu permissão de proprietário';
  END IF;

  -- Um reenvio não pode gerar outra correspondência para a mesma origem.
  BEGIN
    INSERT INTO public."LegacyImportMapping"
      (id, "ownerUserId", "workspaceId", "entityType", "sourceWorkspaceKey",
       "sourceKey", "contentFingerprint", "destinationRecordId")
      VALUES (gen_random_uuid(), owner_id, workspace_id, 'transaction', repeat('a',64),
        repeat('b',64), repeat('d',64), transaction_id);
    RAISE EXCEPTION 'QA: chave de migração duplicada foi aceita';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- esperado
  END;

  -- Histórico órfão deve falhar, sem deixar uma linha adicional.
  BEGIN
    INSERT INTO public."MonthlyBillEntry"
      (id, "billId", "yearMonth", "amountCents", status)
      VALUES (gen_random_uuid(), gen_random_uuid(), '2026-11', 999, 'PENDING');
    RAISE EXCEPTION 'QA: histórico sem conta foi aceito';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL; -- esperado
  END;

  IF (SELECT count(*) FROM public."MonthlyBillEntry" WHERE "billId" = bill_id) <> 1 OR
     (SELECT count(*) FROM public."LegacyImportMapping"
      WHERE "ownerUserId" = owner_id) <> 2 THEN
    RAISE EXCEPTION 'QA: uma falha parcial modificou o lote';
  END IF;
END;
$qa$;

SELECT 'QA_DEV_ROLLBACK_PASS' AS result;
ROLLBACK;

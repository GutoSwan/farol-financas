-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "BudgetProjectStatus" AS ENUM ('PLANNING', 'QUOTING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("userId","workspaceId")
);

-- CreateTable
CREATE TABLE "RecurringBill" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyBillEntry" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyBillEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "startMonth" VARCHAR(7) NOT NULL,
    "endBeforeMonth" VARCHAR(7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpensePayment" (
    "id" UUID NOT NULL,
    "fixedExpenseId" UUID NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedExpensePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "budgetProjectId" UUID,
    "budgetItemId" UUID,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetProject" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "status" "BudgetProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "plannedCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetQuote" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "provider" VARCHAR(120) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "estimatedDays" INTEGER,
    "materialsIncluded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- CreateIndex
CREATE INDEX "RecurringBill_workspaceId_idx" ON "RecurringBill"("workspaceId");

-- CreateIndex
CREATE INDEX "MonthlyBillEntry_yearMonth_idx" ON "MonthlyBillEntry"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyBillEntry_billId_yearMonth_key" ON "MonthlyBillEntry"("billId", "yearMonth");

-- CreateIndex
CREATE INDEX "FixedExpense_workspaceId_idx" ON "FixedExpense"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpensePayment_fixedExpenseId_yearMonth_key" ON "FixedExpensePayment"("fixedExpenseId", "yearMonth");

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_occurredOn_idx" ON "Transaction"("workspaceId", "occurredOn");

-- CreateIndex
CREATE INDEX "Transaction_budgetProjectId_idx" ON "Transaction"("budgetProjectId");

-- CreateIndex
CREATE INDEX "BudgetProject_workspaceId_idx" ON "BudgetProject"("workspaceId");

-- CreateIndex
CREATE INDEX "BudgetItem_projectId_idx" ON "BudgetItem"("projectId");

-- CreateIndex
CREATE INDEX "BudgetQuote_itemId_idx" ON "BudgetQuote"("itemId");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyBillEntry" ADD CONSTRAINT "MonthlyBillEntry_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RecurringBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpensePayment" ADD CONSTRAINT "FixedExpensePayment_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_budgetProjectId_fkey" FOREIGN KEY ("budgetProjectId") REFERENCES "BudgetProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetProject" ADD CONSTRAINT "BudgetProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BudgetProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetQuote" ADD CONSTRAINT "BudgetQuote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BudgetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segurança do Supabase: bloquear acesso direto ao Data API público.
-- Autorização dos membros é feita exclusivamente pelo backend Fastify após JWT.
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."User" FROM anon, authenticated;
ALTER TABLE "public"."Workspace" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."Workspace" FROM anon, authenticated;
ALTER TABLE "public"."WorkspaceMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."WorkspaceMember" FROM anon, authenticated;
ALTER TABLE "public"."RecurringBill" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."RecurringBill" FROM anon, authenticated;
ALTER TABLE "public"."MonthlyBillEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."MonthlyBillEntry" FROM anon, authenticated;
ALTER TABLE "public"."FixedExpense" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."FixedExpense" FROM anon, authenticated;
ALTER TABLE "public"."FixedExpensePayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."FixedExpensePayment" FROM anon, authenticated;
ALTER TABLE "public"."Transaction" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."Transaction" FROM anon, authenticated;
ALTER TABLE "public"."BudgetProject" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."BudgetProject" FROM anon, authenticated;
ALTER TABLE "public"."BudgetItem" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."BudgetItem" FROM anon, authenticated;
ALTER TABLE "public"."BudgetQuote" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."BudgetQuote" FROM anon, authenticated;

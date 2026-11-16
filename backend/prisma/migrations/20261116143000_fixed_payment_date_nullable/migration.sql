-- Permite preservar pagamentos legados de gastos fixos sem inventar data de quitação.
-- NULL em paidAt = mês foi pago, mas a data exata não consta no histórico.
-- Mantém DEFAULT CURRENT_TIMESTAMP para pagamentos NOVOS.
-- Não cria/exclui pagamentos nem modifica timestamps existentes.
-- Aplicar PRIMEIRO em ambiente Dev isolado e verificar o esquema antes de habilitar escritas.
ALTER TABLE public."FixedExpensePayment" ALTER COLUMN "paidAt" DROP NOT NULL;

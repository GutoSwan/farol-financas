# Procedimento seguro de recuperação de TOTP (Farol Finanças)

## Contexto

Se uma conta TOTP for removida do aplicativo autenticador no telefone, isso **não**
remove o fator `verified` no Supabase Auth. A aplicação não recebe notificação do
aplicativo autenticador e não pode inferir que o dispositivo foi perdido.

Após e-mail + senha (AAL1), o usuário poderá consultar o estado da própria conta,
mas **não poderá trocar nem remover fatores verificados** sem AAL2.

Este procedimento se aplica exclusivamente ao **Supabase Dev** enquanto os testes
do Farol não estiverem aprovados. Não aplicar em produção sem processo específico
de aprovação e registro de auditoria.

## Recuperação com um dispositivo ainda disponível

1. Entrar no Farol com e-mail + senha.
2. Confirmar um código de um TOTP ainda vinculado (AAL2).
3. Abrir `/conta` -> **Segurança · Gerenciar autenticadores**.
4. **Adicionar** um autenticador de reserva ou **Substituir** o antigo.
5. A substituição exige verificação do TOTP atual e do novo, e só depois
   tenta remover o fator antigo.
6. Confirmar que o novo dispositivo funciona em um login novo antes de remover
   outros fatores de reserva.

## Recuperação após perda de TODOS os fatores

1. Não oferecer autocorreção baseada apenas em senha, e-mail, links de redefinição
   de senha ou identificador do fator. **Nenhum desses substitui o segundo fator.**
2. O responsável pela aplicação deve validar a identidade do solicitante por
   um método confiável e independente. Na aplicação pessoal, isso exige avaliação
   manual e confirmação inequívoca do proprietário legítimo da conta de teste.
3. Em ambiente administrativo **confiável e isolado**, utilizar o endpoint oficial
   Supabase Auth Admin para remover *apenas* o fator selecionado do usuário
   validado: `supabase.auth.admin.mfa.deleteFactor({ userId, id })`.
   Não expor a chave administrativa ao frontend, ao usuário nem ao chat.
   Não executar `DELETE` diretamente nas tabelas `auth.*`.
4. Registrar a data, conta validada, justificativa, aprovador, ação e resultado,
   evitando guardar os códigos ou as chaves secretas.
5. A API Admin invalida sessões após excluir fator verificado; exigir login
   novamente e realizar o fluxo `/configurar-2fa`.
6. Confirmar TOTP novo (AAL2) e cadastrar dispositivo de reserva separado.
7. Manter acessos financeiros bloqueados enquanto o usuário estiver em AAL1.

## Limitações atuais

- O app mostra orientações de recuperação, mas ainda não possui canal
  administrativo de análise e aprovação de solicitações.
- O Supabase não gera códigos de recuperação TOTP; a alternativa disponível é
  cadastrar fatores de reserva.
- O fluxo administrativo de perda total **não é automático** e não deve ser
  habilitado sem uma camada de verificação de identidade e auditoria.
- Não migrar nem habilitar faturas de cartão reais até validar o E2E de
  autenticação, autorização, backup e recuperação.

Referências oficiais:
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/reference/javascript/auth-mfa-unenroll
- https://supabase.com/docs/reference/javascript/auth-admin-deletefactor

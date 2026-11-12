# Revisar migração (Farol Financeiro) • 12/11/2026

Nova rota `/revisar-migracao` acessível por **Meu perfil > Revisar migração**
ou pela etapa 8 de `/backup-financeiro`.

Fluxo de leitura:
1. Antes de acessar localStorage, roteador exige login, MFA AAL2 e dono dos dados locais.
2. Tela confirma novamente identidade do Supabase, Authenticator e vínculo local.
3. Apresenta espaços, contagens e detalhes de lançamentos, contas, históricos,
   gastos fixos, projetos, itens e cotações do navegador, sem envio.
4. Consulta identidade da API e espaços online da conta atual.
5. Usuário seleciona espaço OWNER de destino; o Farol consulta 4 módulos
   via GET com limite 50 e informa ocupação/truncamento.
6. Detecta valores/mapeamentos inconsistentes, faltas de data e lotes superiores
   a 25 itens. Nomes iguais **não provam identidade**.
7. Confere novamente conta/MFA/fingerprint local após consultas.
8. Limpa dados em memória no logout, ao sair da tela ou se outra aba
   modificar o armazenamento local.

A interface informa que **somente leitura não substitui uma confirmação
de backup**. O botão de transferência está **desabilitado em todas as
circunstâncias**. Nenhuma requisição POST de migração é executada.

Ainda pendente antes de liberar migração: teste E2E autenticado em banco
descartável, tratamento de pagamentos fixos antigos, confirmação explícita
do backup e proteção para importação em lotes maiores/concorrência.

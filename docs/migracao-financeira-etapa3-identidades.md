# Farol Finanças: integridade entre backup, simulação e importação futura

## Escopo desta etapa (sem gravação de dados)

Foi identificado um risco de consistência no fluxo de migração: o usuário podia verificar um arquivo criptografado válido e, em seguida, executar a análise sobre uma versão diferente dos registros locais. O backup e a simulação não estavam unidos por uma prova de igualdade do conteúdo.

Agora `fingerprintFinancialBackup()` calcula uma impressão digital SHA-256 do conteúdo financeiro, **excluindo exclusivamente `exportedAt`**. A inspeção do arquivo criptografado devolve também a impressão digital dos dados efetivamente descriptografados com AES-GCM.

A página `/backup-local` só executa o dry-run após confirmar:
1. Sessão ativa, MFA AAL2 e vínculo com os registros financeiros locais.
2. A conta conferida é a mesma utilizada para o backup inspecionado.
3. Os registros locais atuais possuem o mesmo fingerprint do arquivo previamente verificado.
4. O conteúdo permanece igual após as consultas da API, antes da exibição do resultado.

Se houver alteração no meio do processo, o relatório é recusado e a pessoa precisa gerar e conferir um backup novo. Gerar outro backup, selecionar outro arquivo ou atualizar o inventário apaga o estado de conferência anterior. **Nenhum arquivo é restaurado, enviado ou excluído.**

## Manifesto de identidades, somente em código

O módulo puro `planLegacyIdentifiers()`, ainda sem rota HTTP e sem botão no frontend, prepara um **manifesto de identidades locais**, contendo:
- Identidade de origem estável como SHA-256 do titular Supabase + espaço local + categoria + ID legado.
- SHA-256 de conteúdo por registro, para detectar modificações entre tentativas.
- Chaves distintas para contas, lançamentos, orçamentos e seus subitens, mesmo com IDs legados iguais entre categorias.
- Identidade lógica de mensalidades por `billId + yearMonth`, alinhada à restrição de unicidade do banco.
- Referências de pagamentos de gastos fixos com aviso explícito de que a data/hora real da quitação **não existe** na persistência antiga.
- Manifesto com limite de 12.000 linhas e falha fechada diante de registros incompatíveis.
- Ordenação estável para não considerar mera mudança da ordem dos arrays como migração nova.

**Importante:** as chaves de origem **não são UUIDs de destino**, não concedem autorização e não garantem idempotência sem um índice UNIQUE e uma transação no PostgreSQL. O backend precisará autenticar o titular (JWT/sessão), exigir AAL2, conferir o papel OWNER, atribuir UUIDs, armazenar correspondência de origens e verificar conflitos de conteúdo antes de qualquer importação.

## Testes

- Fingerprint mantém identidade mesmo quando `exportedAt` muda.
- Modificar um único valor financeiro, mesmo sem alterar as contagens, muda a impressão digital.
- A função anterior de inspeção permanece compatível para não quebrar consumidores existentes.
- Manifestos repetidos para a mesma conta/conteúdo retornam chaves estáveis; outras contas têm chaves distintas.
- IDs iguais em categorias distintas não colidem.
- Mudanças de valores produzem fingerprint de conteúdo diferente.
- Pagamentos sem data real permanecem pendentes de revisão, sem preenchimento fictício.
- Nenhuma operação nesta etapa grava dados no `localStorage` nem no Supabase.

## Próximos bloqueios para importação

1. Criar no backend, em branch própria, repositório de correspondência legado -> remoto e índice único por usuário/espaco/tipo/chave.
2. Importar exclusivamente por transação, com validação das referências, resumo prévio, rollback e autorização do titular.
3. Solucionar a representação de pagamentos antigos sem data e os eventuais conflitos com dados da nuvem.
4. Validar em PostgreSQL temporário e em Supabase Dev isolado com dois usuários e repetição de lote.
5. Revisar configuração de segurança em produção, sem aplicar SQL automaticamente.
6. Somente depois de verificar uma cópia segura e a migração concluída, oferecer fluxo explícito para limpeza dos registros locais.

Nenhuma mudança de banco, ambiente de produção, domínio ou Vercel foi feita nesta etapa.

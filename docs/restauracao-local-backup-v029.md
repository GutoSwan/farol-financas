# Restauração local criptografada (Farol Preview)

Esta etapa restaura, **somente no navegador atual**, backups AES-256-GCM gerados pelo Farol.
Não restaura dados na nuvem; não importa contas de outros usuários; não copia tokens,
presentes ou fotos.

## Pré-condições
- Entrar na mesma conta Supabase do backup e concluir TOTP/AAL2.
- A conta precisa ter confirmado o vínculo dos registros deste navegador.
- O navegador precisa estar sem registros financeiros: apenas o espaço inicial vazio.
- O arquivo deve ser da mesma conta e do formato v1 reconhecido pelo Farol.
- Fechar outras abas da mesma Preview durante a restauração.

## Fluxo
1. Abrir Backup financeiro, fazer login e confirmar AAL2.
2. Conferir arquivo .json (etapa 3) com senha do backup; o Farol mostra só o inventário.
3. Na etapa 4, digitar novamente a senha e RESTAURAR, com confirmação explícita.
4. O Farol valida de novo identidade/AAL2, conteúdo e fingerprint.
5. Se houver qualquer registro existente, recusa a operação sem sobrescrever.
6. Grava chaves locais com cópia prévia em memória, verifica leitura e compara o snapshot.
7. Na falha tenta restaurar as chaves anteriores; se falhar o rollback, interrompa uso,
   não limpe o navegador e preserve o arquivo original.
8. Depois da confirmação, atualizar para recarregar os dados.

## Limitações importantes
- Não há mesclagem entre registros existentes e backup.
- localStorage não fornece transações ACID, e outra aba aberta pode alterar registros simultaneamente.
- A restauração não elimina risco de acesso aos registros locais por scripts da mesma origem.
- Em caso de dúvida ou erro, preservar o backup criptografado original.
- Este fluxo está restrito à Preview; promover produção exige QA manual real.

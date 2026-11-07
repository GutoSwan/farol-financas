# Farol | Política de liberação de faturas v0.14

STATUS: NÃO LIBERAR DADOS REAIS. Implementação inicial sem certificação LGPD/PCI DSS ou garantia contra vazamentos.

## Regras técnicas
- Faturas pessoais por padrão. Mesmo membros de espaço familiar não acessam faturas de outro usuário.
- Nunca capturar PAN completo, CVV, senhas bancárias, tokens de banco nem validade de cartão.
- Campos permitidos: emissor, total em centavos, competência, vencimento e últimos quatro dígitos opcionais.
- AES-256-GCM no backend, IV de 12 bytes único por objeto, tag de 16 bytes, AAD vinculando espaço, fatura e tipo metadata/pdf.
- FAROL_INVOICE_KEY_V1 é uma chave de 32 bytes base64 guardada somente no cofre de segredos do backend, com rotação e recuperação planejadas.
- Bucket farol-invoices-private é privado, armazena somente bytes cifrados como application/octet-stream. Nenhuma URL pública ou política de leitura do cliente.
- Banco guarda encrypted_metadata, metadata_key_version e metadados técnicos mínimos; o estado inicial é QUARANTINED, scan_status PENDING.
- PDF fica em quarentena até scanner antimalware independente confirmar CLEAN. Cabeçalho PDF não equivale a arquivo seguro.
- Payload até 2 MB de PDF nesta versão, pois base64 é enviado pela API Vercel.
- Sem renderizar PDFs não confiáveis no navegador; futuro download após verificação deve exigir autorização e no-store.

## Liberações explícitas no servidor
- FAROL_FINANCIAL_WRITES_ENABLED precisa ser exatamente true; do contrário, nenhuma gravação financeira.
- FAROL_INVOICE_UPLOADS_ENABLED também precisa ser exatamente true; em Preview uploads permanecem bloqueados independentemente das flags.
- SUPABASE_URL, DATABASE_URL e SUPABASE_STORAGE_SERVER_KEY devem referir-se ao mesmo projeto Dev nos testes, sem imprimir credenciais.
- A chave de armazenamento do servidor deve ter permissões mínimas e nunca aparecer no frontend, cookies, analytics ou logs.

## Bloqueadores obrigatórios para liberação
1. Confirmar isolamento completo do backend Preview em Supabase Dev, sem conexão com produção.
2. Criar duas identidades de teste por fluxo normal e testar OWNER/EDITOR/VIEWER, MFA, revogação e acesso cruzado.
3. Configurar scanner de malware e quarentena; nenhum download disponível antes da análise.
4. Testar recuperação e rotação de chave usando KMS, sem perder arquivos antigos.
5. Resolver registros locais em texto legível, backup, migração com rollback e não exposição entre contas.
6. Validar quotas, rate limiting, limites de arquivo, falhas entre upload e banco e limpeza de objetos órfãos.
7. Revisar permissões mínimas, logs, monitoramento, incidente, privacidade, retenção e direitos aplicáveis conforme LGPD.
8. Teste de penetração / IDOR e revisão técnica independente antes de aceitar faturas reais.

## Critérios de testes
- Sem token: 401; sem MFA: 403; workspace alheio: 404; VIEWER não pode enviar.
- Outra conta não deve visualizar listas de faturas pessoais do dono.
- Chave incorreta, arquivo adulterado e AAD de outro espaço/fatura devem impedir descriptografia.
- Arquivo inválido, muito grande ou com campos extras deve ser recusado antes de persistência.
- Falha na inserção DB após upload requer compensação e reconciliação automática.
- Novos deployments exigem testes verdes e autorização explícita de release.

## Decisão
NÃO LIBERAR até todos os bloqueadores serem resolvidos e testes de ponta a ponta com identidades distintas passarem.

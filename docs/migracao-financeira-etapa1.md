# Farol Finanças · Migração segura dos dados locais (etapa 1)

## O que esta etapa faz

O Farol já possui persistência local, com dados financeiros não cifrados no armazenamento do navegador. A função `buildLocalFinancialBackup()` extrai uma cópia **somente leitura** de todos os espaços financeiros e seus módulos:

- Espaços financeiros e espaço ativo
- Contas recorrentes
- Históricos mensais
- Gastos fixos
- Lançamentos avulsos
- Projetos, itens e cotações de orçamento

A tela `/backup-local` substitui o botão anterior que baixava JSON legível, e exige a identidade remota do Supabase, MFA AAL2 e propriedade do armazenamento local antes de ler ou preparar arquivos. A tela possui confirmação explícita de titularidade.

O arquivo é cifrado com a Web Crypto API usando AES-256-GCM e uma chave derivada da senha escolhida na hora por PBKDF2-SHA256 com 310.000 iterações, salt aleatório de 16 bytes e nonce aleatório de 12 bytes. O identificador Supabase do proprietário participa dos dados autenticados (AAD), impedindo abrir um arquivo de outra conta mediante troca do cabeçalho. A senha **não** fica em localStorage, arquivo, endpoint nem URL.

A pessoa pode selecionar o arquivo cifrado e informar sua senha para verificar integridade e contagem de registros. A conferência descriptografa **apenas em memória**, valida a estrutura e **não** escreve no navegador nem no Supabase.

O backup não inclui credenciais Supabase, tokens, fotos e presentes. O arquivo também não é cópia de mídias do IndexedDB.

## Limites de segurança

1. Os dados originais continuam em localStorage sem criptografia. O backup os protege fora do navegador, mas não resolve a exposição local em caso de XSS ou acesso ao perfil do dispositivo.
2. O backup é restrito ao dono **vinculado** por `legacyAccess`. Os registros ainda não vinculados continuam sujeitos ao fluxo de autorização explícita anterior.
3. A senha precisa de 14 caracteres ou mais e, se perdida, não há recuperação da cópia cifrada.
4. O tamanho máximo de conteúdo antes da criptografia é 6 MB. A aplicação avisa e não altera os originais se excedido.
5. O arquivo é gerado em memória e disponibilizado para download mediante clique. O Farol não faz upload do backup.
6. A conferência faz uma validação de estrutura para **integridade e inventário**, não uma validação definitiva de todos os modelos de domínio para restauração.
7. Não publicar a funcionalidade antes de QA em Safari/iPhone, e não declarar os dados migrados à nuvem após criar o backup.

## Roteiro QA

1. Entrar com usuário válido e concluir 2FA. Abrir `/backup-local`.
2. Validar contagens contra os registros de cada espaço, incluindo o espaço padrão e espaços adicionais.
3. Confirmar que o menu anterior de download de JSON sem proteção não está mais disponível.
4. Criar backup com senha de pelo menos 14 caracteres, baixar `.json` e verificar que nomes, valores e dados financeiros não aparecem legíveis no arquivo.
5. Testar conferência com a senha correta, senha errada e arquivo adulterado; nenhuma operação pode sobrescrever localStorage.
6. Encerrar a sessão e tentar acessar a mesma rota. A interface deve exigir login e novo 2FA.
7. Entrar com uma segunda conta de teste. Não deve conseguir acessar a lista do titular nem conferir seu backup.
8. Testar erro de localStorage corrompido, falta de suporte a Web Crypto e senha curta. O backup deve falhar sem modificar registros.
9. Verificar o download no Safari e no PWA do iPhone, incluindo armazenamento do arquivo fora do app e recuperação da senha pelo próprio usuário.
10. Confirmar que nenhuma requisição HTTP com dados do backup é enviada pela aplicação.

## Próximos passos antes de copiar para a nuvem

- Definir o mapeamento de todos os módulos e suas relações (`workspace`, contas mensais, históricos, fixos, orçamento e referências entre transações e projetos) para o schema do backend.
- Implementar importação com `dry-run` e relatório de incompatibilidades no servidor, sem gravar dados.
- Criar lote idempotente (IDs de origem e chave de operação, sem duplicações), transação no Postgres, autorização OWNER + AAL2, escopo de workspace e limite de payload.
- Confirmar depois da importação: quantidade, totais, histórico mês a mês, dono de cada registro e possibilidade de repetir com segurança.
- Não remover dados locais antes da confirmação do usuário, segunda verificação da integridade e estratégia de rollback.
- Resolver primeiro o achado de segurança de `public._prisma_migrations` em produção, mediante revisão técnica e backup.

**Nenhuma migração real de banco ou upload de registros é feita por esta PR.**

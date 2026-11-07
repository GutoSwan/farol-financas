# Farol Finanças | Modelo de segurança v0.14

Estado: **em desenvolvimento**. Este documento não certifica conformidade com a LGPD nem ausência de vulnerabilidades.

## Princípios
- Negar acesso por padrão (deny by default).
- Autenticar e autorizar cada requisição financeira no servidor, inclusive por ID de recurso.
- Isolar todos os dados por workspace e verificar a associação ativa do usuário ao workspace.
- Nunca confiar em IDs, papéis de acesso ou indicadores de MFA fornecidos apenas pelo navegador.
- Não armazenar PAN completo, CVV, senhas bancárias ou credenciais de provedores financeiros.
- Não armazenar informações de fatura em cache público, service workers, logs ou analytics.
- Manter os projetos de desenvolvimento e produção separados; nunca usar dados reais em testes.

## Autenticação e sessão
- Rotas privadas: exigir validação remota do usuário via Supabase Auth (getUser), com redirecionamento para /entrar se inválida.
- Sessão persistente não equivale a autorização. Toda API deve validar o JWT e a associação ao recurso.
- MFA: o guard atual verifica desafios pendentes para fatores já cadastrados. **Ainda não torna MFA obrigatório** a todos os usuários.
- Para acesso a faturas e operações sensíveis, exigir AAL2 no backend e validar a política de sessão e revogação.
- Configurar prevenção de senhas vazadas, limites de tentativas e proteção contra enumeração de usuários.

## Isolamento e permissões
- Modelo atual: User, Workspace e WorkspaceMember com papéis OWNER, EDITOR e VIEWER.
- A API deve buscar cada recurso pelo ID e garantir que pertence a um workspace do usuário autenticado.
- Verificar permissões por operação: leitura, criação, edição, exclusão e compartilhamento.
- Não usar user_metadata como autoridade para permissão administrativa.
- Não adicionar políticas RLS genéricas do tipo TO authenticated sem predicado de posse.
- O backend Prisma pode usar conexão que não respeita RLS; neste caso verificações server-side são obrigatórias e devem ser testadas.

## Proteção de dados
- HTTPS/TLS para dados em trânsito; configurações apropriadas para criptografia em repouso.
- Criptografia autenticada dos campos altamente sensíveis (preferencialmente AES-256-GCM), no backend, usando KMS/gestor de segredos; chaves jamais no frontend, Git ou próprio banco.
- Separar nonce/IV por operação, registrar versão da chave e planejar rotação e recuperação.
- PDFs de fatura: somente armazenamento privado; links temporários e autorizados ou streaming autenticado; validar tipo e tamanho; evitar indexação.
- Retornar Cache-Control: no-store em conteúdo financeiro, sem segredos ou dados de cartão em logs.
- Evitar baixar e persistir documentos em dispositivos sem consentimento e orientação de risco.

## Privacidade e LGPD
- Mapear finalidade, necessidade, base legal aplicável, operadores/suboperadores e transferências internacionais.
- Definir aviso de privacidade, retenção mínima, exportação/exclusão de dados e resposta a incidentes.
- Analisar o enquadramento de uso pessoal/familiar e eventual ampliação a terceiros antes da disponibilização.
- Revisão jurídica e testes independentes são necessários para qualquer afirmação formal de conformidade.

## Auditoria de 2026-11-07
- Produção: 11 tabelas de negócio com RLS ligado e sem políticas; _prisma_migrations tem RLS desligado e permissões concedidas a anon/authenticated; proteção contra senhas vazadas desativada.
- Desenvolvimento: 11 tabelas de negócio com RLS ligado e sem políticas; sem grants diretos dos papéis anon/authenticated em public.User.
- **Ação urgente em produção (ainda não executada):** revisar e revogar grants públicos sobre _prisma_migrations e/ou habilitar RLS sem políticas, respeitando o usuário de migrações. Validar Prisma após a correção.
- Não foi executado teste adversarial completo; situação de segurança não está certificada.

## Critérios de aprovação
1. Usuário sem sessão e usuário com token inválido não acessam páginas nem respostas financeiras.
2. Usuário A não consegue ler, alterar ou excluir recursos do usuário B alterando UUID, rota, query ou corpo.
3. VIEWER não cria, modifica, exclui ou compartilha recursos; somente OWNER pode alterar membros.
4. Faturas e seus arquivos exigem autorização server-side e MFA conforme a política.
5. Respostas financeiras não são armazenadas em caches e não aparecem em logs de erro.
6. Testes automatizados cobrindo acesso negativo, permissões e isolamento, além de análise de dependências.
7. Mudanças validadas em Dev antes de merge e deploy em produção.

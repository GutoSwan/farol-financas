# Farol Admin WEB: v0.29 Preview
Aplicação **separada** do Farol Finanças. Não gera aplicativo móvel, PWA ou cadastro público. O armazenamento de sessão é próprio do domínio do Admin e não é compartilhado com o Farol.
Os usuários precisam ter **app_metadata.farol_role = super_admin**, TOTP verificado e resposta autorizada da API.
O backend da Preview exige JWT válido, sessão ativa, AAL2 e papel atual, em vez de confiar no navegador. Se a API Dev estiver protegida por Vercel Authentication ou inacessível, o acesso **falha fechado**.
Sem leitura de dados de outros usuários nem operações globais de backup ou restauração, que continuam indisponíveis até nova auditoria.
A autenticação usa SOMENTE o projeto Supabase Dev. Não colocar service_role ou outras chaves secretas no frontend.
A função Serverless /api/v1/[...path].js é o único caminho para a API de administração. Ela usa identidade OIDC da Vercel e é restrita à Preview Dev, com fail-closed se o backend não confirmar JWT, AAL2 e papel atual.
Configuração Vercel: projeto 'farol-admin', rootDirectory 'admin-web', preview protegida por Vercel Authentication, VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY apontando para Supabase Dev.

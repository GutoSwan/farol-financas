# Diagnóstico Fastify isolado

Branch de teste, não destinada à produção. Criada da `main` para evitar dependências do app real.

- Somente `fastify@5.6.0` como dependência; sem Prisma, Supabase, TypeScript ou banco.
- Arquivo de entrada: `backend/src/app.js`.
- `backend/vercel.json` especifica o preset Fastify.
- Na Vercel, usar **Root Directory: backend** e criar deployment **Preview** desta branch.
- Testar `/`, `/health` e `/api/v1/health`: retorno esperado `{"diagnostic":"fastify-clean-isolated","status":"ok"}`.
- Não promover para Production nem fazer merge para a branch principal.

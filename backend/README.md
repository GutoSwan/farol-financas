# Fastify dentro de função Node.js nativa

Teste isolado e não destinado à produção. Sem Prisma, Supabase ou banco.

## Deploy

Vercel Preview no projeto farol-api com Root Directory = `backend`.
O `vercel.json` desliga a detecção automática de framework e publica `api/health.js` como função nativa, preservando página estática em `public/`.

Teste: `/api/health` deverá retornar `{"diagnostic":"fastify-native-handler","status":"ok"}`.

O teste diferencia falha do runtime Fastify automático de falha ao importar e usar Fastify numa função nativa. Não promover para Production.

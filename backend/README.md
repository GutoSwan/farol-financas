# Farol Finanças API · v0.4

Base do backend independente do frontend Vue. **Esta etapa não migra os dados do localStorage e não ativa login no site.** As rotas financeiras serão integradas progressivamente.

## Tecnologias

- Node.js 22+, TypeScript, Fastify 5
- PostgreSQL 16 (Docker local)
- Prisma 6.19.3, versão fixada para manter o gerador `prisma-client-js` e evitar diferenças de configuração do Prisma 7
- Supabase Auth por JWT assinado com chave assimétrica e verificação de JWKS remoto (jose)
- Vitest para testes sem exigir banco conectado

## Estrutura

```text
backend/
├── prisma/schema.prisma              # Modelo relacional inicial
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   └── repositories/
│   ├── application/use-cases/
│   ├── infrastructure/
│   │   ├── auth/
│   │   ├── database/
│   │   └── repositories/
│   ├── presentation/app.ts           # Rotas HTTP e validação de entrada
│   ├── server.ts
│   └── shared/config.ts
└── tests/
```

## Rodar localmente (PowerShell / VS Code)

Pré-requisitos: Node.js 22+ e Docker Desktop em execução.

1. Na raiz do repositório, entre em `backend` e crie seu arquivo de configuração a partir do exemplo:

```powershell
cd backend
Copy-Item .env.example .env
```

2. No arquivo `backend/.env`, ajuste `SUPABASE_URL` para a URL **real do seu projeto Supabase**, sem a service-role key. O campo do exemplo é apenas um placeholder. O `DATABASE_URL` do exemplo corresponde ao PostgreSQL local do Docker Compose; troque a senha em uma instalação real.

3. Inicie o banco e instale o backend:

```powershell
docker compose up -d
npm install
npx prisma generate
npx prisma migrate dev --name init
```

A primeira migração será gerada na sua máquina quando o Postgres estiver disponível. Revise o SQL gerado **antes** de colocá-lo em produção e registre as migrações em Git posteriormente.

4. Execute a API em desenvolvimento:

```powershell
npm run dev
```

Verificação sem login: [http://localhost:3333/api/v1/health](http://localhost:3333/api/v1/health).

Para conferir conexão com banco: [http://localhost:3333/api/v1/ready](http://localhost:3333/api/v1/ready). Esse endpoint responde 503 se o banco estiver indisponível.

### Testar e compilar

Dentro da pasta `backend`:

```powershell
npm run test
npm run build
```

Os testes automatizados de rotas usam `app.inject` e repositórios simulados; **ainda não são testes de integração com Postgres real**.

## Rotas disponíveis

| Método | Caminho | Acesso | Resultado |
|---|---|---|---|
| GET | /api/v1/health | Público | API em execução |
| GET | /api/v1/ready | Público | Checagem de conexão PostgreSQL |
| GET | /api/v1/workspaces | JWT obrigatório | Apenas os espaços do usuário autenticado |
| POST | /api/v1/workspaces | JWT obrigatório | Cria espaço e associa o usuário como OWNER |

`POST /api/v1/workspaces` aceita JSON: `{"name":"Gustavo e Ana"}`.

A autenticação **não é feita pelo frontend atual**. Para acessar rotas protegidas, é necessário um usuário autenticado em um projeto Supabase corretamente configurado e um `Authorization: Bearer <access_token>` legítimo. A API verifica assinatura, emissor, audiência e validade do token; **não** confia em `userId` passado no corpo ou URL.

A verificação de JWKS exige projeto Supabase usando **chaves de assinatura assimétricas** (RS256/ES256). Projetos ainda configurados apenas com segredo HS256 não terão suas chaves retornadas nesse JWKS e deverão migrar o método de assinatura no Supabase antes de usar o backend.

## Modelo do banco (preparação)

Inclui tabelas para `User`, `Workspace`, `WorkspaceMember`, contas mensais e histórico, despesas fixas/pagamentos, transações, projetos, itens e cotações.

- Valores são guardados em centavos; horários de pagamentos são timestamps; mês de referência é `YYYY-MM`.
- Toda leitura ou escrita financeira futura deverá validar a associação entre usuário e espaço no **backend**. Não basta confiar em identificadores na URL.
- O domínio de finanças ainda **não** está conectado às novas rotas. O schema sozinho não disponibiliza CRUD.
- Relações de projetos/itens, como garantir que uma transação pertence a um item dentro do mesmo espaço, precisarão de validações transacionais nas futuras rotas.
- Chaves de banco e de serviço nunca devem ser expostas ao Vue nem incluídas no Git.

## Próxima etapa

Adicionar login na interface, fluxo de criação e convites com papéis, endpoints de contas e lançamentos e **exportação/importação assistida** de dados do `localStorage`. Não apague os dados locais enquanto essa migração não estiver implementada. Em produção, configurar armazenamento seguro, backups, monitoração, CORS restritivo, rate limiting e revisão de permissões.

## v0.7: identidade autenticada

- `GET /api/v1/me` exige `Authorization: Bearer <access_token>` e retorna `{ "data": { "id": "<uuid validado>" } }`.
- `GET /api/v1/workspaces` lista somente os espaços do usuário autenticado.
- `POST /api/v1/workspaces` cria um espaço PostgreSQL e vincula esse usuário como `OWNER`.

A validação da assinatura do JWT acontece no Fastify. O frontend não manda `userId` no corpo, e dados locais ainda não são importados nem protegidos pelo login.

## v0.13: hospedagem independente do frontend

- `src/app.ts` exporta a aplicação Fastify para Vercel Functions; `src/server.ts` continua sendo a entrada local com `npm run dev`.
- `CORS_ORIGIN` autoriza somente a origem HTTPS exata do frontend. O backend continua exigindo JWT nas rotas protegidas.
- `prisma/migrations/20261029195000_init/migration.sql` cria as 11 tabelas e ativa RLS, revogando acesso direto de `anon` e `authenticated` quando esses papéis existem.
- O CI sobe PostgreSQL 16 temporário, aplica `prisma migrate deploy`, confere RLS e executa testes/builds.
- Em Supabase serverless, `DATABASE_URL` usa o **Transaction pooler 6543** com `pgbouncer=true&connection_limit=1`. Para migrações no terminal, use temporariamente **Session pooler 5432**. Nunca rode migrações no build público.
- Todos os endereços e segredos devem ser configurados no projeto **backend** da Vercel, nunca no frontend `VITE_*`.

Passo a passo detalhado no [guia v0.13](../docs/api-postgres-nuvem-v0.13.md). Nenhuma migração ou deploy em conta externa foi executado automaticamente.

## Correção Vercel: deploy Ready mas /api/v1/health retorna 404 NOT_FOUND

O projeto da API foi inicialmente criado com `Application Preset: Other`. Um build pode terminar como **Ready** sem gerar uma Function e, nesse caso, todas as URLs da API retornam o erro 404 da própria Vercel, não um JSON Fastify.

O arquivo `backend/vercel.json` agora fixa `"framework": "fastify"`, sobrepondo o preset do painel, e `src/app.ts` importa e instancia Fastify diretamente para reconhecimento do entrypoint. Não configurar `outputDirectory` ou rewrites SPA para esta API.

Após integrar uma correção nesta branch de produção temporária, acesse **farol-api → Deployments** e confira o commit mais recente, faça um novo deploy **Production** se necessário. Em **Source/Output** ou **Functions**, deve existir uma Function do Fastify. Teste primeiro `/api/v1/health` no domínio da API (não do frontend), depois `/api/v1/ready` e, finalmente, `/api/v1/me` sem token (deve responder 401). Se aparecer 500, examine os **Runtime Logs**, sem expor segredos.

As variáveis `CORS_ORIGIN`, `SUPABASE_URL` e `DATABASE_URL` permanecem restritas ao projeto `farol-api`. Nenhuma migração nem alteração de senha é necessária para corrigir este 404.

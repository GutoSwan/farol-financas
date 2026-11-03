# Farol v0.13 · API e PostgreSQL na nuvem (ambiente de teste)

## Objetivo e limites

Hospedar o **backend Fastify** como um **segundo projeto Vercel** e conectar o **PostgreSQL do Supabase**. A versão anterior já hospedava somente o Vue. A v0.13 prepara o código, mas NÃO cria projetos em sua conta, não aplica migrações ao seu Supabase e não transfere lançamentos antigos. Faça os passos abaixo utilizando **somente dados fictícios**.

A API tem apenas `GET /api/v1/health`, `GET /api/v1/ready`, `GET /api/v1/me`, `GET /api/v1/workspaces` e `POST /api/v1/workspaces`. Os registros de receitas, despesas e parcelas ainda estão em `localStorage` e **não ficam protegidos pelo login**.

### 1. Banco Supabase já existente

Abra https://supabase.com/dashboard, escolha **o mesmo projeto do Supabase Auth** usado no login do Farol, depois clique em **Connect**. Esse projeto já possui PostgreSQL; não é necessário contratar outro banco.

Você precisará de **duas URLs privadas e diferentes**. Não copie nem envie a senha para o chat, screenshots ou GitHub:

| Finalidade | Supabase Connect | Porta |
|---|---|---|
| Operação da API Vercel | **Transaction pooler** (Supavisor) | **6543** |
| Prisma Migrate no seu PC | **Session pooler** | **5432** |

Use o host e usuário exatamente como aparecem no Supabase, sem inventar região ou nome de cluster. Se a senha conter caracteres especiais, certifique-se de que estejam escapados corretamente na URL. A conexão `postgres://` ou `postgresql://` é aceita.

Para a **URL de runtime** (transaction pooler), adicione os parâmetros `pgbouncer=true`, `connection_limit=1` e `sslmode=require`, preservando os demais parâmetros existentes. Use `?` se não houver query string ou `&` se já houver. **Não use a transaction pooler para migrações**.

### 2. Aplicar a migração inicial com segurança

A primeira migração foi gerada pelo Prisma 6.19.3 e versionada em `backend/prisma/migrations/20261029195000_init/migration.sql`. Ela cria **11 tabelas** e ativa RLS para todas, sem políticas de acesso direto. Em Supabase, também revoga permissões de leitura e escrita dos papéis `anon` e `authenticated` nessas tabelas. O backend acessa o PostgreSQL com sua conexão privada e aplica as regras de autorização na API.

**Revise as tabelas atuais antes de aplicar!** Use apenas um banco que ainda não possua as tabelas Farol. Se você já criou tabelas Farol diretamente no Supabase, NÃO rode a migração às cegas; compare a estrutura e o histórico de migrações.

Na pasta do repositório, abra o PowerShell:

```powershell
git fetch origin
git switch feat/v0.13-api-postgres-nuvem
git pull
cd backend
npm install
```

A seguir, coloque a URL **Session pooler (5432)** apenas na sessão de terminal atual. Este comando contém um placeholder que você substituirá localmente:

```powershell
$env:DATABASE_URL = 'COLE_AQUI_LOCALMENTE_A_URL_SESSION_POOLER_5432'
npx prisma migrate status
npx prisma migrate deploy
Remove-Item Env:\DATABASE_URL
```

**Jamais** execute `prisma migrate reset`, `db push --force-reset` ou `migrate dev` nesse banco online. `migrate deploy` aplica apenas migrações versionadas e não deve apagar dados existentes. Se houver erro, pare e investigue antes de repetir. Ao usar `npx prisma migrate status`, não publique logs que incluam credenciais.

Verifique no Supabase **Database → Tables** se existem tabelas `Workspace`, `WorkspaceMember` etc. Confirme a proteção RLS. O projeto também pode **desativar a Data API (PostgREST)** em **Settings → Data API**, se não houver nenhum outro consumidor; o Farol usa Prisma no backend, não o Data API diretamente. Não desligue a autenticação Supabase.

### 3. Criar o backend na Vercel

Abra https://vercel.com/new. Crie um **novo projeto** a partir do mesmo repositório GitHub `GutoSwan/farol-financas`. Não substitua o projeto atual do frontend.

Use estas configurações:

| Campo na Vercel | Valor |
|---|---|
| Nome | `farol-api` (se disponível) |
| Root Directory | **`backend`** |
| Framework Preset | Fastify / Other (se autodetectar Fastify, mantenha) |
| Build/Output | **Padrões do Fastify, sem forçar `dist`** |
| Node.js | 22 |
| Production Branch | Após mesclar a v0.13, a mesma branch publicada do frontend, **`feat/v0.11-tema-claro-preparacao-vercel`**, temporariamente |

O projeto backend usa `backend/src/app.ts` como entrada reconhecível pela Vercel e gera Prisma Client no `postinstall`. O arquivo `backend/src/server.ts` continua sendo usado para desenvolvimento local com `npm run dev`.

No novo projeto API, configure **Environment Variables → Production**:

| Variável do backend | Valor |
|---|---|
| `SUPABASE_URL` | URL pública HTTPS do projeto Supabase usado no login |
| `DATABASE_URL` | **URL privada Transaction pooler (6543)**, com `pgbouncer=true&connection_limit=1&sslmode=require` |
| `CORS_ORIGIN` | **Origem exata** do frontend atual, por exemplo `https://NOME-REAL.vercel.app`, sem caminho ou barra final |
| `NODE_ENV` | `production` (a Vercel também define automaticamente no runtime) |

**Nunca** defina `DATABASE_URL` ou uma chave SMTP no projeto **frontend** nem qualquer variável `VITE_*`. A URL do banco é segredo de servidor. As variáveis de ambiente do backend não devem estar visíveis no código. Use o domínio real exibido em **Vercel → Farol (frontend) → Settings → Domains**.

**Importante:** a branch `main` antiga desse repositório pode não conter nem `package.json`. Confirme que o backend está sendo implantado do commit que contém v0.13, e que o Root Directory é `backend`. Se necessário, altere **Settings → Environments → Production → Branch Tracking**. Não selecione `./` para o backend, pois é a raiz do frontend.

Ao terminar, abra a URL HTTPS que a Vercel gerar para a API, sem adivinhar o nome. Teste:

- `https://URL-REAL-DA-API/api/v1/health` deve retornar `{"status":"ok","service":"farol-api",...}`.
- `https://URL-REAL-DA-API/api/v1/ready` deve retornar `{"status":"ready"}` **se o PostgreSQL estiver conectado**; 503 indica falha de conexão.
- `https://URL-REAL-DA-API/api/v1/me` sem token deve retornar **401**, nunca uma identidade pessoal.

Se build/boot falhar, confira **Functions → Logs** do projeto API, sem compartilhar segredos. O `health` não prova sozinho que o banco funciona; use o `ready`.

### 4. Ligar o frontend Vue à nova API

No **projeto Vercel do frontend** (diferente do projeto API), adicione uma variável pública:

```text
VITE_API_BASE_URL=https://URL-REAL-DA-API.vercel.app
```

Use **seu endereço real** da API, sem `/api` no final. As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` devem continuar configuradas. Depois, crie **um novo deployment** do frontend para embutir o endereço no bundle Vite.

Entre no Farol em `/entrar`, abra `/conta`. Em **Minha conexão com a API**:
1. O Farol deve reconhecer a identidade do JWT enviado ao Fastify.
2. Listará somente os espaços em que sua conta é membro. Na primeira vez, verá lista vazia.
3. Crie **um espaço online vazio de teste**. O backend atribuirá o papel `OWNER` ao usuário autenticado.
4. Ao entrar com uma **segunda conta Supabase**, ela não poderá ver o espaço da primeira.

Se houver erro CORS, ajuste `CORS_ORIGIN` no **backend** para o domínio exato do frontend e redeploy da API. Não utilize `*` nem desative a verificação JWT. Preview URLs aleatórias também precisam de política explícita antes de acessarem a API.

### Segurança e limitações fundamentais

- **Não** é um sistema de pagamentos.
- **Não** migramos `localStorage`; os dados financeiros visíveis no Dashboard ainda são somente do navegador e **não são isolados por login**.
- Só nome e participação de **espaços online vazios de teste** usam o PostgreSQL nesta versão.
- RLS ativado bloqueia o uso do Supabase Data API, mas a aplicação Fastify usa credenciais privadas que podem ultrapassar RLS. Toda operação na API deve verificar a associação `WorkspaceMember` do JWT.
- O Supabase Free e a Vercel Hobby têm quotas e políticas de inatividade: "hospedado" não é sinônimo de garantia de disponibilidade contínua ou backup automático. Avalie política de backup e exportação antes de dados reais.
- Após concluir o teste, o próximo projeto será implementar CRUD de registros financeiros com autorização por workspace e um assistente de migração/backup sem perda ou duplicação.

### Referências oficiais
- https://vercel.com/kb/guide/ship-a-fastify-app-on-vercel
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/prisma
- https://www.prisma.io/docs/orm/prisma-migrate/workflows/deploying-database-changes

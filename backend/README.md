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

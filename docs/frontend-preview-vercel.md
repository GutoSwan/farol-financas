# Farol Finanças: testar frontend no Preview da Vercel

Esta branch prepara o Vue 3 para **testar login e leitura da API hospedada**, sem rodar VS Code localmente.

## Projetos diferentes na Vercel

- `farol-financas`: **frontend**, Root Directory na raiz do repositório (vazio, ou `./`), preset **Vite**.
- `farol-api`: **backend**, Root Directory `backend`, deployment Preview da branch `fix/v0.13-native-functions-preview`, com `/api/v1/ready` respondendo `{"status":"ready"}`.

Não mude o Root Directory do projeto da API para a raiz. Não publique esta branch de frontend como Production.

## 1. Frontend: Environment Variables do projeto `farol-financas`

Em **Settings > Environment Variables**, ambiente **Preview** (pode restringir a esta branch), definir:

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://xwzbcabyjhmgggbkaxvt.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave **publishable** do mesmo projeto Supabase, começando em `sb_publishable_` |
| `VITE_API_BASE_URL` | Origem HTTPS do deployment Preview do `farol-api` que retornou `ready`; **sem** `/api/v1/ready` |
| `VITE_ENABLE_ONLINE_WORKSPACE_WRITES` | `false` |

**Atenção:** toda variável `VITE_*` fica pública no código JavaScript distribuído. Nunca use `DATABASE_URL`, senhas, `sb_secret_`, `service_role` ou tokens no frontend.

Salve e gere novo deployment Preview a partir desta branch. Variáveis Vite são aplicadas durante o build; um deployment anterior não será atualizado automaticamente.

## 2. Backend Preview: CORS

A API já foi testada com PostgreSQL e Prisma. Mas o navegador precisa receber CORS autorizado.

No projeto **`farol-api`** em Vercel, configure `CORS_ORIGIN` para a origem exata do **frontend Preview** (`https://...vercel.app`, sem barra ou caminho), no ambiente **Preview** usado pela API, e faça um **novo deployment Preview da API** para aplicar a variável.

O backend atual permite uma única origem; endereços diferentes de Preview podem exigir uma atualização dessa variável. Prefira um endereço de branch estável da Vercel. Não use `*` e não exponha credenciais. Não altere as variáveis de Production.

## 3. Teste no navegador

1. Abra o frontend pelo link de **Preview** (não pelo domínio de Production).
2. Acesse `/entrar` e faça login com um usuário de teste do Supabase.
3. Confirme redirecionamento para `/`. A Visão Geral ainda usa **localStorage**, não dados protegidos pelo login.
4. Abra `/conta` e localize **Minha conexão com a API**.
5. Clique em **Atualizar conexão e espaços**.
6. Esperado: **Identidade validada** e lista dos espaços online (possivelmente vazia).
7. Abra o menu do Chrome **Mais ferramentas > Ferramentas do desenvolvedor > Rede** para verificar respostas das rotas `/api/v1/me` e `/api/v1/workspaces`. Ambas precisam retornar HTTP 200 ao usuário autenticado. **Não copie o cabeçalho Authorization nem o token JWT.**

Se aparecer `401`, conferir URL Supabase, usuário autenticado e tipo de chave de assinatura JWT do projeto. Se ocorrer erro CORS, conferir `CORS_ORIGIN` exato e o deployment Preview do backend. Se aparecer `503`, conferir `/ready` e os logs da API. Se aparecer aviso de API não configurada, conferir `VITE_API_BASE_URL` no **projeto frontend** e fazer outro build.

### O que não fazer neste teste

- Não importar dados locais, não apagar histórico e não criar espaços em produção.
- Não habilitar `VITE_ENABLE_ONLINE_WORKSPACE_WRITES=true` enquanto o backend usar banco de produção. O bloqueio atual é **apenas na interface**, não impede outro cliente de chamar endpoints de escrita.
- Não executar migrações do Prisma nem copiar `DATABASE_URL` para o Vite.
- Não trocar o domínio principal do frontend ou configurar a branch como Production.

## CI

O GitHub Actions faz `npm install`, `npm run test`, `npm run build` do frontend e executa os testes do backend em banco temporário. O primeiro deploy precisa estar **Ready**; depois validar login e API manualmente no Preview. Caso o CI falhe, use o log do job correspondente, sem compartilhar segredos.

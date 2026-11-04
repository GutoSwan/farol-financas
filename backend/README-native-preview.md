# Preview: Functions nativas do Farol

Branch derivada de `907b55a`, preservando código completo da API.

A Vercel usa `Root Directory: backend`, `framework: null`, instala dependências com `npm install --include=dev`, compila com `npm run build` e publica as Functions em `api/v1`.

Teste GET `/api/v1/health` (200 JSON), `/api/v1/ready` (200 ou 503), `/api/v1/me` e `/api/v1/workspaces` sem token (401). Manter Preview até validar CORS, JWT e acesso real ao banco.

Não promover para Production nem executar migrations automaticamente.


## Certificado SSL da Transaction Pooler (Preview)

Se `/api/v1/ready` registrar `SELF_SIGNED_CERT_IN_CHAIN`:

1. No Supabase, abra **Project Settings -> Database -> SSL Configuration** e use **Download Certificate**.
2. No projeto `farol-api` na Vercel, crie uma variável com chave `SUPABASE_DB_CA_CERT`, ambiente **Preview**, tipo **Secret**.
3. Cole o conteúdo PEM completo do certificado, incluindo `-----BEGIN CERTIFICATE-----` e `-----END CERTIFICATE-----`. A Vercel permite valor multilinha. Não envie certificado ou credenciais para logs.
4. Faça um novo deployment Preview da branch, para que a Function receba a variável.

O código aplica a CA ao `pg` nativo e ao `@prisma/adapter-pg`, preservando `rejectUnauthorized: true` e a validação do hostname. O helper remove apenas parâmetros `sslmode` e outros que sobrescreveriam o objeto SSL em `node-postgres`.

Não utilizar `rejectUnauthorized: false`, `sslmode=no-verify` nem `NODE_TLS_REJECT_UNAUTHORIZED=0`. Não modificar a produção sem validar o Preview.

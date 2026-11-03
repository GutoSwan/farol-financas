# Preview: Functions nativas do Farol

Branch derivada de `907b55a`, preservando código completo da API.

A Vercel usa `Root Directory: backend`, `framework: null`, instala dependências com `npm install --include=dev`, compila com `npm run build` e publica as Functions em `api/v1`.

Teste GET `/api/v1/health` (200 JSON), `/api/v1/ready` (200 ou 503), `/api/v1/me` e `/api/v1/workspaces` sem token (401). Manter Preview até validar CORS, JWT e acesso real ao banco.

Não promover para Production nem executar migrations automaticamente.

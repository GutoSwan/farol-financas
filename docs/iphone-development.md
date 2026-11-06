# Farol Finanças no iPhone (Capacitor 8)

O projeto Vue existente agora pode ser compilado como aplicativo nativo iOS.
A primeira meta é **instalar e testar em um iPhone conectado ao Mac**, não publicar
na App Store. O Android fica pausado e não recebe novas alterações nesta fase.

## Requisitos

- Mac compatível com **Xcode 26 ou superior** (instale o aplicativo Xcode na App Store)
- Node.js **22 ou superior**
- iPhone com **iOS 15 ou superior** e cabo USB ou pareamento pelo Xcode
- Apple Account para assinar e instalar no próprio aparelho gratuitamente pelo Xcode
- Para TestFlight e App Store: assinatura Apple Developer Program, atualmente US$ 99/ano

## Criar e abrir o projeto iOS pelo Mac

No Terminal do Mac, dentro da pasta do repositório Farol:

```bash
node --version
xcodebuild -version
npm install
```

Adicione um arquivo local `.env.local` (já ignorado pelo Git) com a URL do
Supabase **principal de autenticação** e a publishable key:

```dotenv
VITE_SUPABASE_URL=https://xwzbcabyjhmgggbkaxvt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=COLOQUE_AQUI_A_CHAVE_PUBLICA_DO_SUPABASE
```

A chave deve começar por `sb_publishable_`. Não inclua senha, chave secret
ou service_role. O Supabase Dev continua sendo usado apenas pelo backend Preview.

Execute:

```bash
npm run mobile:add:ios
npm run mobile:open:ios
```

No Xcode: selecione o projeto **App**, escolha o alvo **App** em Targets,
abra **Signing & Capabilities**, ative **Automatically manage signing**,
escolha sua **Team** (Personal Team do seu Apple ID, se não possui assinatura),
conecte seu iPhone, selecione-o no topo do Xcode e pressione Run (▶).

Se o Xcode avisar que o Bundle Identifier já existe, altere-o para um
identificador exclusivo que você controla (ex.: `com.seudominio.farol`).
O atual `com.farolfinancas.app` é provisório. Se necessário, ative
Developer Mode no iPhone conforme a orientação exibida pelo Xcode.

Em alterações futuras no frontend execute `npm run mobile:sync:ios` e rode
novamente pelo Xcode. A ferramenta monta uma cópia nativa dos arquivos da
pasta `dist` e gera os ícones RGB em todas as resoluções do catálogo AppIcon.

## Verificação automática

O workflow `Validar Farol para iPhone (simulador)` usa GitHub Actions
em macos-26, monta o projeto iOS e compila para simulador **sem assinatura**.
O artefato `farol-ios-simulator-debug` **não é instalável num iPhone real**.
Para rodar em um iPhone físico é necessário assinar o app no Xcode.

O workflow pode compilar sem credenciais reais para testar o código; o app
nativo utilizado no iPhone precisa das variáveis do Supabase no `.env.local`.
O Android foi alterado para disparo manual apenas.

## Limitações para a primeira versão

- A tela de login por senha e o código de cadastro continuam usando Supabase Auth.
- A recuperação de senha via e-mail ainda exige tratamento de deep link e
  configuração de retorno ao aplicativo nativo. Antes de ativar este fluxo,
  utilize o site no Safari para recuperação de senha.
- As listas de presentes e os registros financeiros ainda ficam **no armazenamento
  local separado do app**. Não são sincronizados com computador ou PWA.
- Não existe versão IPA assinada para TestFlight/App Store nesta etapa.
- A aba Presentes é restrita por app_metadata.farol_role = administrador e
  a sessão precisa ser renovada após alterações de permissão.
- A ligação de dados financeiros com a API Preview ainda será testada depois,
  sem habilitar gravações online durante a preparação do app.

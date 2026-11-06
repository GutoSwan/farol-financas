# Aplicativo móvel: Farol Finanças

## Instalação via PWA (primeira etapa)

Esta versão é um aplicativo web instalável, **não** um pacote de App Store ou Google Play.

- **iPhone:** abrir o endereço HTTPS no Safari > Compartilhar > Adicionar à Tela de Início > Abrir como App (se disponível) > Adicionar.
- **Android:** abrir o endereço HTTPS no Chrome > menu ⋮ > Instalar aplicativo ou Adicionar à tela inicial.
- O ícone é gerado automaticamente durante npm run dev e npm run build.
- O manifesto, service worker e ícones residem em public/.
- O service worker guarda apenas o HTML shell e recursos estáticos públicos. Não intercepta /api, Supabase ou outros domínios.

### Atenção aos dados

Os registros financeiros ainda ficam no armazenamento local da instalação/navegador atual. A instalação no celular não transfere informações do computador nem sincroniza contas ou lançamentos. Antes de trocar de dispositivo, exportar o backup financeiro existente no Farol. Não anunciar sincronização até que o backend de espaços e lançamentos esteja integrado.

## Próxima etapa: pacotes para lojas

Usar Capacitor com o mesmo frontend Vue/Vite para gerar projetos nativos iOS e Android, criar configurações de assinatura e testar login/retorno de autenticação em WebViews. Depois gerar builds assinadas, testar em dispositivos físicos e submeter à Apple App Store e ao Google Play. Distribuição pelas lojas depende de contas de desenvolvedor, revisão e aprovação; não acontece automaticamente ao ativar o PWA.

## Verificações

- Executar npm run build e npm test.
- Conferir dist/manifest.webmanifest, dist/sw.js, dist/icons/icon-192.png, dist/icons/icon-512.png e dist/icons/apple-touch-icon.png.
- Em HTTPS, verificar manifesto e instalação no Safari do iPhone e no Chrome do Android.
- Garantir que APIs, sessões e respostas financeiras nunca sejam armazenadas pelo service worker.


## Aplicativos nativos com Capacitor 8 (base criada)

O mesmo frontend Vue/Vite da PWA agora tem configuracao nativa inicial para Android e iOS.
O arquivo capacitor.config.ts define o identificador provisorio do aplicativo
(com.farolfinancas.app) e a pasta dist, sem carregar o site hospedado como WebView remoto.

### Preparar no Mac

1. Instalar Node.js 22 ou mais recente, Xcode 26 ou mais recente, e Android Studio com SDK.
2. Clonar o repositorio, entrar na pasta raiz e executar: npm install
3. Criar .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY do
   Supabase que autentica o Farol (o projeto principal). Sao valores publicos
   usados pelo frontend; jamais usar chave secret ou service_role no aplicativo.
4. Criar as pastas nativas:
   - Android: npm run mobile:add:android
   - iOS: npm run mobile:add:ios
5. Depois de alterar o Vue, executar npm run mobile:sync
6. Abrir na IDE:
   - Android Studio: npm run mobile:open:android
   - Xcode: npm run mobile:open:ios
7. Para gerar APK Android debug local: npm run mobile:apk:debug
   Arquivo: android/app/build/outputs/apk/debug/app-debug.apk

### APK Android pelo GitHub Actions

Foi adicionado o workflow Gerar APK Android de teste. Ele produz um arquivo ZIP
com o APK debug, assinado para teste, que pode ser instalado manualmente no Android.
Nao e uma versao para a Google Play.

Configurar em GitHub > Settings > Secrets and variables > Actions > Variables:
- VITE_SUPABASE_URL: URL HTTPS publica do projeto Supabase de autenticacao.
- VITE_SUPABASE_PUBLISHABLE_KEY: chave publishable publica do mesmo projeto.
- VITE_API_BASE_URL: opcional, endereco HTTPS publico da API.

O job de Android fica desabilitado enquanto as duas variaveis de autenticacao
nao existirem, para evitar publicar um APK em que o login nao funciona.
Somente depois de configuradas, um novo push na branch ativa a geracao.

### iPhone e lojas

O projeto iOS e gerado pelo Capacitor, mas ainda nao existe um IPA assinado.
Para instalar nativamente num iPhone, configurar o projeto no Xcode com
uma equipe de assinatura. Para distribuir via TestFlight e App Store,
sera necessario configurar Apple Developer, App Store Connect, assinatura
e aprovacao. Para a Google Play, tambem sera necessario gerar um Android
App Bundle (AAB) de release com assinatura apropriada.

O identificador com.farolfinancas.app e provisorio. Definir o identificador
definitivo antes de publicar nas lojas.

### Limites atuais

- O login e o codigo de confirmacao usam o Supabase principal, nao o banco Dev.
- O aplicativo nativo nao faz sincronizacao automatica dos dados financeiros
  ou das listas de presentes existentes nos navegadores.
- O service worker PWA nao roda no aplicativo nativo.
- Para a API online, sera necessario liberar de forma controlada o CORS
  das origens capacitor://localhost (iOS) e https://localhost (Android),
  usando uma URL HTTPS e autenticacao JWT no backend.
- Recuperacao de senha por links externos e retorno ao app precisam de
  configuracao de deep links antes de distribuicao nas lojas.
- O menu Presentes continua protegido por app_metadata.farol_role.
  O perfil e revalidado no Supabase ao abrir e ao voltar ao aplicativo.

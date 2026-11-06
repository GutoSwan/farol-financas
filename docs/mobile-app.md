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

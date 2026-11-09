# Calendário do Farol Finanças

## O que está disponível nesta etapa

- Rota `/calendario` no menu lateral, adaptada ao desktop e celular, com tema claro/escuro.
- Mês navegável, seleção de um dia, agenda com nomes dos eventos diretamente na grade.
- Criar, editar e excluir eventos com título, observações, início e fim.
- Eventos de dia inteiro permitem selecionar o primeiro e o último dia (ambos inclusivos na interface).
- Eventos que duram mais de um dia aparecem em cada data abrangida; o fim, armazenado como instante exclusivo, não ocupa o dia seguinte quando é meia-noite.
- Lembretes de 0, 5, 15, 30, 60 minutos ou 1 dia antes, conforme consentimento explícito do usuário.
- Feriados: Brasil, estado de São Paulo e Sorocaba/SP. A seleção da região é manual e fica guardada no dispositivo. Nenhuma localização é coletada.
- Calendário e finanças ficam separados: os eventos não geram lançamentos financeiros.

## Feriados e legislação

A lista fixa de feriados federais inclui o Dia da Consciência Negra e calcula a Paixão de Cristo anualmente. Em São Paulo, exibe 9 de julho. Em Sorocaba, inclui o aniversário de 15 de agosto e Corpus Christi (data móvel). Carnaval e pontos facultativos NÃO são marcados como feriados.

Fontes de validação para 2026:
- Governo Federal: https://agenciagov.ebc.com.br/noticias/202512/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026
- Prefeitura de Sorocaba, Decreto 30.713/2025: https://noticias.sorocaba.sp.gov.br/wp-content/uploads/2025/12/noticias.sorocaba.sp.gov.br-3848-02-de-dezembro-de-2025.pdf
- Base legal adicional: https://sincomerciosorocaba.com.br/feriados.aspx

Feriados municipais de outras cidades e alterações futuras da legislação exigem atualização e verificação oficial. O aplicativo não afirma detectar automaticamente a região do usuário.

## Persistência e segurança

Esta tela utiliza a tabela `public.calendar_events` do projeto Supabase de DESENVOLVIMENTO, que foi verificada em 09/11/2026: RLS habilitada, políticas de SELECT/INSERT/UPDATE/DELETE limitadas a `auth.uid() = user_id`. O frontend busca a identidade com `supabase.auth.getUser()` antes da leitura e filtra também por `user_id`; as permissões reais dependem das políticas do banco, não do filtro do navegador.

Na inspeção de 09/11/2026, a tabela **não existia no projeto de produção**. Não publique esta funcionalidade em produção antes de criar e revisar a estrutura e políticas correspondentes, testar isolamento entre duas contas e confirmar o projeto Supabase apontado pelas variáveis de ambiente. Nenhuma alteração de schema ou migração de dados foi executada nesta etapa.

**Notificações:** no navegador/PWA, são avisos locais via API de Notificações enquanto a página Calendário permanece aberta. No aplicativo **nativo** Capacitor, o projeto utiliza `@capacitor/local-notifications@8.3.1` e agenda no aparelho até 50 lembretes futuros após permissão explícita, com título e texto **genéricos** (nunca o nome/descrição). Os alertas agendados podem ser entregues mesmo com o app fechado, sujeitos às configurações do iOS. Ao sair ou trocar de conta, os lembretes do Farol são cancelados. A agenda é sincronizada ao abrir o Calendário, a cada 3 minutos enquanto a tela permanece aberta, e após edições/exclusões. O PWA NÃO herda essas capacidades do plugin nativo. Ainda faltam o teste no iPhone real e a validação de release.

## Checklist de QA

1. Entre com a conta de desenvolvimento validada (incluindo 2FA) e abra `/calendario`.
2. Selecione Sorocaba e confira **03/04/2026**, **04/06/2026**, **09/07/2026** e **15/08/2026**.
3. Cadastre evento com início 09/11 às 22h e término 11/11 às 08h. Confirme presença na agenda dos dias 9, 10 e 11, mas não do 12.
4. Cadastre evento de dia inteiro de 9 a 11/11. Confira que a data final é incluída, mas 12/11 não.
5. Edite e exclua um evento, atualize o navegador e confirme que persiste a alteração.
6. Teste o modo claro/escuro, teclado e a interface no iPhone.
7. Ative notificações explicitamente, agende um evento para daqui a alguns minutos e teste um lembrete com o Calendário aberto. Repita sem permissão e confira que não é enviada uma notificação.
8. Entre com outro usuário de teste. Ele não deve visualizar, editar ou excluir os eventos do primeiro.
9. Verifique a resposta de erro quando Supabase estiver indisponível e que nenhum título sensível apareça em notificações.
10. Execute `npm run test`, `npm run typecheck` e `npm run build` antes de qualquer Preview.

## Próximas evoluções

- Validar entrega nativa com o aplicativo fechado no iPhone real; o PWA exigirá Web Push separado.
- Lista de regiões ampliada por fontes oficiais, com revisão anual dos feriados.
- Repetição de eventos (semanal/mensal/anual) e convites compartilhados, somente após definir regras de privacidade e autorização.

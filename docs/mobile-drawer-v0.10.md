# Farol v0.10: menu completo no desktop e gaveta lateral no celular

## Mudança solicitada

A versão anterior escondia Cartões, Orçamentos e Relatórios em "Mais páginas" quando a altura da janela era menor que 690px. Na captura de **892 × 576** havia espaço suficiente para exibir os sete links, portanto essa redução era desnecessária.

Na **v0.10**:
- O menu desktop exibe todos os sete itens mesmo com altura **576px**, sem "Mais páginas" e sem barras de rolagem internas.
- A barra continua sticky, acompanhando a rolagem do conteúdo principal; seleção de espaço e perfil ficam no rodapé esquerdo.
- Em alturas ainda menores, o espaçamento encolhe. Apenas para janelas extremamente pequenas, menores que 390px de altura, a própria lateral permite rolagem, evitando truncar itens.
- A largura <=700px transforma a navegação em uma **gaveta lateral** (drawer) fechada por padrão, no estilo do menu móvel da Steam: botão de três traços no cabeçalho, painel vindo pela esquerda, fundo escurecido, links em lista vertical, espaços e perfil ao fim.
- O menu fecha pelo **×**, pelo fundo escuro, com **Esc** ou após selecionar um link/espaço.
- Há controle de foco por teclado (Tab/Shift+Tab dentro do menu aberto), restauração do foco ao botão de abertura, bloqueio da rolagem de fundo e respeito a `prefers-reduced-motion`.
- Os popovers de espaço e perfil, quando abertos no drawer móvel, aparecem no fluxo do painel para não serem cortados.

## Testes manuais

1. Abra o Chrome DevTools, ative o modo dispositivo e configure a viewport em **892 × 576**.
2. Atualize `http://localhost:5173`. Confira **sete links** visíveis na barra, **sem "Mais páginas"**, e espaços e perfil acessíveis sem scroll interno.
3. Role o Dashboard: a lateral continua visível.
4. Alterne para **390 × 844** e **375 × 667**, atualize a página e confirme que a navegação começa fechada; só o **☰** aparece no cabeçalho.
5. Toque no hambúrguer: o menu esquerdo deve deslizar por cima do Dashboard com fundo escurecido, exibindo os sete links, espaços e perfil.
6. Teste o fechamento pelo **×**, pelo fundo, pela tecla **Esc** e pela seleção de um link.
7. Abra o menu e use o teclado Tab: o foco deve permanecer dentro do drawer até ser fechado.
8. Abra **Gerenciar espaços** no mobile e confirme que o formulário cabe no drawer e permite rolar o painel caso o conteúdo ultrapasse a tela.
9. Redimensione uma janela móvel aberta para mais de 700px; o drawer fecha e libera a rolagem do corpo.
10. Teste claro/escuro e zoom de navegador. A organização é responsiva, mas **não modifica** os dados financeiros ou o estado de autenticação.

## Limitações e segurança

- Esta é uma mudança visual e de navegação. **Não** inclui migração de `localStorage`, hospedagem, domínio, banco de dados ou alterações no fluxo de cadastro.
- Os espaços financeiros continuam locais e não são isolados por usuário.
- O comportamento de drawer só ocorre em páginas dentro do `AppLayout`. As telas separadas de cadastro/login mantêm seu layout próprio.

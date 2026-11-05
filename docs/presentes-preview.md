# Presentes, listas de Gustavo e Ana

Rota: `/presentes`. O menu lateral abre uma escolha modal por pessoa. Cada lista é
independente, e o usuário pode adicionar, editar ou excluir presentes, informar
um preço em reais, um link opcional de compra e prioridade:

- Verde: **Quero muito**
- Amarelo: **Quero mais ou menos**
- Vermelho: **Nem tanto**

Os cartões são ordenados pela prioridade e permitem arrastar um PNG diretamente
para a zona de foto daquele presente. Também é possível clicar em
**Escolher foto**, trocar a imagem ou removê-la. O upload aceita PNG, JPEG e
WebP com até 8 MB.

## Privacidade e persistência

Nesta versão **não há sincronização em nuvem** para presentes. Nome, valor, link,
pessoa e prioridade são gravados no `localStorage` sob
`farol-financas:gifts:v1`. As fotos ficam no IndexedDB em
`farol-financas-gift-photos-v1`, vinculadas ao ID do presente. O armazenamento é
por origem (domínio) e perfil do navegador; se o usuário abrir outro domínio
Preview ou celular, não verá automaticamente os mesmos presentes.

A lista independe do espaço financeiro selecionado, do login e do cálculo
de receitas e despesas. Nenhum dado de presentes entra em relatório ou
cria lançamentos no PostgreSQL. A API Preview permanece em somente leitura
até que seja configurado um banco de testes separado.

Evitar apagar cookies/dados do site antes de implementar exportação/backup e
persistência autenticada. Uma versão futura pode sincronizar listas e imagens
com regras de autenticação e autorização próprias, após testes em projeto
Supabase de desenvolvimento.

## Verificação manual

1. Abrir Preview no endereço fixo `/presentes`; testar Gustavo e Ana.
2. Criar três presentes e conferir as cores verde, amarelo e vermelho.
3. Editar nome, valor, link e prioridade; abrir o link externo.
4. Arrastar PNG no primeiro cartão e escolher outra foto pelo seletor de arquivos.
5. Atualizar a página, escolher a mesma pessoa e confirmar fotos e textos.
6. Trocar a pessoa e garantir que a outra lista não tenha sido alterada.
7. Excluir somente o presente de teste e confirmar que os demais permanecem.
8. Testar em modo claro, modo escuro e largura de celular.

A rota foi adicionada em `vercel.json` para funcionar após refresh.

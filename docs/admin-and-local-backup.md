# Farol: acesso administrativo e segurança da migração

## Presentes

O módulo **Presentes** fica oculto para visitantes e usuários normais.
A rota `/presentes` solicita uma sessão validada ao Supabase Auth e confere
`app_metadata.farol_role === 'administrador'`. O mesmo papel é verificado
na barra lateral e na página para bloquear ações ao sair/trocar de conta.

O nome de exibição `administrador`, o e-mail, `user_metadata` e as funções
OWNER/EDITOR dos espaços financeiros **não** concedem esta permissão.

### Ativar a conta administradora

A atribuição exige acesso administrativo ao projeto Supabase e deve ser feita
por ferramenta administrativa confiável (nunca pelo frontend ou por
`supabase.auth.updateUser`). Selecionar o usuário exato no painel do
Supabase e definir o campo **App Metadata**:

```json
{"farol_role":"administrador"}
```

É necessário **preservar os outros campos** já presentes em
`raw_app_meta_data` (por exemplo, provider/provedores). Nunca substituir o
objeto inteiro por um contendo só `farol_role`. Outra maneira de atribuir
é, com privilégio administrativo e depois de confirmar o ID correto, executar:

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || '{"farol_role":"administrador"}'::jsonb
WHERE id = 'COLOQUE_AQUI_O_UUID_EXATO_DO_ADMINISTRADOR'::uuid;
```

**Este SQL não foi executado pelo assistente.** Deve ser executado
apenas após confirmar o usuário desejado, num ambiente autorizado.
O logout/login atualiza a sessão depois da atribuição.

**Limitação de segurança atual:** registros de Presentes são locais
(localStorage e IndexedDB) e o navegador controla esses arquivos. As
restrições acima protegem o acesso pela interface e rota, mas não são
equivalentes a autorização server-side dos dados. Para privacidade real
entre pessoas ou dispositivos, mover listas e fotos para backend/Storage
com autorização por JWT e regras de acesso no servidor.

## Backup antes da sincronização

Em **Gerenciar espaços**, o botão "Baixar backup financeiro (JSON)"
gera um snapshot de todos os espaços locais deste navegador:
contas mensais, lançamentos mensais, gastos fixos, transações e
orçamentos. O arquivo inclui IDs e valores em centavos e não modifica
os registros. Não inclui presentes, fotos, senha, token nem sessão.

O download **não** realiza restauração, importação ou escrita no banco.
Preserve o arquivo num local privado. Como os dados locais dependem do
domínio Preview, faça o download do mesmo endereço em que os valores
foram cadastrados.

## Próxima entrega planejada

1. Criar um projeto Supabase separado para desenvolvimento, sem duplicar
   segredos, e configurar o backend Preview para usar o banco novo.
2. Habilitar criação de espaços somente nesse ambiente, com autenticação
   e isolamento de dados, além de manter Production intacta.
3. Desenvolver importação/migração com pré-visualização e consentimento,
   sem duplicar lançamentos, depois sincronizar contas e gastos.
4. Criar armazenamento online das listas de Presentes, com autorização
   administrativa de ponta a ponta e fotos no Storage.

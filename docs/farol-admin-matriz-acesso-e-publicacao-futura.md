# Farol Finanças / Farol Admin: matriz de permissões v0.29 (Preview)

## Objetivo e ambientes

O `farol-financas` é a aplicação comum, inclusive PWA/Capacitor. O `farol-admin` é um projeto Vercel e frontend web independentes, na URL própria `/admin/login`. O frontend do Admin não deve importar módulos financeiros, expor links de saída para o Farol financeiro ou oferecer cadastro público.

Todas as verificações nesta versão são realizadas em **Supabase Dev/Preview**. A produção não foi promovida ou atualizada com esta branch.

## Matriz de acesso

| Capacidade | Conta comum (`authenticated`) | Conta `administrador` | Conta `super_admin` |
|---|---|---|---|
| Login do Farol financeiro | Sim, após MFA | Sim, após MFA | **Sim**, como usuário normal, após MFA |
| Visão geral, contas, lançamentos, relatórios | Apenas seus dados autorizados | Apenas seus dados autorizados | **Somente seus próprios dados autorizados**, sem privilégios financeiros extras |
| Presentes de Gustavo/Ana | Não; menu, rota e métodos da página são guardados | Sim, apenas seus registros locais | Não automaticamente; papel separado |
| Login no site `farol-admin` | Não | Não | Sim, exigindo senha + TOTP AAL2 |
| Ferramentas técnicas `/admin/*` | Não | Não | Sim, somente após confirmação da API |
| Consulta global de dados financeiros | Não | Não | **Não** nesta versão |
| Alterar dados de outras contas / backups globais | Não | Não | **Não** nesta versão |
| Publicar ajustes para todas as contas | Não | Não | **Não implementado** nesta versão |

### Validação em camadas

1. A URL e a navegação do Farol financeiro não incluem a rota `/administracao` nem link do console.
2. A mesma identidade `super_admin` pode entrar nos dois sites, porém cada um usa sessão própria e o painel técnico exige autorização adicional da API. Durante recuperação de senha, a sessão temporária continua restrita à redefinição e ao TOTP.
3. O papel provém exclusivamente de `app_metadata.farol_role`, não de e-mail, nome, `user_metadata` ou preferência local.
4. A interface Admin deve solicitar autenticação no seu próprio domínio e armazenamento de sessão, usando chave **publishable** do Supabase Dev, nunca `service_role`.
5. A API de autenticação Dev valida JWT, segundo fator AAL2 e papel atual. O proxy Admin só encaminha `GET /api/v1/admin/access` no ambiente Preview e não expõe credenciais de infraestrutura.
6. A API Dev no modo QA administrativo bloqueia operações financeiras e gravações.
7. Presentes e fotos recebem chaves vinculadas à identidade autenticada. Registros antigos sem dono só são importados após **confirmação explícita**; conflitos preservam a origem, e fotos antigas são migradas ao abrir um presente válido. Esse isolamento local **não é criptografia**: não protege contra acesso físico ao perfil do navegador, DevTools ou outro código executado na mesma origem.

## Preparação para futuras alterações globais pelo Admin

**Ainda não ativar alterações globais.** Quando solicitado:

1. Criar configuração pública controlada no servidor, separada dos dados privados: por exemplo temas, anúncios internos, telas opcionais, limites de recursos, liberação de funcionalidades.
2. Para cada alteração, exigir escopo explícito: somente minha conta, contas selecionadas ou todas as contas.
3. Manter dois estados: **rascunho** e **publicado**. Alterações no rascunho nunca devem afetar contas comuns.
4. Publicar apenas após prévia, confirmação de Super Admin (AAL2) e validação pelo backend.
5. Guardar versão, autor, horário, escopo, justificativa e trilha de auditoria. Permitir desfazer para a versão anterior.
6. Clientes comuns **somente leem** as configurações publicadas que se aplicam a eles. Não recebem chaves secretas, dados de outras contas, ou permissão de escrita.
7. Nunca usar uma alteração global para ler ou sobrescrever lançamentos, cartões, orçamentos ou dados financeiros pessoais. Essas operações exigem processo próprio, autorização do titular e revisão de LGPD.

## Checklist de aceite antes de produção

- [ ] Preview de **ambos** os sites em `READY` usando o mesmo commit
- [ ] Testes unitários e build de ambos em GitHub Actions aprovados
- [ ] Acessar `/administracao` e `/presentes` por URL direta com conta comum e observar bloqueio
- [ ] Fazer login e logout de conta `administrador`, confirmar que só Presentes aparece
- [ ] Entrar com a mesma conta `super_admin` no Farol financeiro, validar MFA e visualizar somente seus próprios espaços
- [ ] Fazer login de conta `super_admin` na URL `farol-admin`, confirmar MFA e API
- [ ] Confirmar que sessão de recuperação por e-mail do Super Admin não libera dados financeiros
- [ ] Tentar conta comum e conta `administrador` no site Admin e observar bloqueio
- [ ] Testar ausência de vazamento entre duas contas no mesmo navegador e em navegadores separados
- [ ] Verificar autenticação da Vercel sem contornar proteções
- [ ] Testar desconexão, token expirado, MFA removido e API indisponível (falha fechada)
- [ ] Verificar RLS, políticas de backup e avisos de segurança do Supabase Dev
- [ ] Confirmar que nenhuma alteração de configuração global é aplicada automaticamente
- [ ] Validar visualmente desktop e celular sem instalar o Admin como PWA

**Limitações conhecidas:** resultados atuais de QA incluem testes automatizados e compilação. Não substituem teste real de login/2FA com identidade autorizada. Os dados financeiros legados e os presentes ainda não têm garantia de confidencialidade criptográfica no navegador. Apps já instalados podem conservar versões antigas até serem atualizados.

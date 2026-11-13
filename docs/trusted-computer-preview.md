# Sessão confiável no Farol (Preview, 13/11/2026)
- Marcar **Confiar neste computador por até 30 dias** no login é opcional e desmarcado por padrão.
- Sempre exige senha e Authenticator na primeira autenticação. Só após MFA real AAL2 o Supabase pode guardar a sessão neste navegador.
- O registro de confiança armazena usuário, identificador de sessão e validade. Nunca senha, código TOTP ou chave de recuperação.
- Sem marcar, a sessão nova fica no armazenamento da aba. A sessão persistida pela versão anterior é migrada uma única vez, evitando perda de acesso durante atualização.
- A confiança expira após no máximo 30 dias no cliente; o Supabase pode revogar/expirar antes. O usuário sempre pode sair da conta.
- Não representa autenticação sem senha, dispensa de MFA em login novo, nem registro criptográfico de dispositivo.
- O Farol Admin permanece separado e não usa esse estado.

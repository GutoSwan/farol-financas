/**
 * A tabela interna do Prisma nunca precisa de grants a anon/authenticated/PUBLIC.
 * Rejeitar a combinação com qualquer grant, mesmo com RLS habilitada, evita
 * futuras exposições quando alguma policy for alterada inadvertidamente.
 */
export function isMigrationMetadataExposed(rlsEnabled: boolean, clientRoleGranted: boolean): boolean {
  void rlsEnabled // mantido para compatibilidade com o verificador/relatórios de RLS.
  return clientRoleGranted
}

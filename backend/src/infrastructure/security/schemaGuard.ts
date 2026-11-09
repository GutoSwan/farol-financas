/** Somente o owner/serviço administrativo pode operar tabelas de migração. */
export function isMigrationMetadataExposed(rlsEnabled: boolean, clientRoleGranted: boolean): boolean {
  return !rlsEnabled && clientRoleGranted
}

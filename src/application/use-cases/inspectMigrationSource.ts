import type { FinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'
import { analyzeLegacyMigration } from './analyzeLegacyMigration'

/**
 * Pré-validação conservadora de UM espaço antes do envio à API.
 * Aproveita a auditoria detalhada existente, sem consultar a nuvem nem alterar
 * os dados do navegador. A validação definitiva continua no servidor.
 */
export function inspectMigrationSource(backup: FinancialBackup, workspaceId: string): string[] {
  const source = backup.workspaces.find(item => item.workspace.id === workspaceId)
  if (!source) return ['O espaço local selecionado não foi encontrado. Atualize a revisão.']

  try {
    const isolated: FinancialBackup = {
      ...backup,
      activeWorkspaceId: workspaceId,
      workspaces: [source],
    }
    // Sem espaços online: esta etapa confere apenas o conteúdo local.
    // O confronto real com o banco é feito separadamente e é obrigatório.
    const preview = analyzeLegacyMigration(isolated, [])
    const problems = [...new Set(preview.issues
      .filter(issue => issue.severity === 'blocker')
      .map(issue => issue.message))]
    if (preview.blockers > preview.issues.filter(issue => issue.severity === 'blocker').length) {
      problems.push('Há outros registros incompatíveis; corrija a origem antes de transferir.')
    }
    return problems
  } catch {
    return ['Não foi possível validar a origem. Nenhum registro pode ser enviado.']
  }
}

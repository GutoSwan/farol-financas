import { describe, expect, it } from 'vitest'
import sidebar from '../src/presentation/components/OnlineWorkspacesSidebar.vue?raw'
import layout from '../src/presentation/layouts/AppLayout.vue?raw'
import serverEntry from '../backend/src/app.ts?raw'

describe('Espaços online na barra lateral do Farol', () => {
  it('exibe consulta autenticada no gerenciador sem substituir o seletor de dados locais', () => {
    expect(layout).toContain('<OnlineWorkspacesSidebar />')
    expect(layout).toContain('v-for="space in workspaces"')
    expect(layout).toContain(':value="activeWorkspaceId"')
    expect(sidebar).toContain('getOnlineIdentity()')
    expect(sidebar).toContain('listOnlineWorkspaces()')
    expect(sidebar).toContain('Somente consulta nesta etapa')
    expect(sidebar).not.toContain('selectWorkspace(')
    expect(sidebar).not.toContain('createOnlineWorkspace(')
    expect(sidebar).not.toContain('localStorage')
  })
  it('descarta resultados de outro usuário ao encerrar ou trocar a sessão', () => {
    expect(sidebar).toContain('watch(() => user.value?.id')
    expect(sidebar).toContain('onlineSpaces.value = []')
    expect(sidebar).toContain('identity.id !== expectedUserId')
    expect(sidebar).toContain('requestId !== requestSequence')
    expect(sidebar).toContain('onBeforeUnmount(() => { requestSequence++ })')
  })
  it('o backend desativa gravação no deployment Preview sem mudar Production', () => {
    expect(serverEntry).toContain("allowWorkspaceWrites: process.env.VERCEL_ENV !== 'preview'")
  })
})

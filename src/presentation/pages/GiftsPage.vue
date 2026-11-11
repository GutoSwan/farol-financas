<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import UiIcon from '../components/UiIcon.vue'
import MoneyInput from '../components/MoneyInput.vue'
import GiftPhoto from '../components/GiftPhoto.vue'
import type { Gift, GiftOwner, GiftPriority } from '../../domain/entities/Gift'
import { GIFT_OWNER_NAMES, GIFT_PRIORITY_NAMES } from '../../domain/entities/Gift'
import { BrowserGiftRepository } from '../../infrastructure/persistence/BrowserGiftRepository'
import { deleteGiftPhoto } from '../../infrastructure/persistence/GiftPhotoStorage'
import { formatBRL, parseBRLToCents } from '../../domain/value-objects/Money'

const router = useRouter()
const { isAdmin, user } = useAuth()
const repository = computed(() => isAdmin.value && user.value?.id
  ? new BrowserGiftRepository(user.value.id) : null)
const person = ref<GiftOwner | null>(null)
const gifts = ref<Gift[]>([])
const feedback = ref('')
const legacyAvailable = ref(false)

function refreshLegacyAvailability(): void {
  if (!isAdmin.value || !repository.value) { legacyAvailable.value = false; return }
  try {
    legacyAvailable.value = repository.value.hasLegacyGifts()
  } catch (cause) {
    legacyAvailable.value = false
    error.value = cause instanceof Error ? cause.message : 'Não foi possível conferir presentes antigos.'
  }
}

function importLegacyGifts(): void {
  if (!isAdmin.value || !repository.value || !legacyAvailable.value) return
  if (!window.confirm('Estes presentes antigos foram criados sem vínculo com uma conta. Confirma que pertencem a você e deseja associá-los à sua conta atual?')) return
  try {
    const amount = repository.value.importLegacyGifts()
    refreshLegacyAvailability()
    if (person.value) reload()
    feedback.value = amount ? amount + ' presente(s) antigo(s) associado(s) à sua conta.' : 'Não havia presentes antigos para importar.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Importação não concluída.'
  }
}
const error = ref('')
const formError = ref('')
const formOpen = ref(false)
const editId = ref<string | null>(null)
const name = ref('')
const price = ref('')
const productUrl = ref('')
const priority = ref<GiftPriority>('high')
const chooserFirst = ref<HTMLButtonElement | null>(null)
const formFirst = ref<HTMLInputElement | null>(null)

watch([isAdmin, () => user.value?.id], ([allowed, currentId], [, previousId]) => {
  // Trocar entre contas privilegiadas também limpa os dados da tela anterior.
  if (allowed && currentId && currentId === previousId) return
  person.value = null
  gifts.value = []
  formOpen.value = false
  editId.value = null
  refreshLegacyAvailability()
})

const personLabel = computed(() => person.value ? GIFT_OWNER_NAMES[person.value] : '')
const totalPrice = computed(() => gifts.value.reduce((total, gift) => total + gift.priceCents, 0))
const counts = computed(() => ({
  high: gifts.value.filter((gift) => gift.priority === 'high').length,
  medium: gifts.value.filter((gift) => gift.priority === 'medium').length,
  low: gifts.value.filter((gift) => gift.priority === 'low').length,
}))

function reload(): void {
  if (!isAdmin.value || !person.value || !repository.value) return
  try {
    gifts.value = repository.value.list(person.value)
    error.value = ''
  } catch (cause) {
    gifts.value = []
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os presentes.'
  }
}

function choosePerson(chosen: GiftOwner): void {
  if (!isAdmin.value) return
  person.value = chosen
  formOpen.value = false
  feedback.value = ''
  error.value = ''
  reload()
}

function closeChooser(): void {
  // Navegação interna confiável, mesmo quando a tela foi aberta por link direto.
  void router.replace('/')
}

function changePerson(): void {
  person.value = null
  gifts.value = []
  formOpen.value = false
  feedback.value = ''
  error.value = ''
  void nextTick(() => chooserFirst.value?.focus())
}

function openForm(gift?: Gift): void {
  if (!isAdmin.value) return
  editId.value = gift?.id ?? null
  name.value = gift?.name ?? ''
  price.value = gift ? formatBRL(gift.priceCents) : ''
  productUrl.value = gift?.productUrl ?? ''
  priority.value = gift?.priority ?? 'high'
  formError.value = ''
  feedback.value = ''
  formOpen.value = true
  void nextTick(() => formFirst.value?.focus())
}

function closeForm(): void { formOpen.value = false; formError.value = '' }

function saveGift(): void {
  if (!isAdmin.value || !person.value || !repository.value) return
  formError.value = ''
  feedback.value = ''
  try {
    const draft = {
      name: name.value, priceCents: parseBRLToCents(price.value),
      productUrl: productUrl.value, priority: priority.value,
    }
    if (editId.value) repository.value.update(person.value, editId.value, draft)
    else repository.value.add(person.value, draft)
    const wasEditing = !!editId.value
    formOpen.value = false
    reload()
    feedback.value = wasEditing ? 'Presente atualizado!' : 'Presente adicionado à lista!'
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Confira o nome, o valor e o link.'
  }
}

async function removeGift(gift: Gift): Promise<void> {
  if (!isAdmin.value || !person.value || !repository.value) return
  if (!window.confirm('Excluir o presente "' + gift.name + '" da lista de ' + personLabel.value + '?')) return
  try {
    repository.value.remove(person.value, gift.id)
    reload()
    feedback.value = 'Presente excluído da lista.'
    // Se o navegador negar o acesso a fotos, o registro já foi removido.
    try { await deleteGiftPhoto(user.value!.id, gift.id) } catch { /* Foto órfã não impede exclusão do registro. */ }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível excluir o presente.'
  }
}

function trapDialogFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const target = event.currentTarget as HTMLElement
  const focusable = Array.from(target.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled])',
  )).filter((element) => element.getClientRects().length > 0)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  refreshLegacyAvailability()
  if (isAdmin.value) void nextTick(() => chooserFirst.value?.focus())
})
</script>

<template>
  <div v-if="isAdmin" class="gifts-page">
    <div class="heading gifts-page-heading">
      <div>
        <p class="eyebrow">LISTA DE DESEJOS</p>
        <h1>Presentes <span aria-hidden="true">🎁</span></h1>
        <p>Um cantinho para guardar o que Gustavo e Ana gostariam de ganhar.</p>
      </div>
      <div v-if="person" class="gifts-heading-actions">
        <button type="button" class="secondary-action gift-switch" @click="changePerson">
          <UiIcon name="users" :size="16" /> Trocar pessoa
        </button>
        <button type="button" class="primary gift-add-main" @click="openForm()">
          <UiIcon name="plus" :size="17" /> Adicionar presente
        </button>
      </div>
    </div>

    <section v-if="legacyAvailable" class="gift-local-note" aria-label="Importação de presentes antigos">
      <p><strong>Presentes antigos encontrados neste navegador.</strong>
        A lista antiga não identifica a conta proprietária e não será importada automaticamente.
        Importe somente se você reconhecer que esses registros são seus.
      </p>
      <button type="button" class="secondary-action" @click="importLegacyGifts">
        Importar meus presentes antigos
      </button>
    </section>
    <p v-if="!person && error" class="error" role="alert">{{ error }}</p>
    <p v-if="!person && feedback" class="success" role="status">{{ feedback }}</p>

    <template v-if="person">
      <div class="gift-owner-banner">
        <div class="gift-owner-icon"><UiIcon name="heart" :size="25" /></div>
        <div>
          <span>Lista de desejos de</span>
          <strong>{{ personLabel }}</strong>
        </div>
        <span class="gift-owner-count">{{ gifts.length }} {{ gifts.length === 1 ? 'presente' : 'presentes' }}</span>
      </div>

      <div class="gift-summary">
        <div class="gift-summary-total">
          <span>Soma dos preços desejados</span>
          <strong>{{ formatBRL(totalPrice) }}</strong>
          <small>É uma lista de desejos, não entra nos gastos do Farol.</small>
        </div>
        <div class="gift-summary-priorities" aria-label="Quantos presentes por prioridade">
          <div class="gift-mini-priority high"><span class="gift-priority-dot"></span> Quero muito <strong>{{ counts.high }}</strong></div>
          <div class="gift-mini-priority medium"><span class="gift-priority-dot"></span> Mais ou menos <strong>{{ counts.medium }}</strong></div>
          <div class="gift-mini-priority low"><span class="gift-priority-dot"></span> Nem tanto <strong>{{ counts.low }}</strong></div>
        </div>
      </div>
      <p class="gift-local-note"><UiIcon name="info" :size="16" />
        Os presentes e as fotos ficam salvos neste navegador, separados dos espaços financeiros.
        Ainda não são compartilhados entre celulares ou contas e podem ser perdidos se você limpar os dados do site.
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="feedback" class="success" role="status">{{ feedback }}</p>

      <div v-if="!gifts.length && !error" class="gift-empty panel">
        <div class="gift-empty-icon"><UiIcon name="gift" :size="35" /></div>
        <h2>A lista de {{ personLabel }} está esperando o primeiro presente!</h2>
        <p>Adicione um desejo com preço, link da loja e o quanto quer ganhar. Depois arraste uma imagem para o cartão.</p>
        <button type="button" class="primary" @click="openForm()"><UiIcon name="plus" :size="17" /> Adicionar primeiro presente</button>
      </div>

      <div v-else-if="gifts.length" class="gift-grid">
        <article v-for="gift in gifts" :key="gift.id" class="gift-card"
          :class="'gift-card-' + gift.priority">
          <GiftPhoto :user-id="user?.id ?? ''" :gift-id="gift.id" :gift-name="gift.name" />
          <div class="gift-card-content">
            <span class="gift-priority-pill" :class="'gift-priority-' + gift.priority">
              <span class="gift-priority-dot"></span> {{ GIFT_PRIORITY_NAMES[gift.priority] }}
            </span>
            <h2>{{ gift.name }}</h2>
            <strong class="gift-price">{{ formatBRL(gift.priceCents) }}</strong>
            <a v-if="gift.productUrl" class="gift-shop-link" :href="gift.productUrl"
              target="_blank" rel="noopener noreferrer">
              <UiIcon name="arrow" :size="15" /> Abrir link para comprar
            </a>
            <p v-else class="gift-no-link">Link de compra ainda não informado</p>
            <div class="gift-card-actions">
              <button type="button" class="gift-card-edit" :aria-label="'Editar ' + gift.name" @click="openForm(gift)">
                <UiIcon name="edit" :size="15" /> Editar
              </button>
              <button type="button" class="gift-card-delete" :aria-label="'Excluir ' + gift.name" @click="removeGift(gift)">
                <UiIcon name="trash" :size="15" /> Excluir
              </button>
            </div>
          </div>
        </article>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="!person" class="gift-modal-overlay" role="presentation" @click.self="closeChooser">
        <div class="gift-modal gift-chooser" role="dialog" aria-modal="true" aria-labelledby="gift-choose-heading"
          @keydown="trapDialogFocus" @keydown.esc.prevent.stop="closeChooser">
          <div class="gift-modal-topline">
            <span class="gift-modal-kicker">UM DESEJO DE CADA VEZ</span>
            <button type="button" class="gift-close-modal" aria-label="Fechar escolha de pessoa" @click="closeChooser">Fechar ×</button>
          </div>
          <div class="gift-chooser-decoration" aria-hidden="true"><UiIcon name="gift" :size="32" /></div>
          <h2 id="gift-choose-heading">De quem é a lista?</h2>
          <p>Escolha uma pessoa para ver ou adicionar seus presentes desejados.</p>
          <div class="gift-people-grid">
            <button ref="chooserFirst" type="button" class="gift-person-option" @click="choosePerson('gustavo')">
              <span class="gift-person-avatar gustavo"><UiIcon name="user" :size="28" /></span>
              <strong>Gustavo</strong>
              <small>Ver meus presentes</small>
              <UiIcon name="arrow" :size="17" />
            </button>
            <button type="button" class="gift-person-option" @click="choosePerson('ana')">
              <span class="gift-person-avatar ana"><UiIcon name="heart" :size="28" /></span>
              <strong>Ana</strong>
              <small>Ver meus presentes</small>
              <UiIcon name="arrow" :size="17" />
            </button>
          </div>
          <button type="button" class="gift-cancel-choice" @click="closeChooser">
            Voltar para a visão geral sem escolher
          </button>
        </div>
      </div>

      <div v-if="formOpen && person" class="gift-modal-overlay" role="presentation" @click.self="closeForm">
        <div class="gift-modal gift-editor" role="dialog" aria-modal="true" aria-labelledby="gift-editor-heading"
          @keydown="trapDialogFocus" @keydown.esc.prevent.stop="closeForm">
          <div class="gift-modal-topline">
            <span class="gift-modal-kicker">{{ personLabel.toUpperCase() }} · LISTA DE PRESENTES</span>
            <button type="button" class="gift-close-modal" aria-label="Fechar formulário" @click="closeForm">×</button>
          </div>
          <h2 id="gift-editor-heading">{{ editId ? 'Editar presente' : 'Adicionar presente' }}</h2>
          <p>Preencha manualmente os detalhes do desejo. A foto é adicionada diretamente no cartão depois de salvar.</p>
          <form class="gift-editor-form" @submit.prevent="saveGift">
            <label>Nome do presente
              <input ref="formFirst" v-model="name" type="text" required minlength="2" maxlength="120"
                autocomplete="off" placeholder="Ex.: Fone sem fio" />
            </label>
            <label>Valor do presente
              <MoneyInput v-model="price" required placeholder="R$ 350,00" />
            </label>
            <label>Link para comprar (opcional)
              <input v-model="productUrl" type="text" inputmode="url" maxlength="2048"
                autocomplete="off" placeholder="https://www.loja.com.br/produto" />
            </label>
            <fieldset class="gift-priority-fieldset">
              <legend>Quanto você quer este presente?</legend>
              <div class="gift-priority-options">
                <label class="gift-priority-choice high" :class="{ checked: priority === 'high' }">
                  <input v-model="priority" type="radio" value="high" name="gift-priority" />
                  <span class="gift-priority-dot"></span><strong>Muito</strong><small>Verde</small>
                </label>
                <label class="gift-priority-choice medium" :class="{ checked: priority === 'medium' }">
                  <input v-model="priority" type="radio" value="medium" name="gift-priority" />
                  <span class="gift-priority-dot"></span><strong>Médio</strong><small>Amarelo</small>
                </label>
                <label class="gift-priority-choice low" :class="{ checked: priority === 'low' }">
                  <input v-model="priority" type="radio" value="low" name="gift-priority" />
                  <span class="gift-priority-dot"></span><strong>Nem tanto</strong><small>Vermelho</small>
                </label>
              </div>
            </fieldset>
            <p v-if="formError" class="error" role="alert">{{ formError }}</p>
            <div class="gift-editor-actions">
              <button type="button" class="secondary-action" @click="closeForm">Cancelar</button>
              <button type="submit" class="primary"><UiIcon name="check" :size="16" />
                {{ editId ? 'Salvar alterações' : 'Salvar presente' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

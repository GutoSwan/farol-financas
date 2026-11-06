<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import UiIcon from './UiIcon.vue'
import { deleteGiftPhoto, getGiftPhoto, saveGiftPhoto } from '../../infrastructure/persistence/GiftPhotoStorage'

const props = defineProps<{ giftId: string; giftName: string }>()
const picker = ref<HTMLInputElement | null>(null)
const imageUrl = ref('')
const dragging = ref(false)
const busy = ref(false)
const error = ref('')
let sequence = 0

async function loadImage(): Promise<void> {
  const request = ++sequence
  try {
    const stored = await getGiftPhoto(props.giftId)
    if (request !== sequence) return
    const next = stored ? URL.createObjectURL(stored) : ''
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = next
  } catch (cause) {
    if (request !== sequence) return
    error.value = cause instanceof Error ? cause.message : 'Não foi possível abrir a foto.'
  }
}

async function upload(file: File): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await saveGiftPhoto(props.giftId, file)
    await loadImage()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar a foto.'
  } finally {
    busy.value = false
  }
}

function pickFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void upload(file)
}

function dropFile(event: DragEvent): void {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) void upload(file)
}

async function removeImage(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await deleteGiftPhoto(props.giftId)
    const previous = imageUrl.value
    imageUrl.value = ''
    if (previous) URL.revokeObjectURL(previous)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível remover a foto.'
  } finally {
    busy.value = false
  }
}

onMounted(() => { void loadImage() })
onBeforeUnmount(() => {
  sequence++
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})
</script>

<template>
  <div class="gift-image-wrapper">
    <div class="gift-image-drop" :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="dropFile">
      <img v-if="imageUrl" :src="imageUrl" :alt="'Foto do presente: ' + giftName"
        class="gift-image-preview" loading="lazy" />
      <div v-else class="gift-image-placeholder" aria-hidden="true">
        <UiIcon name="gift" :size="39" />
        <span>Arraste a foto PNG aqui</span>
        <small>ou escolha do computador</small>
      </div>
      <div class="gift-image-controls">
        <input ref="picker" class="gift-visually-hidden" type="file"
          accept="image/png,image/jpeg,image/webp" :aria-label="'Escolher foto para ' + giftName"
          @change="pickFile" />
        <button type="button" class="gift-photo-button" :disabled="busy" @click="picker?.click()">
          {{ busy ? 'Salvando...' : imageUrl ? 'Trocar foto' : 'Escolher foto' }}
        </button>
        <button v-if="imageUrl" type="button" class="gift-photo-remove" :disabled="busy"
          :aria-label="'Remover foto de ' + giftName" @click="removeImage">Remover foto</button>
      </div>
    </div>
    <p v-if="error" class="gift-image-error" role="alert">{{ error }}</p>
  </div>
</template>

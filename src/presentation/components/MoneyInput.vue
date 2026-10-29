<script setup lang="ts">
import { formatBRLAsYouType, finishBRLInput } from '../utils/brlInput'

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  required: false,
  placeholder: 'R$ 500,00',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function update(event: Event): void {
  const input = event.target as HTMLInputElement
  const formatted = formatBRLAsYouType(input.value)
  input.value = formatted
  emit('update:modelValue', formatted)
}

function complete(): void {
  emit('update:modelValue', finishBRLInput(props.modelValue))
}
</script>

<template>
  <input
    :value="modelValue"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    :disabled="disabled"
    :required="required"
    :placeholder="placeholder"
    @input="update"
    @blur="complete"
  />
</template>

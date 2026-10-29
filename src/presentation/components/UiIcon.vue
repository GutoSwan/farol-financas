<script setup lang="ts">
type IconName = 'dashboard' | 'receipt' | 'repeat' | 'wallet' | 'card' | 'target' | 'chart' | 'trash' | 'edit' | 'archive' | 'restore' | 'plus' | 'users' | 'sun' | 'moon' | 'check' | 'folder' | 'arrow' | 'info' | 'settings' | 'user' | 'star' | 'heart' | 'rocket' | 'cat' | 'leaf' | 'log-out'

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 })

const paths: Record<IconName, string[]> = {
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  receipt: ['M4 3h16v18l-4-2-4 2-4-2-4 2V3z', 'M8 8h8', 'M8 12h8', 'M8 16h4'],
  repeat: ['M3 11a8 8 0 0 1 14-5', 'M17 2v4h-4', 'M21 13a8 8 0 0 1-14 5', 'M7 22v-4h4'],
  wallet: ['M3 6h17v15H3z', 'M3 6V3h15', 'M16 12h5v5h-5a2.5 2.5 0 0 1 0-5z'],
  card: ['M3 5h18v14H3z', 'M3 10h18'],
  target: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 12h.01'],
  chart: ['M3 3v18h18', 'M7 16l4-5 4 3 5-8'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 10v6', 'M14 10v6'],
  edit: ['M12 20h9', 'M16 4l4 4-11 11-5 1 1-5z'],
  archive: ['M3 4h18v5H3z', 'M5 9v11h14V9', 'M10 13h4'],
  restore: ['M3 12a9 9 0 1 0 3-7', 'M3 3v5h5', 'M12 7v5l3 2'],
  plus: ['M12 5v14', 'M5 12h14'],
  users: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 20v-2a4 4 0 0 0-3-3.87', 'M16 2.13a4 4 0 0 1 0 7.75'],
  sun: ['M12 4V2', 'M12 22v-2', 'M4 12H2', 'M22 12h-2', 'M4.93 4.93l1.42 1.42', 'M17.65 17.65l1.42 1.42', 'M4.93 19.07l1.42-1.42', 'M17.65 6.35l1.42-1.42', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  moon: ['M20.9 13A9 9 0 0 1 11 3a9 9 0 1 0 9.9 10z'],
  check: ['M4 12l5 5 11-11'],
  folder: ['M3 7h7l2 2h9v11H3z', 'M3 7V4h7l2 3'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 11v6', 'M12 7h.01'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M4 13v-2l2-1 1-2-1-2 2-2 2 1 2-1 1-2h2l1 2 2 1 2-1 2 2-1 2 1 2 2 1v2l-2 1-1 2 1 2-2 2-2-1-2 1-1 2h-2l-1-2-2-1-2 1-2-2 1-2-1-2z'],
  user: ['M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  star: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2 2 9.3l6.9-1z'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z'],
  rocket: ['M4.5 15.5c-1.3-3.4-.2-6.7 2.6-9.5 3.3-3.3 8-4.4 13.9-4-0.1 5.9-1.5 10.5-4.8 13.8-2.8 2.8-6.3 3.7-9.6 2.5z', 'M13 11a2 2 0 1 0 4 0 2 2 0 0 0-4 0z', 'M6 18l-3 3', 'M7 7l-4 1v4', 'M17 17l-1 4h-4'],
  cat: ['M4 10V4l4 3a9 9 0 0 1 8 0l4-3v6a8 8 0 1 1-16 0z', 'M8 13h.01', 'M16 13h.01', 'M10 17c1 1 3 1 4 0'],
  leaf: ['M20 4c-11 0-16 4-16 11a5 5 0 0 0 5 5c7 0 11-5 11-16z', 'M4 20c2-5 6-8 12-11'],
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
}
</script>
<template>
  <svg xmlns="http://www.w3.org/2000/svg" :width="size" :height="size" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">
    <path v-for="(path, index) in paths[name]" :key="index" :d="path" />
  </svg>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Icon from "../Icon.vue";
defineProps<{
  src: string;
  kind: string;
  provider?: string;
  sourceUrl?: string;
}>();
const error = ref(false);
const activated = ref(false);
</script>
<template>
  <div v-if="kind === 'audio'" class="audio-frame">
    <Icon name="audio" :size="64" /><audio
      controls
      preload="metadata"
      :src="src"
      @error="error = true"
    ></audio>
  </div>
  <template v-else-if="provider && ['youtube', 'rutube', 'vk'].includes(provider)"
    ><div v-if="!activated" class="empty">
      <Icon name="video" :size="45" />
      <h2>Видео · {{ provider }}</h2>
      <p>
        Плеер загрузится с сайта источника. Доступность зависит от его настроек
        и вашего соединения.
      </p>
      <button class="button primary" @click="activated = true">
        <Icon name="play" />Загрузить плеер
      </button>
    </div>
    <iframe
      v-else
      class="media-frame"
      :src="src"
      title="Видеоматериал"
      allow="fullscreen; picture-in-picture; encrypted-media"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe></template
  ><video
    v-else
    controls
    playsinline
    preload="metadata"
    :src="src"
    class="media-frame"
    @error="error = true"
  ></video>
  <div class="media-caption">
    <div v-if="error" class="notice warning">
      Браузер не смог воспроизвести файл. Проверьте кодек и доступность
      источника.
    </div>
    <p>
      Автоматическая расшифровка не выполняется. Текстовый режим появляется при
      добавленной расшифровке.
    </p>
    <a
      v-if="sourceUrl"
      :href="sourceUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="button small"
      style="margin-top: 15px"
      ><Icon name="external" :size="14" />Открыть в источнике</a
    >
  </div>
</template>

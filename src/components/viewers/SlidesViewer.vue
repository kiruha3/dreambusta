<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import type { PresentationScene } from "../../../vendor/shared/presentation";
import SlideObject from "./SlideObject.vue";
import Icon from "../Icon.vue";
const props = defineProps<{ src: string }>();
const scene = ref<PresentationScene>();
const index = ref(0);
const error = ref("");
const slide = computed(() => scene.value?.slides[index.value]);
const controller = new AbortController();
fetch(props.src, { signal: controller.signal })
  .then(async (r) => {
    if (!r.ok) throw new Error("Слайды недоступны");
    scene.value = await r.json();
  })
  .catch((e) => {
    if (!controller.signal.aborted) error.value = e.message;
  });
onBeforeUnmount(() => controller.abort());
</script>
<template>
  <div v-if="error" class="notice danger">{{ error }}</div>
  <template v-if="scene && slide"
    ><div
      class="slides-stage"
      :style="{ aspectRatio: `${scene.width}/${scene.height}` }"
    >
      <svg
        :viewBox="`0 0 ${scene.width} ${scene.height}`"
        role="img"
        :aria-label="`Слайд ${index + 1}`"
      >
        <rect
          width="100%"
          height="100%"
          :fill="
            slide.background
              ? `rgba(${Math.round(slide.background.r * 255)},${Math.round(slide.background.g * 255)},${Math.round(slide.background.b * 255)},${slide.background.a})`
              : 'white'
          "
        />
        <SlideObject
          v-for="object in slide.objects"
          :key="object.id"
          :object="object"
          :assets="scene.assets"
        />
      </svg>
    </div>
    <div class="slides-controls">
      <button
        class="icon-button"
        aria-label="Предыдущий слайд"
        :disabled="!index"
        @click="index--"
      >
        <Icon name="left" /></button
      ><span class="small-text"
        >Слайд {{ index + 1 }} из {{ scene.slides.length }}</span
      ><button
        class="icon-button"
        aria-label="Следующий слайд"
        :disabled="index >= scene.slides.length - 1"
        @click="index++"
      >
        <Icon name="right" />
      </button>
    </div>
    <div class="notice compact viewer-warning">
      Статические слайды. Сложные объекты и анимация могут отличаться от
      PowerPoint.
    </div></template
  >
</template>

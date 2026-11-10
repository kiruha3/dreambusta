<script setup lang="ts">
import type {
  PresentationScene,
  PresentationSlide,
} from "../../../vendor/shared/presentation";
import SlideObject from "./SlideObject.vue";
defineProps<{ scene: PresentationScene; slide: PresentationSlide }>();
</script>
<template>
  <svg :viewBox="`0 0 ${scene.width} ${scene.height}`">
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
</template>

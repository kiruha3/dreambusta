<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PublicationIcon } from "../../shared/types";
import { fileUrl } from "../api";
const props = defineProps<{
  icon?: PublicationIcon | null;
  materialId?: string;
}>();
const failed = ref(false);
watch(
  () => props.icon?.value,
  () => (failed.value = false),
);
const imageSrc = computed(() => {
  if (props.icon?.type !== "image") return "";
  const value = props.icon.value;
  if (props.materialId)
    return /^snapshot:[a-z0-9-]+$/.test(value)
      ? fileUrl(props.materialId, value.slice(9))
      : "";
  return /^https?:\/\//.test(value) ? value : "";
});
</script>
<template>
  <span
    v-if="icon?.type === 'emoji'"
    class="publication-icon"
    aria-hidden="true"
    >{{ icon.value }}</span
  >
  <img
    v-else-if="imageSrc && !failed"
    class="publication-icon"
    :src="imageSrc"
    alt=""
    @error="failed = true"
  />
</template>

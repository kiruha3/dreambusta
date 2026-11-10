<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import React from "react";
import { createRoot } from "react-dom/client";
import { DocxEditor } from "../../vendor-docx";
import Icon from "../Icon.vue";
const props = defineProps<{ src: string; title: string }>();
const host = ref<HTMLElement>();
const error = ref("");
const loading = ref(true);
let root: ReturnType<typeof createRoot> | undefined;
const controller = new AbortController();
let alive = true;
onMounted(async () => {
  try {
    const response = await fetch(props.src, { signal: controller.signal });
    if (!response.ok) throw new Error("Файл недоступен");
    const buffer = await response.arrayBuffer();
    if (!alive || !host.value) return;
    root = createRoot(host.value);
    let loaded = false;
    root.render(
      React.createElement(DocxEditor, {
        readOnly: true,
        canExport: false,
        showFileUpload: false,
        locale: "ru",
        documentTitle: props.title,
        onError: (e: Error) => {
          error.value = e.message;
          loading.value = false;
        },
        ref: (instance: any) => {
          if (instance && !loaded) {
            loaded = true;
            void instance
              .loadFromBuffer(buffer, props.title + ".docx")
              .then(() => (loading.value = false))
              .catch((e: Error) => {
                error.value = e.message;
                loading.value = false;
              });
          }
        },
      }),
    );
  } catch (e) {
    if (alive) {
      error.value = (e as Error).message;
      loading.value = false;
    }
  }
});
onBeforeUnmount(() => {
  alive = false;
  controller.abort();
  root?.unmount();
});
</script>
<template>
  <div v-if="loading" class="notice">
    <Icon name="document" />Открываем документ…
  </div>
  <div v-if="error" class="notice danger" role="alert">
    Не удалось отобразить документ: {{ error }}
  </div>
  <div ref="host" class="docx-island"></div>
</template>

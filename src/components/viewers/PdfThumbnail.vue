<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
const props = defineProps<{ document: PDFDocumentProxy; page: number }>();
const canvas = ref<HTMLCanvasElement>();
let observer: IntersectionObserver | undefined;
let render: RenderTask | undefined;
let disposed = false;
async function draw() {
  observer?.disconnect();
  try {
    const page = await props.document.getPage(props.page);
    if (disposed || !canvas.value) return;
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 96 / natural.width });
    const target = canvas.value;
    target.width = Math.ceil(viewport.width);
    target.height = Math.ceil(viewport.height);
    render = page.render({
      canvas: target,
      canvasContext: target.getContext("2d")!,
      viewport,
    });
    await render.promise;
  } catch {
    /* Page number navigation remains available on thumbnail failure. */
  }
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void draw();
    },
    { rootMargin: "150px" },
  );
  if (canvas.value) observer.observe(canvas.value);
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  render?.cancel();
});
</script>
<template>
  <canvas
    ref="canvas"
    class="pdf-thumbnail"
    :aria-label="`Миниатюра страницы ${page}`"
  />
</template>

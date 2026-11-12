<script setup lang="ts">
// Adapted from TechHelper ChatWidgetShell.vue / ChatHeader.vue, checkout
// 2250c8f13. Shell and drag behavior are local; no TechHelper runtime imports.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  MessageCircle,
  Pencil,
  X,
  Maximize2,
  Minimize2,
} from "lucide-vue-next";
const props = defineProps<{ isOpen: boolean; disabled?: boolean }>();
const emit = defineEmits<{ toggle: []; close: []; "new-chat": [] }>();
const panel = ref<HTMLElement>();
const launcher = ref<HTMLButtonElement>();
const expanded = ref(false);
const transitioning = ref(false);
let animation: Animation | undefined;
let interruptedFrame: Keyframe | undefined;
const widgetPosition = ref<{ left: number; top: number } | null>(null);
let moved = false;
let dragCleanup: (() => void) | undefined;
const widgetStyle = computed(() =>
  widgetPosition.value
    ? {
        left: `${widgetPosition.value.left}px`,
        top: `${widgetPosition.value.top}px`,
        right: "auto",
        bottom: "auto",
      }
    : undefined,
);
const popupStyle = computed(() =>
  widgetPosition.value && !expanded.value
    ? {
        left: `${Math.max(8, Math.min(widgetPosition.value.left + 56 - 384, window.innerWidth - 400))}px`,
        top: `${Math.max(8, Math.min(widgetPosition.value.top + 56 - 500, window.innerHeight - 508))}px`,
        right: "auto",
        bottom: "auto",
      }
    : undefined,
);
function clampPosition(left: number, top: number) {
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - 64)),
    top: Math.max(8, Math.min(top, window.innerHeight - 64)),
  };
}
function keepWidgetInViewport() {
  if (widgetPosition.value)
    widgetPosition.value = clampPosition(
      widgetPosition.value.left,
      widgetPosition.value.top,
    );
}
function persistPosition() {
  try {
    if (widgetPosition.value)
      localStorage.setItem(
        "dreambusta:assistant-widget-position",
        JSON.stringify(widgetPosition.value),
      );
  } catch {
    /* optional */
  }
}
function beginDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  dragCleanup?.();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY };
  moved = false;
  const move = (next: PointerEvent) => {
    if (
      Math.abs(next.clientX - start.x) > 3 ||
      Math.abs(next.clientY - start.y) > 3
    )
      moved = true;
    if (moved)
      widgetPosition.value = clampPosition(
        rect.left + next.clientX - start.x,
        rect.top + next.clientY - start.y,
      );
  };
  const stop = () => {
    persistPosition();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    dragCleanup = undefined;
  };
  dragCleanup = stop;
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}
function handleAvatarClick() {
  if (!moved) emit("toggle");
  moved = false;
}
function focusLauncher() {
  if (!props.isOpen && !transitioning.value) launcher.value?.focus();
}
function morph(element: Element, done: () => void, opening: boolean) {
  transitioning.value = true;
  const node = element as HTMLElement;
  const current = getComputedStyle(node);
  const interrupted = interruptedFrame;
  interruptedFrame = undefined;
  const start = interrupted || {
    transform: current.transform,
    opacity: current.opacity,
    borderRadius: current.borderRadius,
  };
  animation?.cancel();
  const source = launcher.value?.getBoundingClientRect();
  const target = node.getBoundingClientRect();
  const collapsed = {
    transform: source
      ? `translate(${source.right - target.right}px, ${source.bottom - target.bottom}px) scale(${source.width / target.width}, ${source.height / target.height})`
      : "scale(.1)",
    opacity: 0,
    borderRadius: "28px",
  };
  node.inert = !opening;
  if (opening) node.querySelector("textarea")?.focus();
  const finish = () => {
    animation = undefined;
    transitioning.value = false;
    done();
    if (!props.isOpen) void nextTick(focusLauncher);
  };
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !node.animate
  ) {
    finish();
    return;
  }
  animation = node.animate(
    opening
      ? [
          interrupted || collapsed,
          { transform: "none", opacity: 1, borderRadius: current.borderRadius },
        ]
      : [start, collapsed],
    { duration: opening ? 300 : 220, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
  animation.onfinish = finish;
}
function cancelMorph(element?: Element) {
  if (element && animation) {
    const current = getComputedStyle(element);
    interruptedFrame = {
      transform: current.transform,
      opacity: current.opacity,
      borderRadius: current.borderRadius,
    };
  }
  animation?.cancel();
  animation = undefined;
}
onMounted(() => {
  try {
    const position = JSON.parse(
      localStorage.getItem("dreambusta:assistant-widget-position") || "null",
    );
    if (
      position &&
      Number.isFinite(position.left) &&
      Number.isFinite(position.top)
    )
      widgetPosition.value = clampPosition(position.left, position.top);
  } catch {
    /* optional */
  }
  window.addEventListener("resize", keepWidgetInViewport);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", keepWidgetInViewport);
  dragCleanup?.();
  cancelMorph();
});
defineExpose({ focusLauncher });
</script>
<template>
  <Teleport to="body">
    <div
      v-if="!disabled"
      class="chat-master-widget"
      :class="{ 'chat-master-hidden': isOpen || transitioning }"
      :style="widgetStyle"
      @pointerdown="beginDrag"
    >
      <button
        ref="launcher"
        type="button"
        class="chat-master-avatar"
        aria-label="Открыть помощника"
        :aria-hidden="isOpen || transitioning ? true : undefined"
        :tabindex="isOpen || transitioning ? -1 : 0"
        :aria-expanded="isOpen"
        aria-controls="dreambusta-assistant"
        title="Помощник · можно перетащить"
        @click="handleAvatarClick"
      >
        <MessageCircle :size="25" />
      </button>
    </div>
    <Transition
      :css="false"
      @enter="(element, done) => morph(element, done, true)"
      @leave="(element, done) => morph(element, done, false)"
      @enter-cancelled="cancelMorph"
      @leave-cancelled="cancelMorph"
    >
      <div
        v-if="isOpen && !disabled"
        id="dreambusta-assistant"
        ref="panel"
        class="chat-popup-window"
        :class="{ 'chat-popup-expanded': expanded }"
        :style="popupStyle"
        role="dialog"
        aria-label="Помощник по библиотеке"
        @keydown.esc.stop.prevent="emit('close')"
      >
        <div class="assistant-header">
          <div>
            <MessageCircle :size="19" />
            <h2>Помощник</h2>
          </div>
          <div>
            <button
              class="icon-button"
              aria-label="Новый диалог"
              title="Новый диалог"
              @click="emit('new-chat')"
            >
              <Pencil :size="17" />
            </button>
            <button
              class="icon-button assistant-expand"
              :aria-label="
                expanded ? 'Свернуть помощника' : 'Развернуть помощника'
              "
              @click="expanded = !expanded"
            >
              <Minimize2 v-if="expanded" :size="17" /><Maximize2
                v-else
                :size="17"
              />
            </button>
            <button
              class="icon-button"
              aria-label="Закрыть помощника"
              @click="emit('close')"
            >
              <X :size="19" />
            </button>
          </div>
        </div>
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.chat-master-widget {
  position: fixed;
  z-index: 50;
  right: 20px;
  bottom: 20px;
  width: 56px;
  height: 56px;
  touch-action: none;
}
.chat-master-avatar {
  display: flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--primary);
  color: var(--primary-foreground);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  transition: transform 0.15s ease;
  cursor: grab;
}
.chat-master-avatar:hover {
  transform: scale(1.05);
}
.chat-master-hidden {
  visibility: hidden;
  pointer-events: none;
}
.chat-master-avatar:active {
  cursor: grabbing;
}
.chat-popup-window {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 50;
  width: 384px;
  max-width: calc(100vw - 40px);
  height: 500px;
  max-height: calc(100dvh - 40px);
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 40px #0003;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
}
.chat-popup-expanded {
  width: 600px;
  height: calc(100dvh - 40px);
  max-height: calc(100dvh - 40px);
  top: 20px;
  bottom: 20px;
}
.assistant-header,
.assistant-header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.assistant-header {
  justify-content: space-between;
  flex-shrink: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.assistant-header h2 {
  font-size: 14px;
  font-weight: 600;
}
.assistant-header .icon-button {
  width: 30px;
  height: 30px;
}
@media (max-width: 600px) {
  .chat-popup-window {
    inset: 0 !important;
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border: 0;
    border-radius: 0;
  }
  .assistant-expand {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-master-avatar {
    transition: none;
  }
}
</style>

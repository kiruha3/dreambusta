<script setup lang="ts">
import { computed, ref } from "vue";
import type { Material } from "../../shared/types";
import { api, send, session, notify, loadNavigation } from "../api";
const closed = ref(session.closed);
const selected = ref<string[]>([]);
const materials = ref<Material[]>([]);
const filter = ref("");
const loaded = ref(false);
const busy = ref(false);
const error = ref("");
const choices = computed(() =>
  materials.value.filter((m) =>
    m.title.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()),
  ),
);
const ordered = computed(() =>
  selected.value
    .map((id) => materials.value.find((m) => m.id === id))
    .filter((m): m is Material => !!m),
);
Promise.all([
  api<{ closed: boolean; sidebarMaterialIds: string[] }>("/settings"),
  api<Material[]>("/materials"),
])
  .then(([s, list]) => {
    materials.value = list;
    closed.value = s.closed;
    selected.value = (s.sidebarMaterialIds || []).filter((id) =>
      list.some((m) => m.id === id),
    );
    loaded.value = true;
  })
  .catch((e) => (error.value = e.message));
function move(index: number, offset: number) {
  const next = [...selected.value];
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  selected.value = next;
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await send("/settings", "PATCH", {
      closed: closed.value,
      sidebarMaterialIds: selected.value,
    });
    session.closed = closed.value;
    await loadNavigation();
    notify("Настройки сохранены");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">УПРАВЛЕНИЕ</div>
      <h1>Настройки библиотеки</h1>
      <p>Доступ и материалы в боковом меню.</p>
    </div>
  </div>
  <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
  <form class="stack max-form" @submit.prevent="save">
    <section class="panel stack">
      <h2>Доступ к каталогу</h2>
      <label class="check-label"
        ><input v-model="closed" type="checkbox" />Закрыть библиотеку для
        посетителей без входа</label
      >
      <p class="muted">
        В закрытой библиотеке внешние помощники также недоступны.
      </p>
    </section>
    <section class="panel stack">
      <h2>Быстрый доступ</h2>
      <p class="muted">
        Выберите до 30 материалов. Они появятся слева под управлением. Гости
        увидят только опубликованные материалы; скрытые файлы останутся доступны
        редактору.
      </p>
      <label class="field"
        >Найти материал<input v-model="filter" type="search"
      /></label>
      <div class="settings-materials">
        <label v-for="m in choices" :key="m.id" class="check-label"
          ><input
            v-model="selected"
            type="checkbox"
            :value="m.id"
            :disabled="!selected.includes(m.id) && selected.length >= 30"
          /><span
            >{{ m.title
            }}<small v-if="!m.visible" class="muted"> · скрыт</small></span
          ></label
        >
      </div>
      <h3 v-if="ordered.length">Порядок в меню</h3>
      <ol class="settings-order">
        <li v-for="(m, index) in ordered" :key="m.id">
          <span>{{ m.title }}</span
          ><button
            type="button"
            class="button small"
            :aria-label="`Поднять ${m.title}`"
            :disabled="index === 0"
            @click="move(index, -1)"
          >
            ↑</button
          ><button
            type="button"
            class="button small"
            :aria-label="`Опустить ${m.title}`"
            :disabled="index === ordered.length - 1"
            @click="move(index, 1)"
          >
            ↓
          </button>
        </li>
      </ol>
    </section>
    <button class="button primary self-start" :disabled="!loaded || busy">
      {{ busy ? "Сохраняем…" : "Сохранить настройки" }}
    </button>
  </form>
</template>

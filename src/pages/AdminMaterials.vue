<script setup lang="ts">
import { ref, computed } from "vue";
import type { Material } from "../../shared/types";
import { api, kindNames, date, send, notify } from "../api";
import Icon from "../components/Icon.vue";
const items = ref<Material[]>([]);
const query = ref("");
const error = ref("");
async function load() {
  try {
    items.value = await api("/materials");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
void load();
const filtered = computed(() =>
  items.value.filter((m) =>
    `${m.title} ${m.author}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
async function toggle(m: Material) {
  try {
    await send(`/materials/${m.id}`, "PATCH", { visible: !m.visible });
    await load();
    notify(m.visible ? "Материал скрыт из библиотеки" : "Материал доступен");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">УПРАВЛЕНИЕ</div>
      <h1>Материалы</h1>
      <p>Добавляйте, обновляйте и управляйте доступом.</p>
    </div>
    <RouterLink class="button primary" to="/admin/add"
      ><Icon name="plus" />Добавить материал</RouterLink
    >
  </div>
  <label class="search-box"
    ><Icon name="search" /><input
      v-model="query"
      placeholder="Найти материал"
      aria-label="Найти материал"
  /></label>
  <div v-if="error" class="notice danger">{{ error }}</div>
  <div class="table-wrap panel">
    <table>
      <thead>
        <tr>
          <th>Материал</th>
          <th>Тип</th>
          <th>Статус</th>
          <th>Обновлён</th>
          <th><span class="sr-only">Действия</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in filtered" :key="m.id">
          <td>
            <RouterLink :to="`/admin/materials/${m.id}`" class="row"
              ><span class="file-icon"><Icon :name="m.kind" :size="22" /></span
              ><span
                ><strong>{{ m.title }}</strong
                ><small>{{
                  m.source.provider ||
                  m.files.original?.name ||
                  "Локальный материал"
                }}</small></span
              ></RouterLink
            >
          </td>
          <td>{{ kindNames[m.kind] }}</td>
          <td>
            <button
              class="badge"
              :class="{
                danger: m.state === 'error',
                success: m.visible && m.state === 'ready',
              }"
              @click="toggle(m)"
            >
              {{
                m.state === "error"
                  ? "Ошибка обработки"
                  : m.visible
                    ? "Доступен"
                    : "Скрыт"
              }}
            </button>
          </td>
          <td>{{ date(m.updatedAt) }}</td>
          <td>
            <RouterLink
              class="icon-button"
              :to="`/admin/materials/${m.id}`"
              :aria-label="`Редактировать ${m.title}`"
              ><Icon name="edit"
            /></RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!filtered.length" class="empty">
      <h2>Материалов пока нет</h2>
      <p>Начните с загрузки файла или добавления ссылки.</p>
    </div>
  </div>
</template>

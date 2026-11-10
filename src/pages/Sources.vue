<script setup lang="ts">
import { ref } from "vue";
import type { Material } from "../../shared/types";
import { api, date } from "../api";
import Icon from "../components/Icon.vue";
const items = ref<Material[]>([]);
const error = ref("");
api<Material[]>("/materials")
  .then((x) => (items.value = x.filter((m) => m.source.type !== "file")))
  .catch((e) => (error.value = e.message));
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">УПРАВЛЕНИЕ</div>
      <h1>Источники</h1>
      <p>Сохранённые публикации и внешние медиа.</p>
    </div>
    <RouterLink class="button primary" to="/admin/add"
      ><Icon name="plus" />Добавить ссылку</RouterLink
    >
  </div>
  <div class="notice">
    <Icon name="info" /><span
      >Сохранённые версии открываются без обращения к источнику. Обновление
      запускает редактор в карточке материала.</span
    >
  </div>
  <div v-if="error" class="notice danger">{{ error }}</div>
  <div class="panel table-wrap">
    <table>
      <thead>
        <tr>
          <th>Материал</th>
          <th>Источник</th>
          <th>Состояние</th>
          <th>Сохранён</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in items" :key="m.id">
          <td>
            <RouterLink :to="`/admin/materials/${m.id}`"
              ><strong>{{ m.title }}</strong
              ><small class="source-url">{{ m.source.url }}</small></RouterLink
            >
          </td>
          <td>{{ m.source.provider }}</td>
          <td>
            <span
              class="badge"
              :class="{
                warning: ['error', 'unavailable'].includes(
                  m.source.status || '',
                ),
              }"
              >{{
                m.source.type === "link"
                  ? "Нужна сеть"
                  : m.source.status === "saved"
                    ? "Сохранённая версия"
                    : m.source.status === "removed"
                      ? "Обновление завершено"
                      : "Старая версия сохранена"
              }}</span
            >
          </td>
          <td>{{ date(m.source.savedAt) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="!items.length" class="empty">
      Внешние источники пока не добавлены
    </div>
  </div>
</template>

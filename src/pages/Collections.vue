<script setup lang="ts">
import { ref } from "vue";
import type { Collection } from "../../shared/types";
import { api, session } from "../api";
import Icon from "../components/Icon.vue";
const items = ref<Collection[]>([]);
const error = ref("");
api<Collection[]>("/collections")
  .then((x) => (items.value = x))
  .catch((e) => (error.value = e.message));
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">ЗНАНИЯ ПО ТЕМАМ</div>
      <h1>Подборки</h1>
      <p>
        Материалы в нужном порядке. Один материал может входить в несколько
        подборок.
      </p>
    </div>
    <RouterLink
      v-if="session.editor"
      to="/admin/collections/new"
      class="button primary"
      ><Icon name="plus" />Создать подборку</RouterLink
    >
  </div>
  <div v-if="error" class="notice danger">{{ error }}</div>
  <div class="collection-grid">
    <RouterLink
      v-for="c in items"
      :key="c.id"
      :to="`/collections/${c.slug}`"
      class="panel collection-card"
      ><div class="collection-art"><Icon name="collections" :size="52" /></div>
      <span class="muted small-text"
        >{{ c.materialIds.length }} материалов
        <span v-if="!c.visible">· скрыта</span></span
      >
      <h2>{{ c.title }}</h2>
      <p>{{ c.description }}</p>
      <span class="row small-text">Открыть подборку <Icon name="next" /></span
    ></RouterLink>
  </div>
  <div v-if="!items.length && !error" class="empty panel">
    <Icon name="collections" :size="38" />
    <h2>Соберите знания по темам</h2>
    <p>Создайте подборку и добавьте в неё материалы из библиотеки.</p>
  </div>
</template>

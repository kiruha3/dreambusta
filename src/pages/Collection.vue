<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Collection, Material } from "../../shared/types";
import { api, session } from "../api";
import MaterialCard from "../components/MaterialCard.vue";
import Icon from "../components/Icon.vue";
const route = useRoute();
const router = useRouter();
const c = ref<Collection>();
const items = ref<Material[]>([]);
const error = ref("");
(async () => {
  try {
    c.value = await api<Collection>(`/collections/${route.params.slug}`);
    if (route.params.slug !== c.value.slug)
      await router.replace(`/collections/${c.value.slug}`);
    const all = await api<Material[]>("/materials");
    items.value = c.value.materialIds
      .map((id) => all.find((m) => m.id === id))
      .filter((m): m is Material => !!m);
  } catch (e) {
    error.value = (e as Error).message;
  }
})();
</script>
<template>
  <RouterLink to="/collections" class="back-link"
    ><Icon name="back" />Все подборки</RouterLink
  >
  <div v-if="error" class="empty panel">
    <h1>{{ error }}</h1>
    <RouterLink to="/library">Открыть библиотеку</RouterLink>
  </div>
  <template v-if="c"
    ><div class="page-heading">
      <div>
        <div class="eyebrow">ПОДБОРКА · {{ items.length }} МАТЕРИАЛОВ</div>
        <h1>{{ c.title }}</h1>
        <p>{{ c.description }}</p>
      </div>
      <RouterLink
        v-if="session.editor"
        :to="`/admin/collections/${c.id}`"
        class="button"
        ><Icon name="edit" />Редактировать</RouterLink
      >
    </div>
    <div class="cards">
      <MaterialCard v-for="m in items" :key="m.id" :material="m" :context="{from: 'collection', collection: c.slug}" />
    </div>
    <div v-if="!items.length" class="empty panel">
      В этой подборке пока нет доступных материалов.
    </div></template
  >
</template>

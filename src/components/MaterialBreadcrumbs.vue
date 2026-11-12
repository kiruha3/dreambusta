<script setup lang="ts">
import { computed } from "vue";
import type { Collection, Material, PublicationPage } from "../../shared/types";
const props = defineProps<{
  material: Material;
  collection?: Collection;
  context: Record<string, string>;
  page?: PublicationPage;
  ancestors: PublicationPage[];
  pagePath: (slug?: string) => string;
  pageMissing: boolean;
}>();
const parents = computed(() => {
  if (props.collection)
    return [
      { title: "Все материалы", path: "/library" },
      { title: "Подборки", path: "/collections" },
      {
        title: props.collection.title,
        path: `/collections/${props.collection.slug}`,
      },
    ];
  if (props.context.from === "knowledge")
    return [{ title: "База знаний", path: "/knowledge" }];
  if (props.context.from === "favorites")
    return [{ title: "Избранное", path: "/library?view=favorites" }];
  if (props.context.from === "continue")
    return [{ title: "Продолжить чтение", path: "/library?view=continue" }];
  return [{ title: "Все материалы", path: "/library" }];
});
</script>
<template>
  <nav class="material-breadcrumbs" aria-label="Хлебные крошки">
    <ol>
      <li v-for="parent in parents" :key="parent.path">
        <RouterLink :to="parent.path">{{ parent.title }}</RouterLink>
      </li>
      <li>
        <RouterLink v-if="page || pageMissing" :to="pagePath()">{{
          material.title
        }}</RouterLink
        ><span v-else aria-current="page">{{ material.title }}</span>
      </li>
      <li v-for="ancestor in ancestors" :key="ancestor.slug">
        <RouterLink :to="pagePath(ancestor.slug)">{{
          ancestor.title
        }}</RouterLink>
      </li>
      <li v-if="page">
        <span aria-current="page">{{ page.title }}</span>
      </li>
      <li v-else-if="pageMissing">
        <span aria-current="page">Раздел не найден</span>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import type { Material } from "../../shared/types";
import Icon from "./Icon.vue";
import { kindNames, fileUrl } from "../api";
import { withContext } from "../lib/navigation";
defineProps<{
  material: Material;
  number?: number;
  context?: Record<string, unknown>;
}>();
</script>
<template>
  <RouterLink
    class="material-card"
    :to="withContext(`/library/${material.slug}`, context || {})"
  >
    <div class="card-art" :class="`art-${material.kind}`">
      <img
        v-if="material.cover"
        :src="fileUrl(material.id, 'cover')"
        alt=""
      /><template v-else
        ><span class="art-label"
          >DREAMBUSTA / {{ kindNames[material.kind] }}</span
        ><strong>{{ material.title }}</strong
        ><Icon :name="material.kind" :size="72" /></template
      ><span class="format">{{
        material.source.provider ||
        material.files?.original?.name.split(".").pop()?.toUpperCase() ||
        material.kind.toUpperCase()
      }}</span>
    </div>
    <div class="card-body">
      <div class="row between">
        <span class="muted small-text">{{ kindNames[material.kind] }}</span
        ><span v-if="!material.visible" class="badge">Скрыт</span
        ><span v-else-if="material.state === 'error'" class="badge danger"
          >Ошибка обработки</span
        >
      </div>
      <h3>{{ material.title }}</h3>
      <p>
        {{
          material.author ||
          material.description ||
          (material.wordCount
            ? `${material.wordCount.toLocaleString("ru")} слов · ${Math.max(1, Math.ceil(material.wordCount / 200))} мин чтения`
            : "Открыть материал")
        }}
      </p>
      <div class="row card-bottom">
        <Icon :name="material.kind" :size="15" /><span>{{
          material.source.type === "share"
            ? "Сохранённая версия"
            : material.representations.includes("text")
              ? "Текст и скорочтение"
              : "Просмотр"
        }}</span
        ><Icon name="next" :size="15" />
      </div>
    </div>
  </RouterLink>
</template>

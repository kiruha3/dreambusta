<script setup lang="ts">
import { computed } from "vue";
import type { PublicationNode } from "../../shared/types";
import PublicationIcon from "./PublicationIcon.vue";
const props = withDefaults(
  defineProps<{
    nodes: PublicationNode[];
    parent?: string;
    ancestors?: string[];
    currentUrl?: string;
    selectedUrls?: string[];
    lockedUrl?: string;
    disabled?: boolean;
    hrefFor?: (url: string) => string;
    materialId?: string;
  }>(),
  { ancestors: () => [] },
);
const emit = defineEmits<{ toggle: [url: string, checked: boolean] }>();
const visible = computed(() =>
  props.nodes.filter(
    (n) =>
      !props.ancestors.includes(n.sourceUrl) &&
      (props.parent
        ? n.parentSourceUrl === props.parent
        : !n.parentSourceUrl ||
          !props.nodes.some((p) => p.sourceUrl === n.parentSourceUrl)),
  ),
);
const hasChildren = (url: string) =>
  props.nodes.some(
    (n) => n.parentSourceUrl === url && !props.ancestors.includes(n.sourceUrl),
  );
</script>
<template>
  <ul class="publication-tree-list">
    <li v-for="node in visible" :key="node.sourceUrl">
      <details
        :open="true"
        :class="{ 'tree-leaf': !hasChildren(node.sourceUrl) }"
      >
        <summary>
          <label v-if="selectedUrls" class="tree-choice" @click.stop>
            <input
              type="checkbox"
              :checked="selectedUrls.includes(node.sourceUrl)"
              :disabled="disabled || node.sourceUrl === lockedUrl"
              @change="
                emit(
                  'toggle',
                  node.sourceUrl,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span><PublicationIcon :icon="node.icon" />{{ node.title }}</span>
          </label>
          <RouterLink
            v-else
            :to="hrefFor!(node.sourceUrl)"
            :aria-current="node.sourceUrl === currentUrl ? 'page' : undefined"
            @click.stop
            ><PublicationIcon :icon="node.icon" :material-id="materialId" />{{
              node.title
            }}</RouterLink
          >
        </summary>
        <PublicationTree
          v-if="hasChildren(node.sourceUrl) && ancestors.length < 100"
          :nodes="nodes"
          :parent="node.sourceUrl"
          :ancestors="[...ancestors, node.sourceUrl]"
          :current-url="currentUrl"
          :selected-urls="selectedUrls"
          :locked-url="lockedUrl"
          :disabled="disabled"
          :href-for="hrefFor"
          :material-id="materialId"
          @toggle="(url, checked) => emit('toggle', url, checked)"
        />
      </details>
    </li>
  </ul>
</template>

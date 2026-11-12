import { ref } from "vue";
export const searchOpen = ref(false);
export const searchSeed = ref<string>();
export function openSearch(query?: string | Event) {
  searchSeed.value = typeof query === "string" ? query : undefined;
  searchOpen.value = true;
}

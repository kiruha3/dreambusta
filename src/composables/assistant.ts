import { ref, shallowRef } from "vue";
import type { SearchQuery } from "../../shared/search";
import { searchOpen } from "./search";
export const assistantOpen = ref(false);
export const assistantRequest = shallowRef<SearchQuery>();
export function openAssistant(request?: SearchQuery) {
  searchOpen.value = false;
  assistantRequest.value = request ? { ...request } : undefined;
  assistantOpen.value = true;
}

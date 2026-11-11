import { createRouter, createWebHistory } from "vue-router";
import { loadSession, session } from "./api";
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/library" },
    { path: "/library", component: () => import("./pages/Catalog.vue") },
    { path: "/library/:slug", component: () => import("./pages/Material.vue") },
    {
      path: "/collections",
      component: () => import("./pages/Collections.vue"),
    },
    {
      path: "/collections/:slug",
      component: () => import("./pages/Collection.vue"),
    },
    { path: "/login", component: () => import("./pages/Login.vue") },
    { path: "/admin", redirect: "/admin/materials" },
    {
      path: "/admin/materials",
      component: () => import("./pages/AdminMaterials.vue"),
    },
    { path: "/admin/add", component: () => import("./pages/AddMaterial.vue") },
    {
      path: "/admin/materials/:id",
      component: () => import("./pages/EditMaterial.vue"),
    },
    {
      path: "/admin/collections/new",
      component: () => import("./pages/EditCollection.vue"),
    },
    {
      path: "/admin/collections/:id",
      component: () => import("./pages/EditCollection.vue"),
    },
    { path: "/admin/sources", component: () => import("./pages/Sources.vue") },
    {
      path: "/admin/settings",
      component: () => import("./pages/Settings.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      component: () => import("./pages/NotFound.vue"),
    },
  ],
  // Material.vue scrolls fragment targets after its saved HTML is rendered.
  scrollBehavior: (to) => (to.hash ? false : { top: 0 }),
});
router.beforeEach(async (to) => {
  try {
    await loadSession();
  } catch {
    return true;
  }
  if (
    (to.path.startsWith("/admin") || session.closed) &&
    to.path !== "/login" &&
    !session.editor
  )
    return { path: "/login", query: { next: to.fullPath } };
});

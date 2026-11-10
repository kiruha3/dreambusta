export function loadViewPosition(key: string, count: number) {
  let saved: { page?: number; zoom?: number } = {};
  try {
    saved = JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {}
  return {
    page: Math.min(
      Math.max(1, count),
      Math.max(1, Math.floor(Number(saved.page)) || 1),
    ),
    zoom: Math.min(3, Math.max(0.5, Number(saved.zoom) || 1)),
  };
}
export function saveViewPosition(key: string, page: number, zoom: number) {
  try {
    localStorage.setItem(key, JSON.stringify({ page, zoom }));
  } catch {}
}

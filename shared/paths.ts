export function createPaths(value = "") {
  const base = value === "/" ? "" : value.replace(/\/$/, "");
  if (base && !/^\/(?:[a-zA-Z0-9_-]+)(?:\/[a-zA-Z0-9_-]+)*$/.test(base))
    throw new Error("Base path must contain only absolute path segments");
  return {
    base,
    catalog: base ? "/" : "/library",
    material: (slug: string) =>
      `${base ? "/materials" : "/library"}/${encodeURIComponent(slug)}`,
    public: (path: string) =>
      `${base}${path.startsWith("/") ? path : "/" + path}`,
    internal: (path: string) =>
      base && (path.startsWith(base + "/") || path === base)
        ? path.slice(base.length) || "/"
        : path,
  };
}

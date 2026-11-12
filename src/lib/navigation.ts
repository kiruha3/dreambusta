export function contextQuery(
  query: Record<string, unknown>,
): Record<string, string> {
  const from = query.from;
  if (
    from === "collection" &&
    typeof query.collection === "string" &&
    /^[a-z0-9-]{1,200}$/.test(query.collection)
  )
    return { from, collection: query.collection };
  if (from === "knowledge" || from === "favorites" || from === "continue")
    return { from };
  return {};
}
export function withContext(
  path: string,
  query: Record<string, unknown>,
): string {
  const url = new URL(path, "http://navigation.local");
  for (const [key, value] of Object.entries(contextQuery(query)))
    url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

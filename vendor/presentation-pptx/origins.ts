import type { PresentationObject, PresentationScene } from '../shared/presentation.ts'
import type { ObjectBinding, PptxDocument, SlideBinding } from './types.ts'

/** Authoritative original bindings, resolved through same-draft clone chains. */
export type PresentationOrigins = {
  slides: Map<string, SlideBinding | undefined>; objects: Map<string, ObjectBinding | undefined>
}
function allObjects(objects: PresentationObject[]): PresentationObject[] {
  return objects.flatMap(object => object.kind === 'group' ? [object, ...allObjects(object.objects)] : [object])
}
function resolveOne<Node extends { cloneOf?: string }, Binding>(id: string, nodes: Map<string, Node>, resolved: Map<string, Binding | undefined>): Binding | undefined {
  const visited = new Set<string>()
  let current = id
  while (!resolved.has(current)) {
    if (visited.has(current)) throw Error('Циклический cloneOf')
    visited.add(current)
    const node = nodes.get(current)
    if (!node) throw Error('Неизвестный cloneOf')
    if (!node.cloneOf) { resolved.set(current, undefined); break }
    current = node.cloneOf
  }
  const origin = resolved.get(current)
  for (const key of visited) resolved.set(key, origin)
  return origin
}
function resolveAll<Node extends { id: string; cloneOf?: string }, Binding>(nodes: Node[], original: Map<string, Binding>): Map<string, Binding | undefined> {
  const incoming = new Map(nodes.map(node => [node.id, node]))
  const resolved = new Map<string, Binding | undefined>(original)
  for (const node of nodes) resolveOne(node.id, incoming, resolved)
  return resolved
}
/** Draft copies of new objects remain new; copies of imported objects retain their source. */
export function resolveOrigins(document: PptxDocument, scene: PresentationScene): PresentationOrigins {
  return {
    slides: resolveAll(scene.slides, document.slides),
    objects: resolveAll(scene.slides.flatMap(slide => allObjects(slide.objects)), document.objects),
  }
}

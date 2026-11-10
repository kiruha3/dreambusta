import { posix } from 'node:path'
import { children, NS, xmlPart } from './xml.ts'
import type { PackageContext } from './types.ts'

/** One internal package relationship. External resources are never fetched. */
export type Relationship = { id: string; type: string; target: string }
/** Resolves a relationship part adjacent to its owner. */
export function relationshipPart(owner: string): string {
  return posix.join(posix.dirname(owner), '_rels', `${posix.basename(owner)}.rels`)
}
function targetPart(owner: string, target: string): string {
  let decoded: string
  try { decoded = decodeURIComponent(target) } catch { throw Error('Некорректный URI relationship') }
  if (/[\\\0?#:]/.test(decoded)) throw Error('Небезопасный relationship target')
  const normalized = posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(owner), decoded))
  if (normalized.startsWith('../')) throw Error('Relationship выходит за пакет')
  return normalized
}
/** Retrieves and validates all relationships of one source part. */
export function relationships(context: PackageContext, owner: string): Relationship[] {
  const part = relationshipPart(owner)
  if (!context.entries.has(part)) return []
  const root = xmlPart(context, part).documentElement
  if (root.namespaceURI !== NS.rel || root.localName !== 'Relationships') throw Error('Некорректный XML relationships')
  const ids = new Set<string>()
  return children(root).map(element => {
    if (element.getAttribute('TargetMode') === 'External') throw Error('Внешние relationships запрещены')
    const id = element.getAttribute('Id') ?? ''
    if (!id || ids.has(id)) throw Error('Повторяющийся relationship ID')
    ids.add(id)
    const target = targetPart(owner, element.getAttribute('Target') ?? '')
    if (!context.entries.has(target)) throw Error(`Отсутствует relationship target: ${target}`)
    return { id, type: element.getAttribute('Type') ?? '', target }
  })
}
/** Finds a related XML part by standardized relationship type suffix. */
export function related(context: PackageContext, owner: string, type: string): string | undefined {
  return relationships(context, owner).find(relation => relation.type.endsWith(`/${type}`))?.target
}
/** Validates every package relationship, including unsupported parts. */
export function validateRelationships(context: PackageContext): void {
  for (const part of context.entries.keys()) {
    if (!part.endsWith('.rels')) continue
    const owner = part === '_rels/.rels' ? '' : part.replace(/_rels\/([^/]+)\.rels$/, '$1')
    relationships(context, owner)
  }
}

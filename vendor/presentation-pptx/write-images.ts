import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import type { Element } from '@xmldom/xmldom'
import type { PresentationImageObject, PresentationScene } from '../shared/presentation.ts'
import { PRESENTATION_MAX_IMAGE_BYTES } from './constants.ts'
import { imageMime } from './images.ts'
import { NS, child, children, ensure, parseXml, serializeXml, xmlPart } from './xml.ts'
import { relationshipPart } from './relationships.ts'
import type { PackageContext } from './types.ts'

/** Ensures one content-type declaration without rewriting unrelated declarations. */
export function contentType(context: PackageContext, part: string, type: string): void {
  const document = xmlPart(context, '[Content_Types].xml')
  if (children(document.documentElement).some(element => element.getAttribute('PartName') === `/${part}`)) return
  const element = document.createElementNS(NS.ct, 'Override')
  element.setAttribute('PartName', `/${part}`)
  element.setAttribute('ContentType', type)
  document.documentElement.appendChild(element)
  context.entries.set('[Content_Types].xml', serializeXml(document))
}
/** Adds a unique relationship local to the owning part. */
export function addRelationship(context: PackageContext, owner: string, target: string, type: string): string {
  const part = relationshipPart(owner)
  if (!context.entries.has(part)) context.entries.set(part, new TextEncoder().encode(`<Relationships xmlns="${NS.rel}"/>`))
  const document = context.xml.get(part) ?? parseXml(context.entries.get(part)!)
  context.xml.set(part, document)
  const id = `rIdDream${randomUUID().replaceAll('-', '')}`
  const element = document.createElementNS(NS.rel, 'Relationship')
  element.setAttribute('Id', id)
  element.setAttribute('Type', `${NS.r}/${type}`)
  element.setAttribute('Target', posix.relative(posix.dirname(owner), target))
  document.documentElement.appendChild(element)
  context.entries.set(part, serializeXml(document))
  return id
}
/** Writes a supported native image without changing any shared source image. */
export function writeImage(shape: Element, object: PresentationImageObject, scene: PresentationScene, context: PackageContext, part: string): void {
  const target = mediaTarget(object.assetId, scene, context)
  const relationshipId = addRelationship(context, part, target, 'image')
  const fill = ensure(shape, 'p:blipFill')
  const blip = ensure(fill, 'a:blip')
  blip.setAttributeNS(NS.r, 'r:embed', relationshipId)
  ensure(blip, 'a:alphaModFix').setAttribute('amt', String(Math.round(object.opacity * 100000)))
  if (object.crop) writeCrop(fill, object.crop)
  else removeCrop(fill)
  const stretch = ensure(fill, 'a:stretch')
  ensure(stretch, 'a:fillRect')
}
function writeCrop(fill: Element, crop: NonNullable<PresentationImageObject['crop']>): void {
  const source = ensure(fill, 'a:srcRect')
  fill.insertBefore(source, child(fill, 'stretch') ?? child(fill, 'tile') ?? null)
  for (const [key, attribute] of [['left', 'l'], ['top', 't'], ['right', 'r'], ['bottom', 'b']] as const) source.setAttribute(attribute, String(Math.round(crop[key] * 100000)))
}

function removeCrop(fill: Element): void {
  const crop = child(fill, 'srcRect')
  if (crop) fill.removeChild(crop)
}

function mediaTarget(assetId: string, scene: PresentationScene, context: PackageContext): string {
  context.imageTargets ??= new Map()
  const existing = context.imageTargets.get(assetId)
  if (existing) return existing
  const asset = scene.assets.find(image => image.id === assetId)
  if (!asset) throw Error('Отсутствует картинка презентации')
  const bytes = Buffer.from(asset.data, 'base64')
  if (!bytes.length || bytes.length > PRESENTATION_MAX_IMAGE_BYTES || imageMime(bytes) !== asset.mime) throw Error('Некорректная картинка презентации')
  const target = `ppt/media/dreamagent-${randomUUID()}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`
  context.entries.set(target, bytes)
  contentType(context, target, asset.mime)
  context.imageTargets.set(assetId, target)
  return target
}

import type { Element } from '@xmldom/xmldom'
import type { PresentationImage, PresentationImageObject, PresentationObjectBase } from '../shared/presentation.ts'
import { PRESENTATION_MAX_IMAGE_BYTES } from './constants.ts'
import { relationships } from './relationships.ts'
import { child, numeric, NS } from './xml.ts'
import type { ShapeContext } from './types.ts'

/** Detects supported inert raster assets by signature rather than filename. */
export function imageMime(bytes: Uint8Array): PresentationImage['mime'] | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  return undefined
}
/** Imports native raster data without evaluating any URL or SVG. */
export function readImage(shape: Element, context: ShapeContext, base: PresentationObjectBase, assets: PresentationImage[]): PresentationImageObject | undefined {
  const fill = child(shape, 'blipFill')
  const blip = child(fill, 'blip')
  const relationshipId = blip?.getAttributeNS(NS.r, 'embed')
  const target = relationships(context.package, context.part).find(relation => relation.id === relationshipId)?.target
  if (!target) return undefined
  const bytes = context.package.entries.get(target)
  if (!bytes) return undefined
  if (bytes.length > PRESENTATION_MAX_IMAGE_BYTES) throw Error('Превышен размер картинки PPTX')
  const mime = imageMime(bytes)
  if (!mime) return undefined
  const id = assetId(context, target, base.id, mime, bytes, assets)
  const crop = child(fill, 'srcRect')
  return {
    ...base, kind: 'image', assetId: id, opacity: numeric(child(blip, 'alphaModFix'), 'amt', 100000) / 100000,
    crop: crop ? { left: numeric(crop, 'l') / 100000, top: numeric(crop, 't') / 100000, right: numeric(crop, 'r') / 100000, bottom: numeric(crop, 'b') / 100000 } : undefined,
  }
}

function assetId(context: ShapeContext, target: string, objectId: string, mime: PresentationImage['mime'], bytes: Uint8Array, assets: PresentationImage[]): string {
  context.package.assetIds ??= new Map()
  const existing = context.package.assetIds.get(target)
  if (existing) return existing
  const id = `asset-${objectId}`
  assets.push({ id, mime, data: Buffer.from(bytes).toString('base64') })
  context.package.assetIds.set(target, id)
  return id
}

import type { Element } from '@xmldom/xmldom'
import type { PresentationBox } from '../shared/presentation.ts'
import { child, numeric } from './xml.ts'
import type { CoordinateSpace } from './types.ts'

/** Exact conversion between Office EMU and 96-DPI editor pixels. */
export const EMU_PER_PIXEL = 9525
/** The root coordinate system has no scaling or offset. */
export const ROOT_SPACE: CoordinateSpace = { scaleX: 1, scaleY: 1, originX: 0, originY: 0 }
/** Reads and normalizes a source transform into the parent editor coordinate system. */
export function readBox(transform: Element | undefined, space: CoordinateSpace): PresentationBox {
  const offset = child(transform, 'off')
  const extent = child(transform, 'ext')
  return {
    x: (numeric(offset, 'x') / EMU_PER_PIXEL - space.originX) * space.scaleX,
    y: (numeric(offset, 'y') / EMU_PER_PIXEL - space.originY) * space.scaleY,
    width: numeric(extent, 'cx') / EMU_PER_PIXEL * space.scaleX,
    height: numeric(extent, 'cy') / EMU_PER_PIXEL * space.scaleY,
    rotation: editorRotation(transform),
    flipX: ['1', 'true'].includes(transform?.getAttribute('flipH') ?? ''),
    flipY: ['1', 'true'].includes(transform?.getAttribute('flipV') ?? ''),
  }
}
/** Normalizes child coordinates while preserving the original group's source transform. */
export function groupSpace(transform: Element | undefined, parent: CoordinateSpace): CoordinateSpace {
  const extent = child(transform, 'ext')
  const childExtent = child(transform, 'chExt')
  const offset = child(transform, 'chOff')
  const width = numeric(childExtent, 'cx')
  const height = numeric(childExtent, 'cy')
  return {
    scaleX: parent.scaleX * (width ? numeric(extent, 'cx') / width : 1),
    scaleY: parent.scaleY * (height ? numeric(extent, 'cy') / height : 1),
    originX: numeric(offset, 'x') / EMU_PER_PIXEL,
    originY: numeric(offset, 'y') / EMU_PER_PIXEL,
  }
}
/** A rotated leaf in a nonuniform parent may require shear unavailable in the SDK. */
export function hasShear(box: PresentationBox, space: CoordinateSpace): boolean {
  return Math.abs(space.scaleX - space.scaleY) > 1e-8 && Math.abs(Math.sin(box.rotation * Math.PI / 90)) > 1e-8
}
/** Converts center-pivot Office lines to the SDK's origin-pivot line representation. */
export function lineBox(box: PresentationBox, inverse = false): PresentationBox {
  const radians = box.rotation * Math.PI / 180
  const dx = box.width / 2 - Math.cos(radians) * box.width / 2 + Math.sin(radians) * box.height / 2
  const dy = box.height / 2 - Math.sin(radians) * box.width / 2 - Math.cos(radians) * box.height / 2
  const sign = inverse ? -1 : 1
  return { ...box, x: box.x + sign * dx * (box.flipX ? -1 : 1), y: box.y + sign * dy * (box.flipY ? -1 : 1) }
}

function editorRotation(transform: Element | undefined): number {
  const flipX = ['1', 'true'].includes(transform?.getAttribute('flipH') ?? '')
  const flipY = ['1', 'true'].includes(transform?.getAttribute('flipV') ?? '')
  return numeric(transform, 'rot') / 60000 * (flipX === flipY ? 1 : -1)
}

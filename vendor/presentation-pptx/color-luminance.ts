import type { PresentationColor } from '../shared/presentation.ts'

type Hsl = { hue: number; saturation: number; luminance: number }
function toHsl(color: PresentationColor): Hsl {
  const channels = [color.r, color.g, color.b]
  const maximum = Math.max(...channels), minimum = Math.min(...channels)
  const delta = maximum - minimum, luminance = (maximum + minimum) / 2
  if (delta === 0) return { hue: 0, saturation: 0, luminance }
  const sector = [(color.g - color.b) / delta, (color.b - color.r) / delta + 2, (color.r - color.g) / delta + 4][channels.indexOf(maximum)]!
  return { hue: ((sector * 60 % 360) + 360) % 360, saturation: delta / (1 - Math.abs(2 * luminance - 1)), luminance }
}
function fromHsl(hsl: Hsl, alpha: number): PresentationColor {
  const chroma = (1 - Math.abs(2 * hsl.luminance - 1)) * hsl.saturation
  const sector = hsl.hue / 60
  const secondary = chroma * (1 - Math.abs(sector % 2 - 1))
  const channels = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary], [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]][Math.floor(sector)]!
  const offset = hsl.luminance - chroma / 2
  return { r: channels[0]! + offset, g: channels[1]! + offset, b: channels[2]! + offset, a: alpha }
}
/** Changes DrawingML luminance independently of hue and saturation. */
export function changeLuminance(color: PresentationColor, change: (value: number) => number): PresentationColor {
  const hsl = toHsl(color)
  hsl.luminance = Math.max(0, Math.min(1, change(hsl.luminance)))
  return fromHsl(hsl, color.a)
}

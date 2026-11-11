<script setup lang="ts">
import { computed, useId } from "vue";
import type {
  PresentationObject,
  PresentationImage,
  PresentationColor,
  PresentationText,
  PresentationTextStyle,
  PresentationParagraph,
  PresentationTableCell,
  PresentationShape,
} from "../../../vendor/shared/presentation";
const props = defineProps<{
  object: PresentationObject;
  assets: PresentationImage[];
}>();
const gradientId = useId();
function shapeFill(shape: PresentationShape) {
  return shape.gradient ? `url(#${gradientId})` : color(shape.fill);
}
const tableRows = computed(() => {
  if (props.object.kind !== "table") return [];
  const rows = props.object.rows.map((height) => ({
    height,
    cells: [] as PresentationTableCell[],
  }));
  for (const cell of props.object.cells) rows[cell.row]?.cells.push(cell);
  return rows;
});
const color = (c?: PresentationColor | null) =>
  c
    ? `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a})`
    : "none";
function transform(o: PresentationObject) {
  const b = o.box;
  return `rotate(${b.rotation || 0} ${b.x + b.width / 2} ${b.y + b.height / 2})`;
}
function assetUrl(o: PresentationObject) {
  const asset = o.kind === "image" ? assetsFor(o.assetId) : undefined;
  return asset ? `data:${asset.mime};base64,${asset.data}` : undefined;
}
function assetsFor(id: string) {
  return props.assets.find((a) => a.id === id);
}
function textStyle(o: any) {
  const t = o.text;
  return {
    ...runStyle(t.defaultStyle),
    padding: `${t.insets.top}px ${t.insets.right}px ${t.insets.bottom}px ${t.insets.left}px`,
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent:
      t.verticalAlign === "center"
        ? "center"
        : t.verticalAlign === "bottom"
          ? "flex-end"
          : "flex-start",
  };
}
function runStyle(style: PresentationTextStyle) {
  return {
    fontFamily: `${JSON.stringify(style.fontFamily || "Arial")}, Arial, sans-serif`,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? "italic" : "normal",
    color: color(style.color),
    textDecoration:
      [style.underline && "underline", style.strike && "line-through"]
        .filter(Boolean)
        .join(" ") || "none",
  };
}
function paragraphRuns(
  text: PresentationText,
  paragraph: PresentationParagraph,
) {
  const end = paragraph.start + paragraph.length;
  const pieces: {
    start: number;
    value: string;
    style: PresentationTextStyle;
  }[] = [];
  let cursor = paragraph.start;
  const add = (start: number, finish: number, style: PresentationTextStyle) => {
    if (finish > start)
      pieces.push({ start, value: text.content.slice(start, finish), style });
  };
  for (const run of text.runs) {
    const start = Math.max(cursor, run.start);
    const finish = Math.min(end, run.start + run.length);
    if (finish <= start) continue;
    add(cursor, start, text.defaultStyle);
    add(start, finish, run);
    cursor = finish;
  }
  add(cursor, end, text.defaultStyle);
  return pieces;
}
function unsupportedName(label: string) {
  return (
    (
      {
        shape: "Фигура",
        table: "Таблица",
        chart: "Диаграмма",
        smartArt: "SmartArt",
        media: "Медиа",
        equation: "Формула",
      } as Record<string, string>
    )[label] || "Объект"
  );
}
function cellStyle(cell: PresentationTableCell) {
  const border = (side: keyof PresentationTableCell["borders"]) => {
    const line = cell.borders[side];
    return line ? `${line.width}px solid ${color(line.color)}` : "none";
  };
  const { insets } = cell.text;
  return {
    ...runStyle(cell.text.defaultStyle),
    padding: `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`,
    verticalAlign:
      cell.text.verticalAlign === "center" ? "middle" : cell.text.verticalAlign,
    background: cell.fill ? color(cell.fill) : "transparent",
    borderLeft: border("left"),
    borderRight: border("right"),
    borderTop: border("top"),
    borderBottom: border("bottom"),
  };
}
</script>
<template>
  <g :transform="transform(object)"
    ><template v-if="object.kind === 'group'"
      ><SlideObject
        v-for="child in object.objects"
        :key="child.id"
        :object="child"
        :assets="assets" /></template
    ><template v-else-if="object.kind === 'shape'"
      ><defs v-if="object.gradient">
        <radialGradient :id="gradientId">
          <stop v-for="(stop, i) in object.gradient.stops" :key="i" :offset="stop.offset"
            :stop-color="color({ ...stop.color, a: 1 })" :stop-opacity="stop.color.a" />
        </radialGradient>
      </defs><g v-if="object.paths" :transform="`translate(${object.box.x} ${object.box.y})`">
        <path v-for="(path, i) in object.paths" :key="i" :d="path.d"
          :fill="path.fill ? shapeFill(object) : 'none'"
          :stroke="path.stroke ? color(object.stroke?.color) : 'none'" :stroke-width="object.stroke?.width || 0" />
      </g><ellipse
        v-else-if="object.shape === 'ellipse'"
        :cx="object.box.x + object.box.width / 2"
        :cy="object.box.y + object.box.height / 2"
        :rx="object.box.width / 2"
        :ry="object.box.height / 2"
        :fill="shapeFill(object)"
        :stroke="color(object.stroke?.color)"
        :stroke-width="object.stroke?.width || 0" /><line
        v-else-if="object.shape === 'line'"
        :x1="object.box.x"
        :y1="object.box.y"
        :x2="object.box.x + object.box.width"
        :y2="object.box.y + object.box.height"
        :stroke="color(object.stroke?.color)"
        :stroke-width="object.stroke?.width || 1" /><rect
        v-else
        :x="object.box.x"
        :y="object.box.y"
        :width="object.box.width"
        :height="object.box.height"
        :rx="object.cornerRadius"
        :fill="shapeFill(object)"
        :stroke="color(object.stroke?.color)"
        :stroke-width="object.stroke?.width || 0" /></template
    ><foreignObject
      v-if="object.kind === 'table'"
      :x="object.box.x"
      :y="object.box.y"
      :width="object.box.width"
      :height="object.box.height"
      ><table
        xmlns="http://www.w3.org/1999/xhtml"
        class="slide-native-table"
        :style="{
          width: `${object.box.width}px`,
          height: `${object.box.height}px`,
        }"
      >
        <colgroup>
          <col
            v-for="(width, i) in object.columns"
            :key="i"
            :style="{ width: `${width}px` }"
          />
        </colgroup>
        <tbody>
          <tr
            v-for="(row, i) in tableRows"
            :key="i"
            :style="{ height: `${row.height}px` }"
          >
            <td
              v-for="cell in row.cells"
              :key="cell.column"
              :rowspan="cell.rowSpan"
              :colspan="cell.columnSpan"
              :style="cellStyle(cell)"
            >
              <div
                v-for="(p, i) in cell.text.paragraphs"
                :key="i"
                :style="{ textAlign: p.align }"
              >
                <span
                  v-for="run in paragraphRuns(cell.text, p)"
                  :key="run.start"
                  :style="runStyle(run.style)"
                  >{{ run.value }}</span
                ><br v-if="!p.length" />
              </div>
            </td>
          </tr>
        </tbody></table></foreignObject
    ><image
      v-if="object.kind === 'image'"
      :x="object.box.x"
      :y="object.box.y"
      :width="object.box.width"
      :height="object.box.height"
      :opacity="object.opacity"
      preserveAspectRatio="xMidYMid slice"
      :href="assetUrl(object)"
    /><foreignObject
      v-if="(object.kind === 'text' || object.kind === 'shape') && object.text"
      :x="object.box.x"
      :y="object.box.y"
      :width="object.box.width"
      :height="object.box.height"
      ><div
        xmlns="http://www.w3.org/1999/xhtml"
        class="slide-text-object"
        :style="textStyle(object)"
      >
        <div
          v-for="(p, i) in object.text.paragraphs"
          :key="i"
          :style="{ textAlign: p.align }"
        >
          <span
            v-for="run in paragraphRuns(object.text, p)"
            :key="run.start"
            :style="runStyle(run.style)"
            >{{ run.value }}</span
          ><br v-if="!p.length" />
        </div></div></foreignObject
    ><g v-if="object.kind === 'unsupported'"
      ><title>{{ unsupportedName(object.label) }}: пока не поддерживается</title
      ><rect
        :x="object.box.x"
        :y="object.box.y"
        :width="object.box.width"
        :height="object.box.height"
        fill="#fafafa"
        stroke="#a1a1aa"
        stroke-dasharray="4 4"
      /><text
        v-if="object.box.width >= 100 && object.box.height >= 24"
        :x="object.box.x + 6"
        :y="object.box.y + 18"
        font-size="12"
        fill="#71717a"
        >{{ unsupportedName(object.label) }}</text
      ></g
    ></g
  >
</template>
<style scoped>
.slide-native-table {
  table-layout: fixed;
  border-collapse: collapse;
  border-spacing: 0;
  margin: 0;
  border: 0;
  background: transparent;
  color: black;
}
.slide-native-table tr {
  background: transparent;
}
.slide-native-table td {
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  line-height: 1.2;
  letter-spacing: normal;
}
</style>

<script setup lang="ts">
import type {
  PresentationObject,
  PresentationImage,
  PresentationColor,
} from "../../../vendor/shared/presentation";
const props = defineProps<{
  object: PresentationObject;
  assets: PresentationImage[];
}>();
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
    fontFamily: t.defaultStyle.fontFamily || "sans-serif",
    fontSize: t.defaultStyle.fontSize + "px",
    fontWeight: t.defaultStyle.fontWeight,
    fontStyle: t.defaultStyle.italic ? "italic" : "normal",
    color: color(t.defaultStyle.color),
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
      ><ellipse
        v-if="object.shape === 'ellipse'"
        :cx="object.box.x + object.box.width / 2"
        :cy="object.box.y + object.box.height / 2"
        :rx="object.box.width / 2"
        :ry="object.box.height / 2"
        :fill="color(object.fill)"
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
        :fill="color(object.fill)"
        :stroke="color(object.stroke?.color)"
        :stroke-width="object.stroke?.width || 0" /></template
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
          {{ object.text.content.slice(p.start, p.start + p.length) }}
        </div>
      </div></foreignObject
    ><g v-if="object.kind === 'unsupported'"
      ><rect
        :x="object.box.x"
        :y="object.box.y"
        :width="object.box.width"
        :height="object.box.height"
        fill="#fafafa"
        stroke="#a1a1aa"
        stroke-dasharray="4 4"
      /><text
        :x="object.box.x + 6"
        :y="object.box.y + 18"
        font-size="12"
        fill="#71717a"
        >{{ object.label }}</text
      ></g
    ></g
  >
</template>

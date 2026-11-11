import sanitizeHtml from "sanitize-html";

export function cleanIconSvg(value: string) {
  // Icons are inert vector shapes: no scripts, HTML, stylesheets, hrefs or
  // external paint servers. Preserve SVG attribute casing such as viewBox.
  const svg = sanitizeHtml(value, {
    allowedTags: [
      "svg",
      "g",
      "path",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "defs",
      "linearGradient",
      "radialGradient",
      "stop",
      "clipPath",
      "mask",
      "title",
      "desc",
    ],
    allowedAttributes: {
      "*": [
        "id",
        "xmlns",
        "viewBox",
        "width",
        "height",
        "x",
        "y",
        "x1",
        "x2",
        "y1",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "d",
        "points",
        "fill",
        "fill-rule",
        "fill-opacity",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-opacity",
        "opacity",
        "transform",
        "gradientTransform",
        "gradientUnits",
        "offset",
        "stop-color",
        "stop-opacity",
        "clip-path",
        "clip-rule",
        "mask",
      ],
    },
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    transformTags: {
      "*": (tagName, attribs) => ({
        tagName,
        attribs: Object.fromEntries(
          Object.entries(attribs).filter(
            ([, value]) =>
              !/[\\\u0000-\u001f]/.test(value) &&
              (!/url\s*\(/i.test(value) ||
                /^url\(#[a-z0-9_-]+\)$/i.test(value)),
          ),
        ),
      }),
    },
  }).trim();
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>"))
    throw new Error("Источник не предоставил корректную SVG-иконку");
  return Buffer.from(svg);
}

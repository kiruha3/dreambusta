import { NodeEntry, Text, Range } from "slate";
import type { CustomText } from "./types";

// Jinja pattern types
type JinjaType = "variable" | "tag" | "comment";

interface JinjaMatch {
  start: number;
  end: number;
  type: JinjaType;
}

// Regex patterns for Jinja syntax
const JINJA_PATTERNS: { pattern: RegExp; type: JinjaType }[] = [
  { pattern: /\{\{.*?\}\}/g, type: "variable" },  // {{ variable }}
  { pattern: /\{%.*?%\}/g, type: "tag" },         // {% if/for/etc %}
  { pattern: /\{#.*?#\}/g, type: "comment" },     // {# comment #}
];

function findJinjaMatches(text: string): JinjaMatch[] {
  const matches: JinjaMatch[] = [];

  for (const { pattern, type } of JINJA_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
      });
    }
  }

  // Sort by start position
  return matches.sort((a, b) => a.start - b.start);
}

export function createJinjaDecorator(enabled: boolean) {
  return function jinjaDecorator([node, path]: NodeEntry): Range[] {
    if (!enabled || !Text.isText(node)) {
      return [];
    }

    const text = node as CustomText;
    const ranges: Range[] = [];
    const matches = findJinjaMatches(text.text);

    for (const match of matches) {
      ranges.push({
        anchor: { path, offset: match.start },
        focus: { path, offset: match.end },
        isJinjaVariable: true,
        jinjaType: match.type,
      } as Range & { isJinjaVariable: boolean; jinjaType: JinjaType });
    }

    return ranges;
  };
}

export function extractJinjaVariables(text: string): string[] {
  const variables: string[] = [];
  const pattern = /\{\{\s*([\w.]+)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    variables.push(match[1]);
  }

  return [...new Set(variables)];
}


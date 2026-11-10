import React from "react";
import { Transforms } from "slate";
import { IMAGE_DRAG_TYPE } from "./imageDrag";
import { ImageControls } from "./ImageControls";
import { RenderElementProps, useSelected, useFocused, useSlateStatic, useReadOnly, ReactEditor } from "slate-react";
import type {
  ParagraphElement,
  HeadingOneElement,
  HeadingTwoElement,
  HeadingThreeElement,
  TableElement,
  TableRowElement,
  TableCellElement,
  ImageElement,
  ListItemElement,
  BulletedListElement,
  NumberedListElement,
  BlockQuoteElement,
  CodeBlockElement,
  DividerElement,
} from "./types";
import { useDiffStatusForUid } from "./DiffBlockContext";
import type { DiffStatus } from "./withDiffDecorations";

/**
 * Стили блочной diff-подсветки в режиме сравнения версий.
 *
 * Применяются через React Context (DiffBlockContext) к блочным
 * компонентам — НЕ через мутацию Slate-нод. Структура документа
 * остаётся чистой, можно безопасно выходить из режима сравнения
 * заменой value у Provider.
 *
 * Для таблиц: статус строки/целой ячейки даёт фон на td (не на tr —
 * border-collapse ломает фон tr). useDocumentDiff проставляет status
 * на row.uid И на всех её cell.uid одновременно, чтобы фон рисовался
 * на ячейках, а data-diff-status на tr остался для prev/next-навигации.
 */
const DIFF_BLOCK_STYLES: Record<DiffStatus, React.CSSProperties> = {
  added: {
    backgroundColor: "rgba(34, 197, 94, 0.10)",
    boxShadow: "inset 3px 0 0 rgba(34, 197, 94, 0.6)",
  },
  removed: {
    backgroundColor: "rgba(239, 68, 68, 0.10)",
    boxShadow: "inset 3px 0 0 rgba(239, 68, 68, 0.6)",
    opacity: 0.7,
  },
  changed: {
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    boxShadow: "inset 3px 0 0 rgba(251, 191, 36, 0.6)",
  },
  moved: {
    boxShadow: "inset 3px 0 0 rgba(168, 85, 247, 0.7)",
  },
};

function diffBlockStyle(status: DiffStatus | undefined): React.CSSProperties | undefined {
  return status ? DIFF_BLOCK_STYLES[status] : undefined;
}

// Цвет outline'а вокруг самого <img> при diff (фон/inset-бар к картинке
// применяются плохо — нужен явный контур). Совпадает с палитрой
// DIFF_BLOCK_STYLES (BUG-DOC-02).
const DIFF_IMG_OUTLINE: Record<DiffStatus, string> = {
  added: "rgba(34, 197, 94, 0.9)",
  removed: "rgba(239, 68, 68, 0.9)",
  changed: "rgba(251, 191, 36, 0.9)",
  moved: "rgba(168, 85, 247, 0.9)",
};

/**
 * Comparator для React.memo блочных компонентов.
 *
 * RenderElementProps: `element`, `attributes`, `children`. `attributes` Slate
 * генерит свежим объектом каждый рендер родителя — Object.is-сравнение в
 * default-memo не помогает. Сравниваем то, что реально влияет на вывод:
 * `element` (тот же ref, если Slate не пересоздавал ноду) и `children` (тот же
 * react-element для того же поддерева).
 *
 * useContext НЕ ломается этим memo: React триггерит ре-рендер consumer'а на
 * смену Context value напрямую, обходя comparator. Это важно для
 * `useDiffStatusForUid` — переключение в comparison-mode перерисует все
 * consumer'ы, даже если их element/children не менялись.
 */
function memoBlockEqual<P extends { element: unknown; children: unknown }>(prev: P, next: P): boolean {
  return prev.element === next.element && prev.children === next.children;
}

/**
 * Render Slate element based on type
 */
export function renderElement(props: RenderElementProps) {
  const { element, attributes, children } = props;

  switch (element.type) {
    case "paragraph":
      return <ParagraphComponent {...props} element={element} />;
    case "heading-one":
      return <HeadingOneComponent {...props} element={element} />;
    case "heading-two":
      return <HeadingTwoComponent {...props} element={element} />;
    case "heading-three":
      return <HeadingThreeComponent {...props} element={element} />;
    case "table":
      return <TableComponent {...props} element={element} />;
    case "table-row":
      return <TableRowComponent {...props} element={element} />;
    case "table-cell":
      return <TableCellComponent {...props} element={element} />;
    case "image":
      return <ImageComponent {...props} element={element} />;
    case "list-item":
      return <ListItemComponent {...props} element={element} />;
    case "bulleted-list":
      return <BulletedListComponent {...props} element={element} />;
    case "numbered-list":
      return <NumberedListComponent {...props} element={element} />;
    case "block-quote":
      return <BlockQuoteComponent {...props} element={element} />;
    case "code-block":
      return <CodeBlockComponent {...props} element={element} />;
    case "divider":
      return <DividerComponent {...props} element={element} />;
    default:
      return <p {...attributes}>{children}</p>;
  }
}

// Paragraph component
interface ParagraphProps extends RenderElementProps {
  element: ParagraphElement;
}

const ParagraphComponent = React.memo(({ attributes, children, element }: ParagraphProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  const style: React.CSSProperties = {
    textAlign: element.align || "left",
    marginTop: element.spacing?.before ? `${element.spacing.before}px` : undefined,
    marginBottom: element.spacing?.after ? `${element.spacing.after}px` : undefined,
    paddingLeft: element.indentLeft ? `${element.indentLeft}px` : undefined,
    paddingRight: element.indentRight ? `${element.indentRight}px` : undefined,
    textIndent: element.indentFirstLine ? `${element.indentFirstLine}px` : undefined,
    width: "100%",
    boxSizing: "border-box",
    display: "block",
    ...diffStyle,
  };

  return (
    <p {...attributes} style={style} data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}>
      {children}
    </p>
  );
}, memoBlockEqual);

// Table component
interface TableProps extends RenderElementProps {
  element: TableElement;
}

const TableComponent = React.memo(({ attributes, children, element }: TableProps) => {
  const wrapperStyle: React.CSSProperties = {
    overflowX: "auto",
    maxWidth: "100%",
    marginTop: "12px",
    marginBottom: "12px",
  };

  const tableStyle: React.CSSProperties = {
    borderCollapse: "collapse",
    width: element.tableWidth ? `${element.tableWidth}px` : "100%",
    tableLayout: "fixed",
    backgroundColor: "var(--card)",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
  };

  // Generate colgroup for column widths
  const colGroup = element.colWidths?.length ? (
    <colgroup>
      {element.colWidths.map((width, i) => (
        <col key={i} style={{ width: width ? `${width}px` : "auto" }} />
      ))}
    </colgroup>
  ) : null;

  return (
    <div style={wrapperStyle}>
      <table {...attributes} style={tableStyle} data-element-uid={element.uid}>
        {colGroup}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
});
// memoBlockEqual намеренно НЕ применяем к Table: layout-измерение table может
// зависеть от свежего ref в attributes, кастом-сравнение element/children может
// заблокировать пересборку <colgroup>.

// Table row component
interface TableRowProps extends RenderElementProps {
  element: TableRowElement;
}

const TableRowComponent = React.memo(({ attributes, children, element }: TableRowProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const style: React.CSSProperties = {
    height: element.height ? `${element.height}px` : undefined,
  };

  // Фон строки рисуется на td (см. DIFF_BLOCK_STYLES комментарий) —
  // здесь только data-attribute для prev/next-навигации и Playwright.
  return <tr {...attributes} style={style} data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}>{children}</tr>;
}, memoBlockEqual);

// Table cell component
interface TableCellProps extends RenderElementProps {
  element: TableCellElement;
}

const TableCellComponent = React.memo(({ attributes, children, element }: TableCellProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  // Build border styles - use CSS variable for default color
  const defaultBorderColor = "var(--border)";
  const getBorderStyle = (border?: { style: string; width: number; color: string }) => {
    if (!border) return `1px solid ${defaultBorderColor}`;
    const style = border.style === "single" || border.style === "thick" ? "solid"
      : border.style === "dashed" ? "dashed"
      : border.style === "dotted" ? "dotted"
      : border.style === "double" ? "double"
      : border.style === "nil" || border.style === "none" ? "none"
      : "solid";
    return `${border.width}px ${style} ${border.color}`;
  };

  // Default padding like Word
  const defaultPadding = { top: 4, bottom: 4, left: 6, right: 6 };
  const padding = element.padding || defaultPadding;

  // Если ячейка имеет diff-статус, фон-цвет diff'а перекрывает element.backgroundColor.
  // Это сознательно: подсветка изменения в режиме сравнения важнее декоративного фона.
  const baseBackground = element.backgroundColor || "transparent";

  const style: React.CSSProperties = {
    // Borders
    borderTop: getBorderStyle(element.borders?.top),
    borderBottom: getBorderStyle(element.borders?.bottom),
    borderLeft: getBorderStyle(element.borders?.left),
    borderRight: getBorderStyle(element.borders?.right),
    // Default border if no borders specified
    ...(element.borders ? {} : { border: `1px solid ${defaultBorderColor}` }),
    // Padding
    paddingTop: `${padding.top ?? 4}px`,
    paddingBottom: `${padding.bottom ?? 4}px`,
    paddingLeft: `${padding.left ?? 6}px`,
    paddingRight: `${padding.right ?? 6}px`,
    // Vertical alignment
    verticalAlign: element.vAlign || "top",
    // Background
    backgroundColor: baseBackground,
    // Size
    width: element.widthPercent ? `${element.widthPercent}%`
      : element.width ? `${element.width}px`
      : undefined,
    minWidth: "20px",
    // Text
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // Diff highlight (фон/inset border) — спред в самом конце, чтобы перекрыть baseBackground
    ...diffStyle,
  };

  return (
    <td
      {...attributes}
      style={style}
      colSpan={element.colSpan}
      rowSpan={element.rowSpan}
      data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}
    >
      {children}
    </td>
  );
}, memoBlockEqual);

// Image component - simplified
interface ImageProps extends RenderElementProps {
  element: ImageElement;
}

const ImageComponent = React.memo(({ attributes, children, element }: ImageProps) => {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => {
    if (!editing) return;
    const dismiss = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-element-uid]")?.getAttribute("data-element-uid") !== element.uid) setEditing(false);
    };
    document.addEventListener("mousedown", dismiss, true);
    return () => document.removeEventListener("mousedown", dismiss, true);
  }, [editing, element.uid]);
  const selected = useSelected();
  const focused = useFocused();
  // Изображение — такой же блок с uid, как paragraph/list, и diff-движок
  // помечает его статус (см. nodeUtils surrogate `[image:<src>]`). Раньше
  // ImageComponent игнорировал diff — картинки в сравнении версий не
  // маркировались (BUG-DOC-02).
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  // Outline вокруг <img>: приоритет у выделения (синий), иначе diff-цвет.
  const imgOutline = selected && focused
    ? "2px solid #3b82f6"
    : diffStatus
      ? `2px solid ${DIFF_IMG_OUTLINE[diffStatus]}`
      : "none";

  return (
    <div
      {...attributes}
      contentEditable={false}
      onFocusCapture={() => setEditing(true)}
      data-element-uid={element.uid}
      data-diff-status={diffStatus ?? undefined}
    >
      <div style={{
        display: "flex",
        justifyContent: element.align === "center" ? "center"
          : element.align === "right" ? "flex-end"
          : "flex-start",
        margin: "8px 0",
        ...diffStyle,
      }}>
        <img
          src={element.src}
          alt={element.alt || "Image"}
          width={element.width}
          height={element.height}
          style={{
            display: "block",
            maxWidth: "100%",
            outline: imgOutline,
            borderRadius: "4px",
          }}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={event => {
            if (readOnly || (event.key !== "Delete" && event.key !== "Backspace")) return;
            event.preventDefault();
            event.stopPropagation();
            Transforms.removeNodes(editor, { at: ReactEditor.findPath(editor, element) });
            ReactEditor.focus(editor);
          }}
          draggable={!readOnly}
          onClick={event => {
            if (readOnly) return;
            event.preventDefault();
            event.stopPropagation();
            Transforms.select(editor, ReactEditor.findPath(editor, element));
            event.currentTarget.focus();
            setEditing(true);
          }}
          onDragStart={event => {
            if (readOnly) return;
            Transforms.select(editor, ReactEditor.findPath(editor, element));
            event.stopPropagation();
            event.dataTransfer.setData(IMAGE_DRAG_TYPE, element.uid || "");
            event.dataTransfer.effectAllowed = "move";
            ReactEditor.setFragmentData(editor, event.dataTransfer, "drag");
          }}
        />
      </div>
      {!readOnly && (selected || editing) && <ImageControls element={element} />}
      {children}
    </div>
  );
});
// memoBlockEqual НЕ применяем к Image: void-element с useSelected/useFocused —
// custom-сравнение по element/children заблокирует обновление селекта/фокуса
// и потенциально потеряет свежий attributes.ref для DOM-измерения.

// List item component
interface ListItemProps extends RenderElementProps {
  element: ListItemElement;
}

const ListItemComponent = React.memo(({ attributes, children, element }: ListItemProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  const style: React.CSSProperties = {
    marginLeft: `${(element.level + 1) * 24}px`,
    listStyleType: element.listType === "numbered" ? "decimal" : "disc",
    display: "list-item",
    ...diffStyle,
  };

  return (
    <li {...attributes} style={style} data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}>
      {children}
    </li>
  );
}, memoBlockEqual);

// Heading components
interface HeadingOneProps extends RenderElementProps {
  element: HeadingOneElement;
}

const HeadingOneComponent = React.memo(({ attributes, children, element }: HeadingOneProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  const style: React.CSSProperties = {
    textAlign: element.align || "left",
    fontSize: "2em",
    fontWeight: "bold",
    marginTop: "0.67em",
    marginBottom: "0.67em",
    ...diffStyle,
  };

  return (
    <h1 {...attributes} style={style} data-type="heading-one" data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}>
      {children}
    </h1>
  );
}, memoBlockEqual);

interface HeadingTwoProps extends RenderElementProps {
  element: HeadingTwoElement;
}

const HeadingTwoComponent = React.memo(({ attributes, children, element }: HeadingTwoProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  const style: React.CSSProperties = {
    textAlign: element.align || "left",
    fontSize: "1.5em",
    fontWeight: "bold",
    marginTop: "0.83em",
    marginBottom: "0.83em",
    ...diffStyle,
  };

  return (
    <h2 {...attributes} style={style} data-type="heading-two" data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}>
      {children}
    </h2>
  );
}, memoBlockEqual);

interface HeadingThreeProps extends RenderElementProps {
  element: HeadingThreeElement;
}

const HeadingThreeComponent = React.memo(({ attributes, children, element }: HeadingThreeProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  const style: React.CSSProperties = {
    textAlign: element.align || "left",
    fontSize: "1.17em",
    fontWeight: "bold",
    marginTop: "1em",
    marginBottom: "1em",
    ...diffStyle,
  };

  return (
    <h3 {...attributes} style={style} data-type="heading-three" data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}>
      {children}
    </h3>
  );
}, memoBlockEqual);

// List container components
interface BulletedListProps extends RenderElementProps {
  element: BulletedListElement;
}

const BulletedListComponent = React.memo(({ attributes, children, element }: BulletedListProps) => {
  return (
    <ul {...attributes} style={{ paddingLeft: "24px", listStyleType: "disc" }} data-element-uid={element.uid}>
      {children}
    </ul>
  );
}, memoBlockEqual);

interface NumberedListProps extends RenderElementProps {
  element: NumberedListElement;
}

const NumberedListComponent = React.memo(({ attributes, children, element }: NumberedListProps) => {
  return (
    <ol {...attributes} style={{ paddingLeft: "24px", listStyleType: "decimal" }} data-element-uid={element.uid}>
      {children}
    </ol>
  );
}, memoBlockEqual);

// Block quote component
interface BlockQuoteProps extends RenderElementProps {
  element: BlockQuoteElement;
}

const BlockQuoteComponent = React.memo(({ attributes, children, element }: BlockQuoteProps) => {
  const diffStatus = useDiffStatusForUid(element.uid);
  const diffStyle = diffBlockStyle(diffStatus);

  const style: React.CSSProperties = {
    textAlign: element.align || "left",
    borderLeft: "3px solid var(--border, #e5e7eb)",
    paddingLeft: "16px",
    marginLeft: 0,
    marginRight: 0,
    fontStyle: "italic",
    color: "var(--muted-foreground, #6b7280)",
    ...diffStyle,
  };

  return (
    <blockquote {...attributes} style={style} data-type="block-quote" data-element-uid={element.uid} data-diff-status={diffStatus ?? undefined}>
      {children}
    </blockquote>
  );
}, memoBlockEqual);

// Code block component
interface CodeBlockProps extends RenderElementProps {
  element: CodeBlockElement;
}

const CodeBlockComponent = React.memo(({ attributes, children }: CodeBlockProps) => {
  const style: React.CSSProperties = {
    backgroundColor: "var(--muted, #f3f4f6)",
    borderRadius: "4px",
    padding: "16px",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.9em",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
  };

  return (
    <pre {...attributes} style={style} data-type="code-block">
      <code>{children}</code>
    </pre>
  );
}, memoBlockEqual);

// Divider component
interface DividerProps extends RenderElementProps {
  element: DividerElement;
}

const DividerComponent = React.memo(({ attributes, children }: DividerProps) => {
  return (
    <div {...attributes} contentEditable={false}>
      <hr style={{
        border: "none",
        borderTop: "1px solid var(--border, #e5e7eb)",
        margin: "24px 0"
      }} />
      {children}
    </div>
  );
});
// memoBlockEqual НЕ применяем к Divider: void-element, attributes.ref критичен.

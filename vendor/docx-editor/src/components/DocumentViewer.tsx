// Document viewer component that renders laid out pages

import React, { useRef, useEffect } from 'react';
import type { Page, PageConfig, LaidOutRegion, LaidOutParagraph, TextLine, ParagraphElement, TableCellElement } from '../layout/types';

interface DocumentViewerProps {
  pages: Page[];
  pageConfig: PageConfig;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ pages, pageConfig }) => {
  return (
    <div 
      contentEditable
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        gap: '20px',
        padding: '20px',
        backgroundColor: '#f5f5f5'
      }}
    >
      {pages.map((page) => (
        <PageView key={page.pageNumber} page={page} pageConfig={pageConfig} />
      ))}
    </div>
  );
};

interface PageViewProps {
  page: Page;
  pageConfig: PageConfig;
}

const PageView: React.FC<PageViewProps> = ({ page, pageConfig }) => {
  const pageRef = useRef<HTMLDivElement>(null);
  
  const pageStyle: React.CSSProperties = {
    width: `${pageConfig.width}px`,
    height: `${pageConfig.height}px`,
    backgroundColor: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    position: 'relative',
    padding: `${pageConfig.margins.top}px ${pageConfig.margins.right}px ${pageConfig.margins.bottom}px ${pageConfig.margins.left}px`,
    boxSizing: 'border-box',
    color: 'black',
  };

  useEffect(() => {
    if (!pageRef.current) return;

    const container = pageRef.current;
    
    // Clear existing native content
    const existingNative = container.querySelectorAll('[data-native-region]');
    existingNative.forEach(el => el.remove());

    // Render flow content as native elements
    page.flowContent.forEach((region) => {
      const nativeElement = renderRegionToNativeElement(region);
      if (nativeElement) {
        container.appendChild(nativeElement);
      }
    });

    // Render float content as native elements
    page.floatContent.forEach((region) => {
      const nativeElement = renderRegionToNativeElement(region);
      if (nativeElement) {
        container.appendChild(nativeElement);
      }
    });
  }, [page]);

  return (
    <div ref={pageRef} style={pageStyle}>
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        fontSize: '12px', 
        color: '#999' 
      }}>
        Page {page.pageNumber}
      </div>
    </div>
  );
};

// Render region to native HTML element (bypasses React)
function renderRegionToNativeElement(region: LaidOutRegion): HTMLElement | null {
  const container = document.createElement('div');
  container.setAttribute('data-native-region', 'true');
  container.setAttribute('data-region-id', region.element.id);
  container.setAttribute('contenteditable', 'true');
  
  container.style.position = 'absolute';
  container.style.left = `${region.x}px`;
  container.style.top = `${region.y}px`;
  container.style.width = `${region.width}px`;
  container.style.height = `${region.height}px`;

  // Render based on element type
  switch (region.element.type) {
    case 'paragraph':
      renderParagraphToNative(container, region);
      break;
    case 'table':
      renderTableToNative(container, region);
      break;
    case 'image':
      renderImageToNative(container, region);
      break;
    default:
      // Generic region - render children
      if (region.children) {
        region.children.forEach((child) => {
          const childElement = renderRegionToNativeElement(child);
          if (childElement) {
            container.appendChild(childElement);
          }
        });
      }
      break;
  }

  return container;
}

function renderParagraphToNative(container: HTMLElement, region: LaidOutRegion): void {
  const paragraph = region.element as ParagraphElement;
  const laidOutParagraph = region.elementData as LaidOutParagraph | undefined;
  
  if (!laidOutParagraph || !laidOutParagraph.lines) {
    return;
  }

  laidOutParagraph.lines.forEach((line: TextLine) => {
    const lineDiv = document.createElement('div');
    lineDiv.style.position = 'absolute';
    lineDiv.style.left = `${line.x}px`;
    lineDiv.style.top = `${line.y}px`;
    lineDiv.style.width = `${line.width}px`;
    lineDiv.style.height = `${line.height}px`;
    lineDiv.style.lineHeight = `${line.height}px`;
    lineDiv.style.textAlign = paragraph.props.alignment || 'left';
    lineDiv.style.whiteSpace = 'pre-wrap';

    line.parts.forEach((part) => {
      const span = document.createElement('span');
      span.style.position = 'absolute';
      span.style.left = `${part.x}px`;
      span.style.width = `${part.width}px`;
      span.style.fontFamily = part.font.family;
      span.style.fontSize = `${part.font.size}px`;
      span.style.fontWeight = part.font.weight;
      span.style.fontStyle = part.font.style;
      span.setAttribute('title', `Text Element ID: ${part.el?.id}`);
      // span.textContent = part.text;
      
      part.words.forEach((word) => {
        const wordSpan = document.createElement('span');
        wordSpan.style.position = 'absolute';
        wordSpan.style.left = `${word.x}px`;
        wordSpan.style.width = `${word.width}px`;
        wordSpan.style.fontFamily = word.font.family;
        wordSpan.style.fontSize = `${word.font.size}px`;
        wordSpan.style.fontWeight = word.font.weight;
        wordSpan.style.fontStyle = word.font.style;
        wordSpan.setAttribute('title', `Text Element ID: ${word.el.id}`);
        wordSpan.textContent = word.text;
        span.appendChild(wordSpan);
      });

      lineDiv.appendChild(span);
    });

    container.appendChild(lineDiv);
  });
}

function renderTableToNative(container: HTMLElement, region: LaidOutRegion): void {
  // Table container styling
  container.style.borderTop = '1px solid #333';
  container.style.borderLeft = '1px solid #333';
  container.style.borderCollapse = 'collapse';
  container.style.backgroundColor = 'transparent';
  container.style.overflow = 'visible';

  // Render rows (children of table region are row regions)
  if (region.children) {
    region.children.forEach((rowRegion) => {
      if (rowRegion.element.type === 'table-row') {
        renderTableRowToNative(container, rowRegion);
      }
    });
  }
}

function renderTableRowToNative(tableContainer: HTMLElement, rowRegion: LaidOutRegion): void {
  
  // Row container
  const rowDiv = document.createElement('div');
  rowDiv.style.position = 'absolute';
  rowDiv.style.left = `${rowRegion.x}px`;
  rowDiv.style.top = `${rowRegion.y}px`;
  rowDiv.style.width = `${rowRegion.width}px`;
  rowDiv.style.height = `${rowRegion.height}px`;
  rowDiv.style.display = 'block';
  rowDiv.style.overflow = 'visible';

  // Render cells (children of row region are cell regions)
  if (rowRegion.children) {
    rowRegion.children.forEach((cellRegion) => {
      if (cellRegion.element.type === 'table-cell') {
        renderTableCellToNative(rowDiv, cellRegion);
      }
    });
  }

  tableContainer.appendChild(rowDiv);
}

function renderTableCellToNative(rowContainer: HTMLElement, cellRegion: LaidOutRegion): void {
  const cellDiv = document.createElement('div');
  cellDiv.style.position = 'absolute';
  cellDiv.style.left = `${cellRegion.x}px`;
  cellDiv.style.top = `${cellRegion.y}px`;
  cellDiv.style.width = `${cellRegion.width}px`;
  cellDiv.style.height = `${cellRegion.height}px`;
  cellDiv.style.borderRight = '1px solid #333';
  cellDiv.style.borderBottom = '1px solid #333';
  cellDiv.style.padding = '4px';
  cellDiv.style.verticalAlign = 'top';
  cellDiv.style.boxSizing = 'border-box';
  cellDiv.style.backgroundColor = 'white';
  cellDiv.style.overflow = 'visible';
  cellDiv.style.wordWrap = 'break-word';

  // Render cell content
  if (cellRegion.children && cellRegion.children.length > 0) {
    cellRegion.children.forEach((contentRegion) => {
      const contentElement = renderRegionToNativeElement(contentRegion);
      if (contentElement) {
        cellDiv.appendChild(contentElement);
      }
    });
  } 
  
  // If cell is empty, add a non-breaking space to maintain height
  if (!cellDiv.hasChildNodes()) {
    cellDiv.innerHTML = '&nbsp;';
  }

  rowContainer.appendChild(cellDiv);
}

function renderImageToNative(container: HTMLElement, region: LaidOutRegion): void {
  container.style.border = '1px solid #ccc';
  container.style.backgroundColor = '#f0f0f0';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.fontSize = '12px';
  container.style.color = '#666';
  
  const textNode = document.createTextNode(`Image: ${region.element.id}`);
  container.appendChild(textNode);

  if (region.children) {
    region.children.forEach((child) => {
      const childElement = renderRegionToNativeElement(child);
      if (childElement) {
        container.appendChild(childElement);
      }
    });
  }
}


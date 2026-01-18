import type {
  Scene,
  Element,
  DataItem,
  Color,
  Font,
  ElementStyle,
  RenderResult
} from './types';

/**
 * Main function to render a scene to HTML and CSS
 */
export function renderScene(scene: Scene): RenderResult {
  const { data, template, theme } = scene;

  // Build lookup maps for quick access
  const dataItemMap = new Map<string, DataItem>();
  data.data_items.forEach(item => dataItemMap.set(item.id, item));

  const colorMap = new Map<string, Color>();
  theme.color_palette.forEach(color => colorMap.set(color.id, color));

  const fontMap = new Map<string, Font>();
  theme.font_palette.forEach(font => fontMap.set(font.font_id, font));

  // Generate CSS
  const css = generateCSS(theme, template, fontMap, colorMap);

  // Generate HTML
  const html = generateHTML(template, dataItemMap, scene);

  return { html, css };
}

/**
 * Generate CSS styles for the scene
 */
function generateCSS(
  theme: any,
  template: any,
  fontMap: Map<string, Font>,
  colorMap: Map<string, Color>
): string {
  let css = '';

  // Add font imports
  const fontImports = theme.font_palette.map((font: Font) =>
    `@import url('${font.font_url}');`
  ).join('\n');

  css += fontImports + '\n\n';

  // Add root container styles
  css += `.scene-container {
  width: ${template.canvas.width}px;
  height: ${template.canvas.height}px;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}\n\n`;

  // Add universal box-sizing
  css += `.scene-container * {
  box-sizing: border-box;
}\n\n`;

  // Generate styles for each element
  const elements = template.elements;
  elements.forEach((element: Element) => {
    css += generateElementCSS(element, fontMap, colorMap);
  });

  return css;
}

/**
 * Generate CSS for a single element and its children
 */
function generateElementCSS(
  element: Element,
  fontMap: Map<string, Font>,
  colorMap: Map<string, Color>,
  prefix: string = ''
): string {
  let css = '';
  const className = prefix ? `${prefix}-${element.element_id}` : element.element_id;

  if (element.style) {
    const styles = convertStyleToCSS(element.style, fontMap, colorMap);
    if (styles) {
      css += `.${className} {\n${styles}}\n\n`;
    }
  }

  // Process children recursively
  if (element.children) {
    element.children.forEach(child => {
      css += generateElementCSS(child, fontMap, colorMap, className);
    });
  }

  return css;
}

/**
 * Convert element style object to CSS string
 */
function convertStyleToCSS(
  style: ElementStyle,
  fontMap: Map<string, Font>,
  colorMap: Map<string, Color>
): string {
  let css = '';

  // Check if this is a full-size background element (100% width and height)
  const isFullSize = style.width === '100%' && style.height === '100%';
  // Check if position is explicitly set
  const hasExplicitPosition = style.position !== undefined;

  if (isFullSize && !hasExplicitPosition) {
    // This is a background element - position it absolutely behind everything
    css += `  position: absolute;\n`;
    css += `  top: 0;\n`;
    css += `  left: 0;\n`;
    css += `  z-index: 0;\n`;
  } else if (!hasExplicitPosition) {
    // All other elements without explicit position should stack above the background
    css += `  position: relative;\n`;
    css += `  z-index: 1;\n`;
  }

  // Convert each style property
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;

    let cssProperty = key.replace(/_/g, '-');
    let cssValue = value;

    // Handle special cases
    if (key === 'font' && fontMap.has(value)) {
      const font = fontMap.get(value)!;
      css += `  font-family: '${font.font_name}', serif;\n`;
      continue;
    }

    // Convert 'fill' to 'background-color' for HTML elements (fill is for SVG)
    if (key === 'fill') {
      cssProperty = 'background-color';
    }

    if ((key === 'color' || key === 'fill' || key === 'background_color' || key === 'border_color') && colorMap.has(value)) {
      const color = colorMap.get(value)!;
      cssValue = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    }

    css += `  ${cssProperty}: ${cssValue};\n`;
  }

  return css;
}

/**
 * Generate HTML for the scene
 */
function generateHTML(
  template: any,
  dataItemMap: Map<string, DataItem>,
  scene: Scene
): string {
  let html = '<div class="scene-container">\n';

  template.elements.forEach((element: Element) => {
    html += generateElementHTML(element, dataItemMap, scene, 1);
  });

  html += '</div>';

  return html;
}

/**
 * Generate HTML for a single element
 */
function generateElementHTML(
  element: Element,
  dataItemMap: Map<string, DataItem>,
  scene: Scene,
  indentLevel: number,
  parentPrefix: string = ''
): string {
  const indent = '  '.repeat(indentLevel);
  const className = parentPrefix ? `${parentPrefix}-${element.element_id}` : element.element_id;
  let html = '';

  switch (element.element_type) {
    case 'data_item':
      html += generateDataItemHTML(element, dataItemMap, className, indent);
      break;

    case 'shape':
      html += generateShapeHTML(element, className, indent, scene);
      break;

    case 'container':
      html += generateContainerHTML(element, dataItemMap, scene, className, indent, indentLevel);
      break;

    case 'image':
      html += generateImageHTML(element, className, indent);
      break;

    case 'svg':
      html += generateSVGHTML(element, className, indent);
      break;

    default:
      console.warn(`Unknown element type: ${element.element_type}`);
  }

  return html;
}

/**
 * Generate HTML for a data item element
 */
function generateDataItemHTML(
  element: Element,
  dataItemMap: Map<string, DataItem>,
  className: string,
  indent: string
): string {
  if (!element.data_item_id) return '';

  const dataItem = dataItemMap.get(element.data_item_id);
  if (!dataItem) {
    console.warn(`Data item not found: ${element.data_item_id}`);
    return '';
  }

  if (dataItem.type === 'text') {
    return `${indent}<div class="${className}">${dataItem.content || ''}</div>\n`;
  } else if (dataItem.type === 'image') {
    return `${indent}<img class="${className}" src="${dataItem.image_url || ''}" alt="${dataItem.display_name}" />\n`;
  }

  return '';
}

/**
 * Generate HTML for a shape element using CSS
 */
function generateShapeHTML(
  element: Element,
  className: string,
  indent: string,
  scene: Scene
): string {
  // Shapes are rendered as divs with CSS styling
  return `${indent}<div class="${className}"></div>\n`;
}

/**
 * Generate HTML for a container element
 */
function generateContainerHTML(
  element: Element,
  dataItemMap: Map<string, DataItem>,
  scene: Scene,
  className: string,
  indent: string,
  indentLevel: number
): string {
  let html = `${indent}<div class="${className}">\n`;

  if (element.children) {
    element.children.forEach(child => {
      html += generateElementHTML(child, dataItemMap, scene, indentLevel + 1, className);
    });
  }

  html += `${indent}</div>\n`;
  return html;
}

/**
 * Generate HTML for a non-data image element
 */
function generateImageHTML(
  element: Element,
  className: string,
  indent: string
): string {
  return `${indent}<img class="${className}" src="${element.image_url || ''}" alt="" />\n`;
}

/**
 * Generate HTML for an SVG element
 */
function generateSVGHTML(
  element: Element,
  className: string,
  indent: string
): string {
  return `${indent}<div class="${className}">${element.svg_content || ''}</div>\n`;
}

import { Theme, Element, Template } from './types';
import { ExecutionContext, ValidationError } from './operation-types';

/**
 * Generate a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Convert hex color to RGBA object
 */
export function hexToRGBA(hex: string): { r: number; g: number; b: number; a: number } {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  let r: number, g: number, b: number, a: number = 1;

  if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else if (hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else {
    throw new ValidationError(`Invalid hex color: ${hex}`);
  }

  return { r, g, b, a };
}

/**
 * Ensure a color exists in the theme palette, adding it if necessary
 * Returns the color ID
 */
export function ensureColorInTheme(theme: Theme, color: string): string {
  // Check if color is already in palette by hex value
  const rgba = hexToRGBA(color);

  const existingColor = theme.color_palette.find(
    c => c.r === rgba.r && c.g === rgba.g && c.b === rgba.b && c.a === rgba.a
  );

  if (existingColor) {
    return existingColor.id;
  }

  // Check palette limit
  if (theme.color_palette.length >= 16) {
    throw new ValidationError('Color palette limit reached (max 16 colors)');
  }

  // Add new color to palette
  const colorId = generateId('color');
  const colorName = `color_${theme.color_palette.length + 1}`;

  theme.color_palette.push({
    id: colorId,
    name: colorName,
    r: rgba.r,
    g: rgba.g,
    b: rgba.b,
    a: rgba.a
  });

  return colorId;
}

/**
 * Cache for Google Fonts availability checks
 */
const googleFontCache = new Map<string, boolean>();

/**
 * Check if a font is available on Google Fonts by making a HEAD request.
 * Results are cached to avoid repeated network calls.
 */
export async function isGoogleFont(fontName: string): Promise<boolean> {
  const key = fontName.toLowerCase();
  if (googleFontCache.has(key)) {
    return googleFontCache.get(key)!;
  }

  const formattedName = fontName.replace(/\s+/g, '+');
  const url = `https://fonts.googleapis.com/css2?family=${formattedName}:wght@400;700&display=swap`;

  try {
    const response = await fetch(url, { method: 'HEAD' });
    const available = response.ok;
    googleFontCache.set(key, available);
    return available;
  } catch {
    googleFontCache.set(key, false);
    return false;
  }
}

/**
 * Ensure a font exists in the theme palette, adding it if necessary
 * Returns the font ID
 */
export async function ensureFontInTheme(theme: Theme, fontName: string): Promise<string> {
  // Check if font is already in palette
  const existingFont = theme.font_palette.find(
    f => f.font_name.toLowerCase() === fontName.toLowerCase()
  );

  if (existingFont) {
    return existingFont.font_id;
  }

  // Check palette limit
  if (theme.font_palette.length >= 8) {
    throw new ValidationError('Font palette limit reached (max 8 fonts)');
  }

  // Add new font to palette
  const fontId = generateId('font');
  const fontUrl = await getFontUrl(fontName);

  theme.font_palette.push({
    font_id: fontId,
    font_name: fontName,
    font_url: fontUrl
  });

  return fontId;
}

/**
 * Get font URL — returns Google Fonts URL if available, otherwise local file path
 */
export async function getFontUrl(fontName: string): Promise<string> {
  if (await isGoogleFont(fontName)) {
    const formattedName = fontName.replace(/\s+/g, '+');
    return `https://fonts.googleapis.com/css2?family=${formattedName}:wght@400;700&display=swap`;
  }
  return `fonts/${fontName}.otf`;
}

/**
 * Recursively find an element by ID in the element tree
 */
export function findElement(elements: Element[], elementId: string): Element | null {
  for (const element of elements) {
    if (element.element_id === elementId) {
      return element;
    }

    if (element.element_type === 'container' && element.children) {
      const found = findElement(element.children, elementId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Recursively remove an element from the template
 * Returns the removed element or null if not found
 */
export function removeElementFromTemplate(template: Template, elementId: string): Element | null {
  return removeElementFromArray(template.elements, elementId);
}

function removeElementFromArray(elements: Element[], elementId: string): Element | null {
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].element_id === elementId) {
      const removed = elements[i];
      elements.splice(i, 1);
      return removed;
    }

    if (elements[i].element_type === 'container' && elements[i].children) {
      const found = removeElementFromArray(elements[i].children!, elementId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Resolve parameter placeholders like $output_of_step_N
 */
export function resolveParameters(params: any, context: ExecutionContext): any {
  if (typeof params === 'string') {
    // Check for placeholder pattern: $output_of_step_N
    const match = params.match(/^\$output_of_step_(\d+)$/);
    if (match) {
      const stepNum = parseInt(match[1], 10);
      const output = context.operationOutputs.get(stepNum);

      if (output === undefined) {
        throw new ValidationError(`No output found for step ${stepNum}`);
      }

      return output;
    }

    return params;
  }

  if (Array.isArray(params)) {
    return params.map(item => resolveParameters(item, context));
  }

  if (typeof params === 'object' && params !== null) {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      resolved[key] = resolveParameters(value, context);
    }
    return resolved;
  }

  return params;
}

/**
 * Add an element to a container
 */
export function addElementToContainer(template: Template, elementId: string, containerId: string): void {
  // Find and remove element from its current location
  const element = removeElementFromTemplate(template, elementId);
  if (!element) {
    throw new ValidationError(`Element not found: ${elementId}`);
  }

  // Find container
  const container = findElement(template.elements, containerId);
  if (!container) {
    throw new ValidationError(`Container not found: ${containerId}`);
  }

  if (container.element_type !== 'container') {
    throw new ValidationError(`Element ${containerId} is not a container`);
  }

  // Add element to container's children
  if (!container.children) {
    container.children = [];
  }

  container.children.push(element);
}

/**
 * Calculate absolute position from anchor point
 */
export function calculateAnchorPosition(
  anchor: string,
  canvasWidth: number,
  canvasHeight: number,
  elementWidth: number,
  elementHeight: number,
  offsetX: number = 0,
  offsetY: number = 0
): { x: number; y: number } {
  let x = 0;
  let y = 0;

  // Parse anchor point
  switch (anchor.toLowerCase()) {
    case 'center':
      x = (canvasWidth - elementWidth) / 2;
      y = (canvasHeight - elementHeight) / 2;
      break;
    case 'top-left':
      x = 0;
      y = 0;
      break;
    case 'top-center':
      x = (canvasWidth - elementWidth) / 2;
      y = 0;
      break;
    case 'top-right':
      x = canvasWidth - elementWidth;
      y = 0;
      break;
    case 'center-left':
      x = 0;
      y = (canvasHeight - elementHeight) / 2;
      break;
    case 'center-right':
      x = canvasWidth - elementWidth;
      y = (canvasHeight - elementHeight) / 2;
      break;
    case 'bottom-left':
      x = 0;
      y = canvasHeight - elementHeight;
      break;
    case 'bottom-center':
      x = (canvasWidth - elementWidth) / 2;
      y = canvasHeight - elementHeight;
      break;
    case 'bottom-right':
      x = canvasWidth - elementWidth;
      y = canvasHeight - elementHeight;
      break;
    default:
      throw new ValidationError(`Unknown anchor point: ${anchor}`);
  }

  return {
    x: x + offsetX,
    y: y + offsetY
  };
}

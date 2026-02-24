import * as fs from 'fs';
import * as path from 'path';
import { SceneData, Template, Theme, Element, ElementStyle, DataItem, Color, Font, Scene } from './types';
import { renderScene } from './renderer';
import { isGoogleFont } from './scene-builder';

// ============================================================================
// CONSTANTS
// ============================================================================

const DPI = 300;
const MM_TO_PX = DPI / 25.4;   // ~11.811 px/mm (print resolution for layout)
const PT_TO_PX = 300 / 72;      // ~4.167 px/pt (1pt = 1/72 inch at 300 DPI)

const DEFAULT_CANVAS_WIDTH_PX = 1240;
const DEFAULT_CANVAS_HEIGHT_PX = 1748;

// ============================================================================
// TYPES
// ============================================================================

interface TextEntry {
  text: string;
  fontName: string;
  fontSize: number;       // in pt (from input)
  xMm: number;
  yMm: number;
  alignment: string;      // "centered", "left", "right"
  angle?: number;         // rotation in degrees
  color: string;          // hex color e.g. "#4B6DAA"
  letterSpacing: number;  // canva tracking units (divide by 1000 for em)
  lineSpacing: number;    // CSS line-height value
}

interface ParsedScene {
  sourceUrl?: string;
  canvasWidthPx: number;
  canvasHeightPx: number;
  textEntries: TextEntry[];
}

// ============================================================================
// PARSING
// ============================================================================

/**
 * Parse the input file format into structured data.
 *
 * Expected format:
 *   <optional canva URL line>
 *   <blank line>
 *   Text -
 *   <text> - <FontName> <size>, x <x> mm, y <y> mm, <alignment>[, <angle> angle][, color #hex][, letter-spacing <n>][, line-spacing <n>]
 *   ...
 *
 * Text can contain literal \n for line breaks.
 * Multi-line text is supported by placing continuation lines before the definition line.
 */
function parseInputFile(content: string): ParsedScene {
  const lines = content.split('\n');

  let sourceUrl: string | undefined;
  const textEntries: TextEntry[] = [];

  // Matches: <text> - <FontName> <size>, <properties...>
  const defRegex = /^(.+?)\s*-\s*(\w+)\s+([\d.]+),\s*(.+)$/;

  let pendingTextLines: string[] = [];
  let inTextSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines before text section
    if (!inTextSection) {
      if (trimmed.startsWith('http')) {
        sourceUrl = trimmed;
        continue;
      }
      if (trimmed === 'Text -' || trimmed === 'Text-' || trimmed.toLowerCase() === 'text -') {
        inTextSection = true;
        continue;
      }
      continue;
    }

    // In text section - try to match a definition line
    const match = trimmed.match(defRegex);

    if (match) {
      const lineText = match[1].trim();
      const fontName = match[2].trim();
      const fontSize = parseFloat(match[3]);
      const propsStr = match[4];

      // Combine pending text lines with this line's text portion
      let fullText: string;
      if (pendingTextLines.length > 0) {
        fullText = [...pendingTextLines, lineText].join('\n');
      } else {
        fullText = lineText;
      }
      // Support literal \n in text for line breaks
      fullText = fullText.replace(/\\n/g, '\n');

      // Parse properties from the remaining string
      const xMatch = propsStr.match(/x\s+([\d.]+)\s*mm/);
      const yMatch = propsStr.match(/y\s+([\d.]+)\s*mm/);
      const xMm = xMatch ? parseFloat(xMatch[1]) : 0;
      const yMm = yMatch ? parseFloat(yMatch[1]) : 0;

      const alignment = propsStr.includes('centered') ? 'centered'
        : propsStr.includes('right') ? 'right' : 'left';

      const angleMatch = propsStr.match(/([-\d.]+)\s*angle/);
      const angle = angleMatch ? parseFloat(angleMatch[1]) : undefined;

      const colorMatch = propsStr.match(/color\s+(#[0-9A-Fa-f]+)/);
      const color = colorMatch ? colorMatch[1] : '#000000';

      // Letter-spacing: canva tracking units (no "mm" suffix) or mm values (ignored)
      const lsMatch = propsStr.match(/letter-spacing\s+([\d.]+)(?:\s*mm)?/);
      const lsHasMm = lsMatch ? /letter-spacing\s+[\d.]+\s*mm/.test(propsStr) : false;
      const letterSpacing = lsMatch && !lsHasMm ? parseFloat(lsMatch[1]) : 0;

      const lineSpacingMatch = propsStr.match(/line-spacing\s+([\d.]+)/);
      const lineSpacing = lineSpacingMatch ? parseFloat(lineSpacingMatch[1]) : 1.2;

      textEntries.push({
        text: fullText,
        fontName,
        fontSize,
        xMm,
        yMm,
        alignment,
        angle,
        color,
        letterSpacing,
        lineSpacing,
      });

      pendingTextLines = [];
    } else if (trimmed.length > 0) {
      // Non-definition line — accumulate as part of multi-line text
      pendingTextLines.push(trimmed);
    }
  }

  if (pendingTextLines.length > 0) {
    console.warn(`Warning: ${pendingTextLines.length} trailing text line(s) without a definition:`);
    pendingTextLines.forEach(l => console.warn(`  "${l}"`));
  }

  return {
    sourceUrl,
    canvasWidthPx: DEFAULT_CANVAS_WIDTH_PX,
    canvasHeightPx: DEFAULT_CANVAS_HEIGHT_PX,
    textEntries
  };
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX);
}

function ptToPx(pt: number): number {
  return Math.round(pt * PT_TO_PX * 10) / 10; // one decimal place
}

async function getFontUrl(fontName: string): Promise<string> {
  if (await isGoogleFont(fontName)) {
    const encoded = fontName.replace(/\s+/g, '+');
    return `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`;
  }
  return `fonts/${fontName}.otf`;
}

function sanitizeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ============================================================================
// FONT METRICS — cap-height Y correction
// ============================================================================

// CSS `top` positions the line-box top, but Canva's Y refers to visible text
// top (cap-height). The offset between them depends on font metrics + line-height.
// offset = halfLeading + (ascent - capHeight) * fontSize
//   where halfLeading = (lineHeight - ascent - descent) * fontSize / 2

interface FontMetrics {
  ascent: number;     // sTypoAscender / unitsPerEm
  descent: number;    // abs(sTypoDescender) / unitsPerEm (positive)
  capHeight: number;  // sCapHeight / unitsPerEm
}

const FONT_METRICS: Record<string, FontMetrics> = {
  arial:      { ascent: 1854 / 2048, descent: 434 / 2048, capHeight: 1467 / 2048 },
  montserrat: { ascent: 1006 / 1000, descent: 194 / 1000, capHeight: 700 / 1000 },
  _default:   { ascent: 0.9,         descent: 0.2,        capHeight: 0.71 },
};

function getFontMetrics(fontName: string): FontMetrics {
  return FONT_METRICS[fontName.toLowerCase()] || FONT_METRICS._default;
}

/** Pixel offset from CSS line-box top to visible cap-height top. */
function capHeightOffsetPx(fontName: string, fontSizePx: number, lineHeight: number): number {
  const m = getFontMetrics(fontName);
  const halfLeading = (lineHeight - m.ascent - m.descent) * fontSizePx / 2;
  return halfLeading + (m.ascent - m.capHeight) * fontSizePx;
}

/** Convert canva letter-spacing tracking units to CSS em. */
function letterSpacingToEm(canvaValue: number): number {
  return Math.round((canvaValue / 1000) * 1000) / 1000;
}

/** Parse hex color string to r,g,b components. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

// ============================================================================
// SCENE GENERATION
// ============================================================================

async function generateScene(
  parsed: ParsedScene,
  sceneId: string,
  sceneName: string
): Promise<{ data: SceneData; template: Template; theme: Theme }> {

  // ---- Collect unique fonts ----
  const fontSet = new Map<string, Font>();
  for (const entry of parsed.textEntries) {
    const fontId = `font_${sanitizeId(entry.fontName)}`;
    if (!fontSet.has(fontId)) {
      fontSet.set(fontId, {
        font_id: fontId,
        font_name: entry.fontName,
        font_url: await getFontUrl(entry.fontName)
      });
    }
  }

  // ---- Collect unique colors ----
  const colorSet = new Map<string, Color>();
  for (const entry of parsed.textEntries) {
    const hex = entry.color.toLowerCase();
    const colorId = `color_${hex.replace('#', '')}`;
    if (!colorSet.has(colorId)) {
      const { r, g, b } = hexToRgb(hex);
      colorSet.set(colorId, { id: colorId, name: hex, r, g, b, a: 1.0 });
    }
  }
  // Always include a default black
  if (!colorSet.has('color_000000')) {
    colorSet.set('color_000000', { id: 'color_000000', name: 'Black', r: 0, g: 0, b: 0, a: 1.0 });
  }

  // ---- Build theme ----
  const theme: Theme = {
    theme_id: `${sceneId}_theme`,
    theme_name: `${sceneName} Theme`,
    color_palette: Array.from(colorSet.values()),
    font_palette: Array.from(fontSet.values())
  };

  // ---- Build data items ----
  const dataItems: DataItem[] = [];
  const elements: Element[] = [];

  // Background image data item
  const bgDataItem: DataItem = {
    id: 'background_image',
    type: 'image',
    display_name: 'Background Image',
    image_url: 'bg.png'
  };
  dataItems.push(bgDataItem);

  // Background element (covers entire canvas)
  const bgElement: Element = {
    element_id: 'background_element',
    element_type: 'data_item',
    data_item_id: 'background_image',
    style: {
      width: '100%',
      height: '100%',
      object_fit: 'cover'
    }
  };
  elements.push(bgElement);

  // ---- Build text entries ----
  for (let i = 0; i < parsed.textEntries.length; i++) {
    const entry = parsed.textEntries[i];
    const idx = i + 1;

    // Data item — convert \n to <br> for HTML rendering
    const dataItemId = `text_${idx}`;
    const htmlContent = entry.text.replace(/\n/g, '<br>');
    const dataItem: DataItem = {
      id: dataItemId,
      type: 'text',
      display_name: entry.text.replace(/\n/g, ' ').length > 40
        ? entry.text.replace(/\n/g, ' ').substring(0, 40) + '...'
        : entry.text.replace(/\n/g, ' '),
      content: htmlContent
    };
    dataItems.push(dataItem);

    // Convert positions with cap-height Y correction
    const xPx = mmToPx(entry.xMm);
    const fontSizePx = ptToPx(entry.fontSize);
    const yOffsetPx = capHeightOffsetPx(entry.fontName, fontSizePx, entry.lineSpacing);
    const yPx = Math.round((mmToPx(entry.yMm) - yOffsetPx) * 10) / 10;

    const fontId = `font_${sanitizeId(entry.fontName)}`;
    const colorId = `color_${entry.color.replace('#', '').toLowerCase()}`;

    // Build element style
    const style: ElementStyle = {
      position: 'absolute',
      font: fontId,
      font_size: `${fontSizePx}px`,
      color: colorId,
      line_height: `${entry.lineSpacing}`,
      letter_spacing: `${letterSpacingToEm(entry.letterSpacing)}em`,
    };

    // Horizontal positioning
    if (entry.alignment === 'centered') {
      style.left = '50%';
      style.text_align = 'center';
      style.top = `${yPx}px`;

      const transforms: string[] = ['translateX(-50%)'];
      if (entry.angle !== undefined && entry.angle !== 0) {
        transforms.push(`rotate(${entry.angle}deg)`);
      }
      style.transform = transforms.join(' ');
    } else {
      style.left = `${xPx}px`;
      style.top = `${yPx}px`;
      style.text_align = entry.alignment === 'right' ? 'right' : 'left';

      if (entry.angle !== undefined && entry.angle !== 0) {
        style.transform = `rotate(${entry.angle}deg)`;
      }
    }

    const element: Element = {
      element_id: `text_${idx}_element`,
      element_type: 'data_item',
      data_item_id: dataItemId,
      style
    };
    elements.push(element);
  }

  // ---- Build template ----
  const template: Template = {
    template_id: `${sceneId}_template`,
    template_name: `${sceneName} Template`,
    canvas: {
      width: parsed.canvasWidthPx,
      height: parsed.canvasHeightPx
    },
    elements
  };

  // ---- Build data ----
  const data: SceneData = {
    scene_id: sceneId,
    data_items: dataItems
  };

  return { data, template, theme };
}

// ============================================================================
// FILE OUTPUT
// ============================================================================

async function saveScene(
  outputDir: string,
  sceneId: string,
  data: SceneData,
  template: Template,
  theme: Theme
): Promise<string[]> {
  const sceneDir = path.join(outputDir, sceneId);

  if (!fs.existsSync(sceneDir)) {
    fs.mkdirSync(sceneDir, { recursive: true });
  }

  const files: string[] = [];

  // Save data.json
  const dataPath = path.join(sceneDir, 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  files.push(dataPath);

  // Save template.json
  const templatePath = path.join(sceneDir, 'template.json');
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
  files.push(templatePath);

  // Save theme.json
  const themePath = path.join(sceneDir, 'theme.json');
  fs.writeFileSync(themePath, JSON.stringify(theme, null, 2));
  files.push(themePath);

  // Save scene.json (metadata)
  const sceneMetadata = {
    id: sceneId,
    name: data.scene_id,
    data: dataPath,
    template: templatePath,
    theme: themePath
  };
  const scenePath = path.join(sceneDir, 'scene.json');
  fs.writeFileSync(scenePath, JSON.stringify(sceneMetadata, null, 2));
  files.push(scenePath);

  // Render preview HTML
  const scene: Scene = { data, template, theme };
  const { html, css } = renderScene(scene);

  const previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sceneId} - Preview</title>
  <style>
    body { margin: 0; display: flex; justify-content: center; padding: 40px; background: #e0e0e0; }
${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;

  const previewPath = path.join(sceneDir, 'preview.html');
  fs.writeFileSync(previewPath, previewHtml);
  files.push(previewPath);

  return files;
}

// ============================================================================
// VARIABLE EXTRACTION
// ============================================================================

function extractVariables(textEntries: TextEntry[]): string[] {
  const vars = new Set<string>();
  for (const entry of textEntries) {
    const matches = entry.text.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g);
    for (const m of matches) {
      vars.add(m[1]);
    }
  }
  return Array.from(vars);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: bun scene_generator.ts <input_file> [scene_id] [scene_name]');
    console.log('');
    console.log('Input file format:');
    console.log('  https://www.canva.com/design/...');
    console.log('');
    console.log('  Text -');
    console.log('  Please join us for a - Montserrat 7.4, x 19.57 mm, y 36.87 mm, centered');
    console.log("  $name's Birthday - Holiday 42, x 18.02 mm, y 47.27 mm, centered, -5.6 angle");
    console.log('');
    console.log('Output: scenes/<scene_id>/ with data.json, template.json, theme.json, scene.json, preview.html');
    process.exit(1);
  }

  const inputFile = args[0];
  const sceneId = args[1] || `scene_${Date.now()}`;
  const sceneName = args[2] || sceneId.replace(/[_-]/g, ' ');

  // Read input file
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');

  console.log('='.repeat(60));
  console.log('SCENE GENERATOR');
  console.log('='.repeat(60));

  // Parse
  const parsed = parseInputFile(content);

  console.log(`\nSource URL: ${parsed.sourceUrl || '(none)'}`);
  console.log(`Canvas: ${parsed.canvasWidthPx} x ${parsed.canvasHeightPx} px`);
  console.log(`Text entries: ${parsed.textEntries.length}`);

  // Show parsed entries
  for (const entry of parsed.textEntries) {
    const textPreview = entry.text.replace(/\n/g, ' ');
    const preview = textPreview.length > 50 ? textPreview.substring(0, 50) + '...' : textPreview;
    const fontSizePx = ptToPx(entry.fontSize);
    const yOffset = capHeightOffsetPx(entry.fontName, fontSizePx, entry.lineSpacing);
    const correctedY = Math.round((mmToPx(entry.yMm) - yOffset) * 10) / 10;
    console.log(`  - "${preview}"`);
    console.log(`    Font: ${entry.fontName} ${entry.fontSize}pt (${fontSizePx}px), color: ${entry.color}`);
    console.log(`    Position: x=${entry.xMm}mm (${mmToPx(entry.xMm)}px), y=${entry.yMm}mm (${mmToPx(entry.yMm)}px → ${correctedY}px corrected)`);
    console.log(`    Align: ${entry.alignment}${entry.angle ? `, angle: ${entry.angle}deg` : ''}`);
    console.log(`    Letter-spacing: ${entry.letterSpacing} → ${letterSpacingToEm(entry.letterSpacing)}em, line-height: ${entry.lineSpacing}`);
  }

  // Extract variables
  const variables = extractVariables(parsed.textEntries);
  if (variables.length > 0) {
    console.log(`\nVariables found: ${variables.map(v => '$' + v).join(', ')}`);
  }

  // Generate scene
  const { data, template, theme } = await generateScene(parsed, sceneId, sceneName);

  // Save
  const outputDir = path.join(process.cwd(), 'scenes');
  const files = await saveScene(outputDir, sceneId, data, template, theme);

  console.log('\nGenerated files:');
  for (const f of files) {
    console.log(`  ${f}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done!');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

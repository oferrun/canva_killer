import { renderScene } from './renderer';
import type { Scene } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate browser-compatible renderer code
 */
function generateBrowserRenderer(): string {
  // Read the TypeScript renderer source and convert to browser-compatible JS
  return `
    function renderScene(scene) {
      const { data, template, theme } = scene;

      const dataItemMap = new Map();
      data.data_items.forEach(item => dataItemMap.set(item.id, item));

      const colorMap = new Map();
      theme.color_palette.forEach(color => colorMap.set(color.id, color));

      const fontMap = new Map();
      theme.font_palette.forEach(font => fontMap.set(font.font_id, font));

      const css = generateCSS(theme, template, fontMap, colorMap);
      const html = generateHTML(template, dataItemMap, scene);

      return { html, css };
    }

    function generateCSS(theme, template, fontMap, colorMap) {
      let css = '';

      const fontImports = theme.font_palette.map(font =>
        \`@import url('\${font.font_url}');\`
      ).join('\\n');

      css += fontImports + '\\n\\n';

      css += \`.scene-container {
  width: \${template.canvas.width}px;
  height: \${template.canvas.height}px;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}\\n\\n\`;

      css += \`.scene-container * {
  box-sizing: border-box;
}\\n\\n\`;

      template.elements.forEach(element => {
        css += generateElementCSS(element, fontMap, colorMap);
      });

      return css;
    }

    function generateElementCSS(element, fontMap, colorMap, prefix = '') {
      let css = '';
      const className = prefix ? \`\${prefix}-\${element.element_id}\` : element.element_id;

      if (element.style) {
        const styles = convertStyleToCSS(element.style, fontMap, colorMap);
        if (styles) {
          css += \`.\${className} {\\n\${styles}}\\n\\n\`;
        }
      }

      if (element.children) {
        element.children.forEach(child => {
          css += generateElementCSS(child, fontMap, colorMap, className);
        });
      }

      return css;
    }

    function convertStyleToCSS(style, fontMap, colorMap, isBackgroundElement = false) {
      let css = '';

      const isFullSize = style.width === '100%' && style.height === '100%';

      if (isFullSize) {
        // This is a background element - position it absolutely
        css += '  position: absolute;\\n';
        css += '  top: 0;\\n';
        css += '  left: 0;\\n';
        css += '  z-index: 0;\\n';
      } else {
        // All other elements should stack above the background
        css += '  position: relative;\\n';
        css += '  z-index: 1;\\n';
      }

      for (const [key, value] of Object.entries(style)) {
        if (value === undefined) continue;

        let cssProperty = key.replace(/_/g, '-');
        let cssValue = value;

        if (key === 'font' && fontMap.has(value)) {
          const font = fontMap.get(value);
          css += \`  font-family: '\${font.font_name}', serif;\\n\`;
          continue;
        }

        if (key === 'fill') {
          cssProperty = 'background-color';
        }

        if ((key === 'color' || key === 'fill' || key === 'background_color' || key === 'border_color') && colorMap.has(value)) {
          const color = colorMap.get(value);
          cssValue = \`rgba(\${color.r}, \${color.g}, \${color.b}, \${color.a})\`;
        }

        css += \`  \${cssProperty}: \${cssValue};\\n\`;
      }

      return css;
    }

    function generateHTML(template, dataItemMap, scene) {
      let html = '<div class="scene-container">\\n';

      template.elements.forEach(element => {
        html += generateElementHTML(element, dataItemMap, scene, 1);
      });

      html += '</div>';
      return html;
    }

    function generateElementHTML(element, dataItemMap, scene, indentLevel, parentPrefix = '') {
      const indent = '  '.repeat(indentLevel);
      const className = parentPrefix ? \`\${parentPrefix}-\${element.element_id}\` : element.element_id;
      let html = '';

      switch (element.element_type) {
        case 'data_item':
          html += generateDataItemHTML(element, dataItemMap, className, indent);
          break;
        case 'shape':
          html += \`\${indent}<div class="\${className}"></div>\\n\`;
          break;
        case 'container':
          html += generateContainerHTML(element, dataItemMap, scene, className, indent, indentLevel);
          break;
        case 'image':
          html += \`\${indent}<img class="\${className}" src="\${element.image_url || ''}" alt="" />\\n\`;
          break;
        case 'svg':
          html += \`\${indent}<div class="\${className}">\${element.svg_content || ''}</div>\\n\`;
          break;
      }

      return html;
    }

    function generateDataItemHTML(element, dataItemMap, className, indent) {
      if (!element.data_item_id) return '';

      const dataItem = dataItemMap.get(element.data_item_id);
      if (!dataItem) return '';

      if (dataItem.type === 'text') {
        return \`\${indent}<div class="\${className}">\${dataItem.content || ''}</div>\\n\`;
      } else if (dataItem.type === 'image') {
        return \`\${indent}<img class="\${className}" src="\${dataItem.image_url || ''}" alt="\${dataItem.display_name}" />\\n\`;
      }

      return '';
    }

    function generateContainerHTML(element, dataItemMap, scene, className, indent, indentLevel) {
      let html = \`\${indent}<div class="\${className}">\\n\`;

      if (element.children) {
        element.children.forEach(child => {
          html += generateElementHTML(child, dataItemMap, scene, indentLevel + 1, className);
        });
      }

      html += \`\${indent}</div>\\n\`;
      return html;
    }
  `;
}

/**
 * Generate an interactive demo page with live editing
 */
function generateInteractiveDemo() {
  const rootDir = path.join(__dirname, '..');

  // Load the scene files
  const data = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'wedding-invitation-data.json'), 'utf-8')
  );

  const template = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'wedding-invitation-template.json'), 'utf-8')
  );

  const theme = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'wedding-invitation-theme.json'), 'utf-8')
  );

  const themeModern = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'wedding-invitation-theme-modern.json'), 'utf-8')
  );

  // Create the interactive HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Scene Editor</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      height: 100vh;
      overflow: hidden;
      background: #1e1e1e;
      color: #fff;
    }

    .editor-panel {
      width: 400px;
      background: #252526;
      border-right: 1px solid #3e3e42;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .editor-header {
      padding: 20px;
      background: #2d2d30;
      border-bottom: 1px solid #3e3e42;
    }

    .editor-header h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .theme-selector {
      margin-top: 12px;
    }

    .theme-selector label {
      display: block;
      font-size: 12px;
      color: #ccc;
      margin-bottom: 6px;
    }

    .theme-selector select {
      width: 100%;
      padding: 8px;
      background: #3c3c3c;
      border: 1px solid #555;
      color: #fff;
      border-radius: 4px;
      font-size: 14px;
    }

    .editor-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .data-item {
      margin-bottom: 24px;
      padding: 16px;
      background: #2d2d30;
      border-radius: 6px;
      border: 1px solid #3e3e42;
    }

    .data-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .data-item-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
    }

    .data-item-type {
      font-size: 11px;
      padding: 3px 8px;
      background: #0e639c;
      border-radius: 3px;
      color: #fff;
    }

    .data-item label {
      display: block;
      font-size: 12px;
      color: #ccc;
      margin-bottom: 6px;
    }

    .data-item input,
    .data-item textarea {
      width: 100%;
      padding: 8px 10px;
      background: #3c3c3c;
      border: 1px solid #555;
      border-radius: 4px;
      color: #fff;
      font-size: 13px;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .data-item input:focus,
    .data-item textarea:focus {
      outline: none;
      border-color: #0e639c;
    }

    .data-item textarea {
      resize: vertical;
      min-height: 60px;
    }

    .preview-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .preview-header {
      padding: 20px;
      background: #2d2d30;
      border-bottom: 1px solid #3e3e42;
    }

    .preview-header h2 {
      font-size: 16px;
      font-weight: 600;
    }

    .preview-content {
      flex: 1;
      overflow: auto;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 40px;
    }

    #preview-container {
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      position: relative;
    }

    .editor-content::-webkit-scrollbar,
    .preview-content::-webkit-scrollbar {
      width: 10px;
    }

    .editor-content::-webkit-scrollbar-track,
    .preview-content::-webkit-scrollbar-track {
      background: #1e1e1e;
    }

    .editor-content::-webkit-scrollbar-thumb,
    .preview-content::-webkit-scrollbar-thumb {
      background: #555;
      border-radius: 5px;
    }

    .editor-content::-webkit-scrollbar-thumb:hover,
    .preview-content::-webkit-scrollbar-thumb:hover {
      background: #777;
    }

    .update-info {
      font-size: 11px;
      color: #888;
      margin-top: 4px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="editor-panel">
    <div class="editor-header">
      <h1>Scene Data Editor</h1>
      <p style="font-size: 12px; color: #888; margin-top: 4px;">Edit values to see live updates</p>

      <div class="theme-selector">
        <label for="theme-select">Theme:</label>
        <select id="theme-select">
          <option value="elegant">Elegant Wedding Theme</option>
          <option value="modern">Modern Bold Wedding Theme</option>
        </select>
      </div>
    </div>
    <div class="editor-content" id="editor-content">
      <!-- Data items will be inserted here -->
    </div>
  </div>

  <div class="preview-panel">
    <div class="preview-header">
      <h2>Live Preview</h2>
    </div>
    <div class="preview-content">
      <div id="preview-container"></div>
    </div>
  </div>

  <script>
    // Embedded scene data
    const sceneData = ${JSON.stringify(data, null, 2)};
    const sceneTemplate = ${JSON.stringify(template, null, 2)};
    const themes = {
      elegant: ${JSON.stringify(theme, null, 2)},
      modern: ${JSON.stringify(themeModern, null, 2)}
    };

    let currentTheme = 'elegant';

    // Inline renderer (browser-compatible version)
    ${generateBrowserRenderer()}

    // Initialize editor
    function initializeEditor() {
      const editorContent = document.getElementById('editor-content');
      editorContent.innerHTML = '';

      sceneData.data_items.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'data-item';

        const isText = item.type === 'text';
        const inputType = isText ? 'textarea' : 'input';
        const valueKey = isText ? 'content' : 'image_url';
        const label = isText ? 'Content' : 'Image URL';

        itemDiv.innerHTML = \`
          <div class="data-item-header">
            <span class="data-item-title">\${item.display_name}</span>
            <span class="data-item-type">\${item.type}</span>
          </div>
          <label for="item-\${item.id}">\${label}:</label>
          <\${inputType}
            id="item-\${item.id}"
            data-item-id="\${item.id}"
            data-index="\${index}"
          >\${item[valueKey] || ''}</\${inputType}>
          <div class="update-info">Updates automatically on change</div>
        \`;

        editorContent.appendChild(itemDiv);

        // Add event listener
        const input = itemDiv.querySelector(\`#item-\${item.id}\`);
        input.addEventListener('input', handleDataChange);
      });
    }

    // Handle data changes
    function handleDataChange(event) {
      const index = parseInt(event.target.dataset.index);
      const item = sceneData.data_items[index];
      const valueKey = item.type === 'text' ? 'content' : 'image_url';

      item[valueKey] = event.target.value;

      // Re-render
      renderPreview();
    }

    // Handle theme change
    document.getElementById('theme-select').addEventListener('change', (event) => {
      currentTheme = event.target.value;
      renderPreview();
    });

    // Render preview
    function renderPreview() {
      console.log('Rendering with theme:', currentTheme);

      const scene = {
        data: sceneData,
        template: sceneTemplate,
        theme: themes[currentTheme]
      };

      console.log('Theme colors:', scene.theme.color_palette.map(c => c.name));

      const result = renderScene(scene);

      console.log('Generated CSS length:', result.css.length);
      console.log('Generated HTML length:', result.html.length);

      const previewContainer = document.getElementById('preview-container');
      previewContainer.innerHTML = result.html;

      // Inject CSS
      let styleTag = document.getElementById('scene-styles');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'scene-styles';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = result.css;

      console.log('Preview rendered successfully');
    }

    // Initialize
    console.log('Initializing interactive demo...');
    initializeEditor();
    renderPreview();
  </script>
</body>
</html>`;

  // Write the file
  fs.writeFileSync(
    path.join(rootDir, 'interactive-demo.html'),
    html,
    'utf-8'
  );

  console.log('Interactive demo generated successfully!');
  console.log('Output: interactive-demo.html');
}

generateInteractiveDemo();

import { renderScene } from './renderer';
import type { Scene } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Helper function to generate HTML with body styling
 */
function createFullHTML(sceneId: string, css: string, html: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sceneId}</title>
  <style>
body {
  margin: 0;
  padding: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f5f5;
  font-family: sans-serif;
}

${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

/**
 * Render a scene with a specific theme
 */
function renderWithTheme(themeFile: string, outputFile: string) {
  const rootDir = path.join(__dirname, '..');

  // Load data and template (same for both)
  const data = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'wedding-invitation-data.json'), 'utf-8')
  );

  const template = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'wedding-invitation-template.json'), 'utf-8')
  );

  // Load the specific theme
  const theme = JSON.parse(
    fs.readFileSync(path.join(rootDir, themeFile), 'utf-8')
  );

  // Create the scene object
  const scene: Scene = {
    data,
    template,
    theme
  };

  // Render the scene
  const result = renderScene(scene);

  // Create full HTML
  const fullHTML = createFullHTML(scene.data.scene_id, result.css, result.html);

  // Write the output
  fs.writeFileSync(path.join(rootDir, outputFile), fullHTML, 'utf-8');

  console.log(`✓ ${theme.theme_name} rendered successfully!`);
  console.log(`  Output: ${outputFile}`);
}

// Generate both theme versions
console.log('Rendering wedding invitations with different themes...\n');

renderWithTheme(
  'wedding-invitation-theme.json',
  'wedding-invitation-elegant.html'
);

renderWithTheme(
  'wedding-invitation-theme-modern.json',
  'wedding-invitation-modern.html'
);

console.log('\nAll invitations generated successfully!');

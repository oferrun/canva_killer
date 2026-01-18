import { renderScene } from './renderer';
import type { Scene, SceneData, Template, Theme } from './types';

async function loadJsonFile(filename: string): Promise<unknown> {
  const file = Bun.file(filename);
  return file.json();
}

async function main() {
  const sceneId = process.argv[2] || 'my-scene';

  // Load scene components
  const data = await loadJsonFile(`${sceneId}-data.json`) as SceneData;
  const template = await loadJsonFile(`${sceneId}-template.json`) as Template;
  const theme = await loadJsonFile(`${sceneId}-theme.json`) as Theme;

  const scene: Scene = { data, template, theme };

  // Render
  const result = renderScene(scene);

  // Create full HTML
  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debug - ${sceneId}</title>
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

${result.css}
  </style>
</head>
<body>
${result.html}
</body>
</html>`;

  await Bun.write('debug.html', fullHTML);
  console.log('Written to debug.html');
  console.log('\n--- CSS ---');
  console.log(result.css);
  console.log('\n--- HTML ---');
  console.log(result.html);
}

main().catch(console.error);

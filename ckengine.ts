import type { SceneData, Template, Theme, DataItem, Color, Font, Element } from "./types";

export function createEmptyScene(sceneId: string): { data: SceneData; template: Template; theme: Theme } {
  const data: SceneData = {
    scene_id: sceneId,
    data_items: []
  };

  const template: Template = {
    template_id: `${sceneId}_template`,
    template_name: `${sceneId} Template`,
    canvas: {
      width: 800,
      height: 600
    },
    elements: []
  };

  const theme: Theme = {
    theme_id: `${sceneId}_theme`,
    theme_name: `${sceneId} Theme`,
    color_palette: [
      { id: "primary", name: "Primary", r: 0, g: 0, b: 0, a: 1 },
      { id: "background", name: "Background", r: 255, g: 255, b: 255, a: 1 }
    ],
    font_palette: [
      { font_id: "default", font_name: "Arial", font_url: "" }
    ]
  };

  return { data, template, theme };
}

export function addDataItemToScene(data: SceneData, item: DataItem): DataItem {
  data.data_items.push(item);
  return item;
}

export function addColorToTheme(theme: Theme, color: Color): Color {
  theme.color_palette.push(color);
  return color;
}

export function addFontToTheme(theme: Theme, font: Font): Font {
  theme.font_palette.push(font);
  return font;
}

export function addElementToTemplate(template: Template, element: Element): Element {
  template.elements.push(element);
  return element;
}

export interface SceneFile {
  id: string;
  name: string;
  data: string;
  template: string;
  theme: string;
}

export async function saveSceneToFile(
  data: SceneData,
  template: Template,
  theme: Theme,
  basePath: string,
  sceneName?: string
): Promise<{ sceneFile: string; dataFile: string; templateFile: string; themeFile: string }> {
  const sceneFile = `${basePath}-scene.json`;
  const dataFile = `${basePath}-data.json`;
  const templateFile = `${basePath}-template.json`;
  const themeFile = `${basePath}-theme.json`;

  const scene: SceneFile = {
    id: data.scene_id,
    name: sceneName || data.scene_id,
    data: dataFile,
    template: templateFile,
    theme: themeFile
  };

  await Promise.all([
    Bun.write(sceneFile, JSON.stringify(scene, null, 2)),
    Bun.write(dataFile, JSON.stringify(data, null, 2)),
    Bun.write(templateFile, JSON.stringify(template, null, 2)),
    Bun.write(themeFile, JSON.stringify(theme, null, 2))
  ]);

  return { sceneFile, dataFile, templateFile, themeFile };
}

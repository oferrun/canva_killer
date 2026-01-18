import { renderScene } from "./renderer";
import { convertSvgToScene } from "./svg-converter";
import { createEmptyScene, addDataItemToScene, saveSceneToFile } from "./ckengine";
import type { Scene, SceneData, Template, Theme, DataItem } from "./types";

// Store component data per WebSocket connection
const clientScenes = new Map<unknown, {
  data: SceneData | null;
  template: Template | null;
  theme: Theme | null;
}>();

async function loadJsonFile(filename: string): Promise<unknown> {
  const file = Bun.file(filename);
  if (await file.exists()) {
    return file.json();
  }
  return null;
}

function tryRenderScene(ws: unknown): { html: string; css: string } | null {
  const components = clientScenes.get(ws);
  if (!components) return null;

  const { data, template, theme } = components;
  if (!data || !template || !theme) return null;

  try {
    const scene: Scene = { data, template, theme };
    return renderScene(scene);
  } catch (e) {
    console.error("Render error:", e);
    return null;
  }
}

const server = Bun.serve({
  port: 3000,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("client.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Serve static files (images, etc.)
    const filePath = url.pathname.slice(1); // Remove leading slash
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'webp': 'image/webp',
        'json': 'application/json',
      };
      const contentType = contentTypes[ext || ''] || 'application/octet-stream';
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      console.log("Client connected");
      clientScenes.set(ws, { data: null, template: null, theme: null });
      ws.send(JSON.stringify({ type: "CONNECTED", message: "Ready to receive scene data" }));
    },
    async message(ws, message) {
      try {
        const msg = JSON.parse(message.toString());
        console.log("Received:", msg.type);

        if (msg.type === "SCENE_LOADED") {
          const { scene } = msg.data;

          // Load component files based on scene references
          const [data, template, theme] = await Promise.all([
            loadJsonFile(scene.data) as Promise<SceneData | null>,
            loadJsonFile(scene.template) as Promise<Template | null>,
            loadJsonFile(scene.theme) as Promise<Theme | null>,
          ]);

          clientScenes.set(ws, { data, template, theme });

          // Send loaded components back to client
          ws.send(JSON.stringify({
            type: "COMPONENTS_LOADED",
            data: { data, template, theme }
          }));

          // Try to render
          const result = tryRenderScene(ws);
          if (result) {
            ws.send(JSON.stringify({ type: "RENDER_RESULT", data: result }));
          }
        }

        if (msg.type === "COMPONENT_UPDATED") {
          const { type, data } = msg.data;
          const components = clientScenes.get(ws);

          if (components) {
            components[type as keyof typeof components] = data;

            // Try to render with updated component
            const result = tryRenderScene(ws);
            if (result) {
              ws.send(JSON.stringify({ type: "RENDER_RESULT", data: result }));
            }
          }
        }

        if (msg.type === "CONVERT_SVG") {
          const { svgContent, sceneId } = msg.data;

          try {
            const converted = convertSvgToScene(svgContent, sceneId || "converted");

            // Store the converted components
            clientScenes.set(ws, {
              data: converted.data,
              template: converted.template,
              theme: converted.theme
            });

            // Send converted components to client
            ws.send(JSON.stringify({
              type: "SVG_CONVERTED",
              data: converted
            }));

            // Render the scene
            const result = tryRenderScene(ws);
            if (result) {
              ws.send(JSON.stringify({ type: "RENDER_RESULT", data: result }));
            }
          } catch (e) {
            ws.send(JSON.stringify({ type: "ERROR", message: `SVG conversion failed: ${e}` }));
          }
        }

        if (msg.type === "CREATE_SCENE") {
          const { sceneId } = msg.data;
          const newScene = createEmptyScene(sceneId);

          clientScenes.set(ws, {
            data: newScene.data,
            template: newScene.template,
            theme: newScene.theme
          });

          ws.send(JSON.stringify({
            type: "SCENE_CREATED",
            data: newScene
          }));
        }

        if (msg.type === "ADD_DATA_ITEM") {
          const { item } = msg.data as { item: DataItem };
          const components = clientScenes.get(ws);

          if (components && components.data) {
            const added = addDataItemToScene(components.data, item);
            ws.send(JSON.stringify({
              type: "DATA_ITEM_ADDED",
              data: { item: added, data: components.data }
            }));

            // Re-render if we have all components
            const result = tryRenderScene(ws);
            if (result) {
              ws.send(JSON.stringify({ type: "RENDER_RESULT", data: result }));
            }
          } else {
            ws.send(JSON.stringify({ type: "ERROR", message: "No scene data to add item to" }));
          }
        }

        if (msg.type === "SAVE_SCENE") {
          const { basePath } = msg.data;
          const components = clientScenes.get(ws);

          if (components && components.data && components.template && components.theme) {
            const savedFiles = await saveSceneToFile(
              components.data,
              components.template,
              components.theme,
              basePath
            );
            ws.send(JSON.stringify({
              type: "SCENE_SAVED",
              data: savedFiles
            }));
          } else {
            ws.send(JSON.stringify({ type: "ERROR", message: "Incomplete scene - cannot save" }));
          }
        }

      } catch (e) {
        console.error("Message error:", e);
        ws.send(JSON.stringify({ type: "ERROR", message: String(e) }));
      }
    },
    close(ws) {
      console.log("Client disconnected");
      clientScenes.delete(ws);
    },
  },
});

console.log(`Server running at http://localhost:${server.port}`);

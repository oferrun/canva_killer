import { renderScene } from "./renderer";
import type { Scene, SceneData, Template, Theme } from "./types";

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
  fetch(req, server) {
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

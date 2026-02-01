import { renderScene } from "./renderer";
import { convertSvgToScene } from "./svg-converter";
import { createEmptyScene, addDataItemToScene, saveSceneToFile } from "./ckengine";
import { callGrokCompletionMultiTurn, type ChatMessage } from "./ck_backend";
import type { Scene, SceneData, Template, Theme, DataItem } from "./types";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Load operations.json for assistant system prompt
const operationsJson = await Bun.file("operations.json").text();

const ASSISTANT_SYSTEM_PROMPT = `You are a scene creation assistant. You help users create visual scenes by generating an ordered list of operations.

Here are the available operations you can use:
${operationsJson}

RULES:
1. Your goal is to understand what the user wants to create, then generate an ordered list of operations to build it.
2. The first operation MUST always be "create_canvas".
3. If the user hasn't specified required information, ask for it in plain, non-technical language. For example say "I need the input image", "What text should I add?", "What colors would you like?" — NEVER mention operations, parameters, URLs, JSON, aspect ratios, DPI, or any technical/implementation details to the user.
4. If something CANNOT be done with the available operations, tell the user in simple terms what you can't do. For example: "Sorry, I can't add videos to a scene" or "I'm not able to animate elements". Don't mention "operations" or technical limitations.
5. When referencing outputs from previous operations (e.g., a generated image), use a placeholder like "$output_of_step_N" where N is the step number.
6. Layer names should be descriptive (e.g., "background_photo", "title_text", "logo").
7. When the user provides an input image or wants to create something based on an image, DEDUCE the canvas size from that image — do NOT ask the user for canvas dimensions. Just match the canvas to the image size. If no image is involved, pick a sensible default based on the use case (e.g., 1080x1080 for social media, 1080x1920 for stories, 1240x1748 for invitations).
10. In add_image_layer, the default width and height is the image's own width and height — do NOT set width/height parameters unless the user wants to resize or reposition the image.
8. Default canvas background color is always "#FFFFFF" (white) unless the user specifies otherwise.
9. Default DPI is 72 (screen) unless the user mentions printing.

RESPONSE FORMAT:
You MUST respond with valid JSON in one of these formats:

When asking a question or making a statement:
{"type": "message", "text": "Your message here"}

When presenting options for the user to choose from:
{"type": "options", "text": "Your question here", "options": ["Option 1", "Option 2", "Option 3"]}

When you have gathered enough information and are ready to output the final plan:
{"type": "operations", "text": "Here's what I'll do for you:", "operations": [
  {"step": 1, "operation": "create_canvas", "parameters": {"width": 1080, "height": 1080, "dpi": 72, "background_color": "#FFFFFF"}},
  {"step": 2, "operation": "generate_image", "parameters": {"prompt": "...", "model": "nano-banana", "aspect_ratio": "1:1"}},
  ...
]}

IMPORTANT:
- Always respond with ONLY the JSON object, no markdown formatting or extra text.
- Be conversational, friendly, and non-technical in your "text" fields. Talk like a helpful designer, not a programmer.
- When presenting options, keep them concise and relevant.
- The operations list must include ALL required parameters for each operation.
- Optional parameters should only be included when the user has specified them or when a non-default value makes sense for the design.
- Start the conversation by asking what the user wants to create.`;

// Audio transcription using local Whisper CLI
const WHISPER_MODEL_PATH = path.join(import.meta.dir, "whisper-models/ggml-base.bin");
const AUDIO_DIR = path.join(import.meta.dir, "audio_tmp");
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}

function transcribeAudio(audioPath: string): string {
  try {
    execSync(`whisper-cli -m ${WHISPER_MODEL_PATH} -f ${audioPath} --output-json`, {
      encoding: "utf8",
    });

    const jsonPath = `${audioPath}.json`;
    if (!fs.existsSync(jsonPath)) {
      console.error("Whisper JSON output not found:", jsonPath);
      return "";
    }

    const jsonData = fs.readFileSync(jsonPath, "utf8");
    const result = JSON.parse(jsonData);
    const fullText = (result.transcription || [])
      .map((seg: any) => seg.text.trim())
      .join(" ");

    try { fs.unlinkSync(jsonPath); } catch {}

    return fullText;
  } catch (err) {
    console.error("Whisper error:", err);
    return "";
  }
}

// Store assistant conversation history per WebSocket connection
const assistantConversations = new Map<unknown, ChatMessage[]>();

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
      const upgraded = server.upgrade(req, { data: { type: "editor" } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    if (url.pathname === "/assistant-ws") {
      const upgraded = server.upgrade(req, { data: { type: "assistant" } });
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

    if (url.pathname === "/assistant") {
      return new Response(Bun.file("scene-assistant.html"), {
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
    open(ws: any) {
      const wsType = ws.data?.type;
      if (wsType === "assistant") {
        console.log("Assistant client connected");
        assistantConversations.set(ws, []);
        // Send initial greeting
        const greeting = { type: "options", text: "What do you want to create today?", options: [
          "Social media post",
          "Wedding invitation",
          "Poster or flyer",
          "Photo collage"
        ]};
        ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: greeting }));
        return;
      }
      console.log("Client connected");
      clientScenes.set(ws, { data: null, template: null, theme: null });
      ws.send(JSON.stringify({ type: "CONNECTED", message: "Ready to receive scene data" }));
    },
    async message(ws: any, message: string | Buffer) {
      const wsType = ws.data?.type;

      if (wsType === "assistant") {
        try {
          const msg = JSON.parse(message.toString());
          if (msg.type === "RESET_CONVERSATION") {
            assistantConversations.set(ws, []);
            const greeting = { type: "options", text: "What do you want to create today?", options: [
              "Social media post",
              "Wedding invitation",
              "Poster or flyer",
              "Photo collage"
            ]};
            ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: greeting }));
            return;
          }

          if (msg.type === "VOICE_MESSAGE") {
            const audioBase64 = msg.audio;
            if (!audioBase64) {
              ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: { type: "message", text: "I didn't receive any audio. Please try again." } }));
              return;
            }

            ws.send(JSON.stringify({ type: "ASSISTANT_TYPING" }));

            try {
              const audioBuffer = Buffer.from(audioBase64, "base64");
              const audioFilename = `voice_${Date.now()}.wav`;
              const audioPath = path.join(AUDIO_DIR, audioFilename);

              fs.writeFileSync(audioPath, audioBuffer);
              const transcription = transcribeAudio(audioPath);
              try { fs.unlinkSync(audioPath); } catch {}

              if (!transcription || transcription.trim() === "") {
                ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: { type: "message", text: "I couldn't understand the audio. Could you try again or type your message?" } }));
                return;
              }

              // Send transcription back so client can display it
              ws.send(JSON.stringify({ type: "VOICE_TRANSCRIBED", text: transcription.trim() }));

              // Feed into conversation as if user typed it
              const history = assistantConversations.get(ws) || [];
              history.push({ role: "user", content: transcription.trim() });

              const response = await callGrokCompletionMultiTurn(history, ASSISTANT_SYSTEM_PROMPT);
              history.push({ role: "assistant", content: response });
              assistantConversations.set(ws, history);

              let parsed;
              try { parsed = JSON.parse(response); } catch { parsed = { type: "message", text: response }; }
              ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: parsed }));

            } catch (e) {
              console.error("Voice processing error:", e);
              ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: { type: "message", text: "Sorry, there was an error processing your voice. Please try again." } }));
            }
            return;
          }

          if (msg.type === "USER_MESSAGE") {
            const history = assistantConversations.get(ws) || [];
            history.push({ role: "user", content: msg.text });

            ws.send(JSON.stringify({ type: "ASSISTANT_TYPING" }));

            try {
              const response = await callGrokCompletionMultiTurn(history, ASSISTANT_SYSTEM_PROMPT);
              history.push({ role: "assistant", content: response });
              assistantConversations.set(ws, history);

              // Try to parse as structured JSON
              let parsed;
              try {
                parsed = JSON.parse(response);
              } catch {
                // If not valid JSON, wrap as a message
                parsed = { type: "message", text: response };
              }

              ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: parsed }));
            } catch (e) {
              console.error("Grok API error:", e);
              ws.send(JSON.stringify({ type: "ASSISTANT_RESPONSE", data: { type: "message", text: "Sorry, I encountered an error. Please try again." } }));
            }
          }
        } catch (e) {
          console.error("Assistant message error:", e);
          ws.send(JSON.stringify({ type: "ERROR", message: String(e) }));
        }
        return;
      }

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
    close(ws: any) {
      const wsType = ws.data?.type;
      if (wsType === "assistant") {
        console.log("Assistant client disconnected");
        assistantConversations.delete(ws);
      } else {
        console.log("Client disconnected");
        clientScenes.delete(ws);
      }
    },
  },
});

console.log(`Server running at http://localhost:${server.port}`);

import { createWriteStream } from "fs";
import { basename } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

export async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is empty");
  }

  const fileStream = createWriteStream(destination);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

export async function callGrokCompletion(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is not set");
  }

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "grok-4-1-fast-non-reasoning",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0].message.content;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callGrokCompletionMultiTurn(
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is not set");
  }

  const allMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages
  ];

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "grok-4-1-fast-non-reasoning",
      messages: allMessages
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0].message.content;
}

export interface ReplicatePrediction {
  id: string;
  status: string;
  urls: { get: string };
  output?: unknown;
  [key: string]: unknown;
}

export async function runNanoBanana(
  prompt: string,
  inputImages?: string[],
  aspectRatio?: string,
  outputFormat?: string
): Promise<ReplicatePrediction> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    throw new Error("REPLICATE_API_TOKEN environment variable is not set");
  }

  // Create prediction
  const createResponse = await fetch("https://api.replicate.com/v1/models/google/nano-banana/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input: {
        prompt,
        input_images: inputImages,
        aspect_ratio: aspectRatio,
        output_format: outputFormat
      }
    })
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Replicate API error: ${createResponse.status} - ${error}`);
  }

  const prediction = await createResponse.json() as ReplicatePrediction;

  // Poll for completion
  let result: ReplicatePrediction = prediction;
  while (result.status !== "succeeded" && result.status !== "failed") {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pollResponse = await fetch(prediction.urls.get, {
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });

    if (!pollResponse.ok) {
      const error = await pollResponse.text();
      throw new Error(`Replicate poll error: ${pollResponse.status} - ${error}`);
    }

    result = await pollResponse.json() as ReplicatePrediction;
  }

  if (result.status === "failed") {
    throw new Error("Nano Banana prediction failed");
  }

  return result;
}

export async function uploadFileToReplicate(filePath: string): Promise<string> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    throw new Error("REPLICATE_API_TOKEN environment variable is not set");
  }

  const file = Bun.file(filePath);
  const fileName = basename(filePath);

  // Use multipart form data with "content" field
  const formData = new FormData();
  formData.append("content", file, fileName);

  const createResponse = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Replicate upload error: ${createResponse.status} - ${error}`);
  }

  const result = await createResponse.json() as { urls: { get: string } };
  return result.urls.get;
}

// async function testDownload() {
//   const url = "https://replicate.delivery/xezq/GrAwcYtqWWZeUSWRkISHZeDY9fL5JcVnDJXgExztCKHifxDYB/tmp11mxd5r8.jpeg";
//   const destination = "downloaded-image.jpeg";

//   console.log(`Downloading ${url} to ${destination}...`);
//   await downloadFile(url, destination);
//   console.log("Download complete!");
// }

// testDownload().catch(console.error);

// async function testUpload() {
//   console.log("Uploading fence.png to Replicate...");
//   const url = await uploadFileToReplicate("fence.png");
//   console.log("Upload complete! URL:", url);
// }

// testUpload().catch(console.error);

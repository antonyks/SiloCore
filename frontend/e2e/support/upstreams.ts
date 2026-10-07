import { createServer, type ServerResponse } from "node:http";

type Generation = {
  model: string;
  stream?: boolean;
  messages: { role: string; content: string }[];
};
export type CapturedGeneration = Generation & { provider: "ollama" | "openai" };
export async function startUpstreams() {
  const generations: CapturedGeneration[] = [];
  const releases = new Map<string, () => void>();
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer(async (request, response) => {
    try {
      const path = request.url;
      if (request.method === "GET" && path === "/api/tags") {
        return json(response, { models: [{ name: "e2e-ollama" }] });
      }
      if (request.method === "GET" && path === "/models") {
        return json(response, { data: [{ id: "e2e-openai" }] });
      }
      if (
        request.method !== "POST" ||
        !["/api/chat", "/chat/completions"].includes(path || "")
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      let raw = "";
      for await (const chunk of request) raw += chunk.toString();
      const body = JSON.parse(raw) as Generation;
      const provider = path === "/api/chat" ? "ollama" : "openai";
      generations.push({ ...body, provider });
      const prompt =
        body.messages.filter((item) => item.role === "user").at(-1)?.content ||
        "";
      const prefix = `${provider}:${body.model}:`;
      const answer = prefix + prompt;
      if (!body.stream) {
        return json(
          response,
          provider === "ollama"
            ? {
                model: body.model,
                message: { role: "assistant", content: answer },
                done: true,
                done_reason: "stop",
                prompt_eval_count: 3,
                eval_count: 4,
              }
            : {
                model: body.model,
                choices: [
                  {
                    message: { role: "assistant", content: answer },
                    finish_reason: "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 3,
                  completion_tokens: 4,
                  total_tokens: 7,
                },
              },
        );
      }
      const write = (content: string) =>
        response.write(
          provider === "ollama"
            ? `${JSON.stringify({ message: { content }, done: false })}\n`
            : `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`,
        );
      response.writeHead(200, {
        "Content-Type":
          provider === "ollama" ? "application/x-ndjson" : "text/event-stream",
      });
      write(prefix);
      if (prompt.startsWith("gated-")) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            releases.delete(prompt);
            resolve();
          };
          releases.set(prompt, finish);
          response.once("close", finish);
        });
      }
      if (response.destroyed) return;
      write(prompt);
      if (provider === "ollama") {
        response.end(
          `${JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 3, eval_count: 4 })}\n`,
        );
      } else {
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })}\n\n`,
        );
        response.end("data: [DONE]\n\n");
      }
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Mock upstream did not bind");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    generations,
    release(prompt: string) {
      const release = releases.get(prompt);
      if (!release)
        throw new Error("No waiting mock stream for synthetic prompt");
      release();
    },
    async close() {
      for (const release of releases.values()) release();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
function json(response: ServerResponse, data: unknown) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
}

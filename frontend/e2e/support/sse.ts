import type { Actor, PublicJob, TestStack } from "./stack";
export type JobEvent = { event: string; data: PublicJob };
export async function openJobStream(
  stack: TestStack,
  actor: Actor,
  workspaceId: number,
  jobId: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`${stack.apiUrl}/jobs/${jobId}/stream`, {
      headers: {
        Authorization: `Bearer ${actor.token}`,
        "X-Workspace-Id": String(workspaceId),
      },
      signal: controller.signal,
    });
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.includes("text/event-stream")
    )
      throw new Error(`SSE open failed: ${response.status}`);
    reader = response.body.getReader();
    const events: JobEvent[] = [];
    const decoder = new TextDecoder();
    let buffer = "";
    async function next(): Promise<JobEvent> {
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = block
            .split("\n")
            .find((line) => line.startsWith("event: "))
            ?.slice(7);
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("\n");
          if (!event || !data) continue;
          const item = { event, data: JSON.parse(data) as PublicJob };
          if (item.data.id !== jobId || item.data.workspaceId !== workspaceId)
            throw new Error("SSE escaped expected job/workspace");
          if (
            !Number.isFinite(item.data.progress) ||
            item.data.progress < 0 ||
            item.data.progress > 100 ||
            typeof item.data.stage !== "string"
          )
            throw new Error("Invalid job progress/stage");
          if ("payload" in item.data || "queueMessageId" in item.data)
            throw new Error("SSE leaked internal job fields");
          events.push(item);
          return item;
        }
        const chunk = await reader!.read();
        if (chunk.done) throw new Error("SSE ended before expected event");
        buffer += decoder
          .decode(chunk.value, { stream: true })
          .replaceAll("\r\n", "\n");
      }
    }
    return {
      next,
      events,
      async terminal() {
        while (true) {
          const event = await next();
          if (["succeeded", "failed", "cancelled"].includes(event.event))
            return event;
        }
      },
      async close() {
        clearTimeout(timeout);
        controller.abort();
        await reader?.cancel().catch(() => undefined);
        reader?.releaseLock();
      },
    };
  } catch (error) {
    clearTimeout(timeout);
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
    throw error;
  }
}

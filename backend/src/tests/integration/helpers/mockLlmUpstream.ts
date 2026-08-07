import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

export type CapturedUpstreamRequest = {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: string;
};

type MockRouteHandler = (
  request: CapturedUpstreamRequest,
  response: ServerResponse,
) => void | Promise<void>;

export type MockRouteMap = Record<string, MockRouteHandler>;

export type MockLlmUpstream = {
  baseUrl: string;
  requests: CapturedUpstreamRequest[];
  close: () => Promise<void>;
};

export async function createMockLlmUpstream(routes: MockRouteMap): Promise<MockLlmUpstream> {
  const requests: CapturedUpstreamRequest[] = [];

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const request = {
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      headers: req.headers,
      body,
    };
    requests.push(request);

    const route = routes[`${request.method} ${request.path}`];
    if (!route) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    await route(request, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Failed to bind mock LLM upstream.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => closeServer(server),
  };
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
}

export function sendChunksThenDestroy(
  res: ServerResponse,
  contentType: string,
  chunks: string[],
): void {
  res.writeHead(200, { 'Content-Type': contentType });
  for (const chunk of chunks) {
    res.write(chunk);
  }
  setTimeout(() => {
    res.destroy(new Error('deterministic upstream stream failure'));
  }, 10);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

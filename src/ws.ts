import type { ServerWebSocket } from "bun";

export const clients: Set<ServerWebSocket> = new Set();

export function handleWsOpen(ws: ServerWebSocket): void {
  clients.add(ws);
}

export function handleWsClose(ws: ServerWebSocket): void {
  clients.delete(ws);
}

export function handleWsMessage(
  _ws: ServerWebSocket,
  _message: string | Buffer,
): void {
  // no-op — client doesn't send messages yet
}

export function broadcast(data: object): void {
  const json = JSON.stringify(data);
  const toRemove: ServerWebSocket[] = [];
  for (const ws of clients) {
    try {
      ws.send(json);
    } catch {
      toRemove.push(ws);
    }
  }
  for (const ws of toRemove) {
    clients.delete(ws);
  }
}

export interface SessionUpdate {
  sessionId: string;
  projectPath: string;
  model: string;
  startedAt: string;
  lastSeenAt: string;
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    costUsd: number;
  };
}

export function broadcastSessionUpdate(session: SessionUpdate): void {
  const startedMs = new Date(session.startedAt).getTime();
  const lastSeenMs = new Date(session.lastSeenAt).getTime();
  const elapsedMs = lastSeenMs - startedMs;

  broadcast({
    type: "session_update",
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    model: session.model,
    elapsedMs,
    totals: session.totals,
  });
}

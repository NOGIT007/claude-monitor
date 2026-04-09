import { describe, it, expect, beforeEach } from "bun:test";
import {
  clients,
  handleWsOpen,
  handleWsClose,
  broadcast,
  broadcastSessionUpdate,
} from "./ws";

function mockWs() {
  const messages: string[] = [];
  return {
    send: (msg: string) => {
      messages.push(msg);
    },
    messages,
  } as unknown as ReturnType<typeof Object.create> & {
    messages: string[];
    send: (msg: string) => void;
  };
}

describe("ws", () => {
  beforeEach(() => {
    clients.clear();
  });

  describe("handleWsOpen", () => {
    it("adds client to set", () => {
      const ws = mockWs();
      handleWsOpen(ws as any);
      expect(clients.size).toBe(1);
      expect(clients.has(ws as any)).toBe(true);
    });
  });

  describe("handleWsClose", () => {
    it("removes client from set", () => {
      const ws = mockWs();
      clients.add(ws as any);
      expect(clients.size).toBe(1);

      handleWsClose(ws as any);
      expect(clients.size).toBe(0);
    });
  });

  describe("broadcast", () => {
    it("sends JSON to all clients", () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      clients.add(ws1 as any);
      clients.add(ws2 as any);

      broadcast({ type: "test", value: 42 });

      const expected = JSON.stringify({ type: "test", value: 42 });
      expect(ws1.messages).toEqual([expected]);
      expect(ws2.messages).toEqual([expected]);
    });

    it("removes clients that throw on send", () => {
      const good = mockWs();
      const bad = {
        send: () => {
          throw new Error("connection closed");
        },
      };
      clients.add(good as any);
      clients.add(bad as any);

      broadcast({ type: "test" });

      expect(clients.size).toBe(1);
      expect(clients.has(good as any)).toBe(true);
      expect(clients.has(bad as any)).toBe(false);
    });
  });

  describe("broadcastSessionUpdate", () => {
    it("formats correct message shape with elapsedMs", () => {
      const ws = mockWs();
      clients.add(ws as any);

      broadcastSessionUpdate({
        sessionId: "c8c3e586-abcd-1234-ef56-789012345678",
        projectPath: "/Users/me/code/myproject",
        model: "claude-sonnet-4-6",
        startedAt: "2026-04-09T10:00:00.000Z",
        lastSeenAt: "2026-04-09T10:42:00.000Z",
        totals: {
          input: 42103,
          output: 8421,
          cacheRead: 180234,
          cacheWrite: 21092,
          costUsd: 0.24,
        },
      });

      expect(ws.messages.length).toBe(1);
      const msg = JSON.parse(ws.messages[0]);

      expect(msg.type).toBe("session_update");
      expect(msg.sessionId).toBe("c8c3e586-abcd-1234-ef56-789012345678");
      expect(msg.projectPath).toBe("/Users/me/code/myproject");
      expect(msg.model).toBe("claude-sonnet-4-6");
      expect(msg.elapsedMs).toBe(42 * 60 * 1000); // 42 minutes
      expect(msg.totals).toEqual({
        input: 42103,
        output: 8421,
        cacheRead: 180234,
        cacheWrite: 21092,
        costUsd: 0.24,
      });
    });
  });
});

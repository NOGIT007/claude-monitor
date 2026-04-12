import { createRoot } from "react-dom/client";
import { App } from "./App";

// Snapshot mode: mock fetch and WebSocket so all components work from cached data
declare global {
  interface Window {
    __SNAPSHOT__?: { capturedAt: string; routes: Record<string, unknown> };
  }
}

if (window.__SNAPSHOT__) {
  const { routes } = window.__SNAPSHOT__;

  // Mock fetch — return snapshot data for known routes, empty 404 for others
  const realFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let key: string;
    try {
      const u = new URL(urlStr, "http://localhost");
      key = u.pathname + u.search;
    } catch {
      return realFetch(input, init);
    }
    if (key in routes) {
      return new Response(JSON.stringify(routes[key]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(null), { status: 404 });
  }) as typeof fetch;

  // Mock WebSocket — fire onclose immediately so App falls into disconnected state
  (window as unknown as Record<string, unknown>).WebSocket = class MockWebSocket {
    onopen: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    readyState = 3; // CLOSED
    constructor() {
      setTimeout(() => this.onclose?.({} as CloseEvent), 0);
    }
    close() {}
    send() {}
  };
}

createRoot(document.getElementById("root")!).render(<App />);

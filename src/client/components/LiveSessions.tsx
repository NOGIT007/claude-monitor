import type { ActiveSession } from "../types";
import { SessionCard } from "./SessionCard";

interface Props {
  sessions: ActiveSession[];
}

export function LiveSessions({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div
        className="card"
        style={{
          textAlign: "center",
          color: "var(--ctp-subtext0)",
          padding: "2rem",
        }}
      >
        No active sessions
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
        gap: "1rem",
      }}
    >
      {sessions.map((s) => (
        <SessionCard key={s.sessionId} {...s} />
      ))}
    </div>
  );
}

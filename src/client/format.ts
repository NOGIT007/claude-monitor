const numberFormatter = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}

export function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export function formatPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatHour(hour: number): string {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  return `${String(h).padStart(2, "0")}:00`;
}

const GENERIC_DIRS = new Set([
  "scripts", "src", "app", "lib", "packages", "raw", "dist", "build", "cmd",
]);

/** Strip trailing generic subdirectories to get the real project name */
export function normalizeProjectPath(path: string): string {
  let p = path;
  // Strip trailing generic dirs (could be nested: .../project/src/app)
  const parts = p.split("/");
  while (parts.length > 1 && GENERIC_DIRS.has(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join("/");
}

export function projectName(path: string | undefined): string {
  if (!path) return "unknown";
  const normalized = normalizeProjectPath(path);
  return normalized.split("/").pop() || path;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Returns the WebSocket URL for the backend.
 * When API_URL is empty (production same-origin), derives the URL from
 * window.location so it works correctly with both http and https.
 */
export function getWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8000/ws";
  if (!API_URL) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/ws`;
  }
  return API_URL.replace(/^http/, "ws") + "/ws";
}

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, scaled));
}

export function formatScore(value: number): string {
  return `${Math.round(normalizeScore(value))}%`;
}

export function formatDate(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 5) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;

  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function truncate(str: string, n: number): string {
  if (str.length <= n) return str;
  return str.slice(0, n).trimEnd() + "…";
}

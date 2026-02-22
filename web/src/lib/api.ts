import Cookies from "js-cookie";
import type { Application, Job, PipelineResult, User, WebSocketMessage } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const TOKEN_KEY = "zynd_token";

function getToken(): string | undefined {
  return Cookies.get(TOKEN_KEY);
}

export function setToken(token: string): void {
  Cookies.set(TOKEN_KEY, token, { expires: 7, sameSite: "lax" });
}

export function removeToken(): void {
  Cookies.remove(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { detail?: string; message?: string }).detail ||
        (body as { detail?: string; message?: string }).message ||
        `Request failed (${res.status})`,
      res.status,
      body,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface AuthResponse {
  token: string;
  user: User;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function signup(
  name: string,
  email: string,
  password: string,
  role: "candidate" | "employer" = "candidate",
): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password, role }),
  });
  setToken(data.token);
  return data;
}

export async function getProfile(): Promise<User> {
  return request<User>("/api/auth/me");
}

export async function submitApplication(payload: {
  candidate: Record<string, unknown>;
  job?: Record<string, unknown>;
  job_id?: string;
}): Promise<Application> {
  return request<Application>("/api/apply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getApplications(): Promise<Application[]> {
  const data = await request<{ applications?: Application[] } | Application[]>("/api/applications");
  if (Array.isArray(data)) return data;
  return data.applications ?? [];
}

export async function getApplicationById(id: string): Promise<Application> {
  return request<Application>(`/api/applications/${id}`);
}

export async function getJobs(): Promise<Job[]> {
  const data = await request<{ jobs?: Job[] } | Job[]>("/api/jobs");
  if (Array.isArray(data)) return data;
  return data.jobs ?? [];
}

export async function getJobById(id: string): Promise<Job> {
  return request<Job>(`/api/jobs/${id}`);
}

export async function postJob(payload: {
  title: string;
  company: string;
  description: string;
  requirements: string[];
  nice_to_have?: string[];
  experience_years?: number;
  location?: string;
  salary_range?: string;
  remote?: boolean;
}): Promise<Job> {
  const data = await request<{ job: Job } | Job>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return "job" in data ? data.job : data;
}

export async function getResults(sessionId: string): Promise<PipelineResult> {
  return request<PipelineResult>(`/api/results/${sessionId}`);
}

/* ─── History ─── */

export interface HistorySummary {
  id: string;
  conversation_id: string;
  status: string;
  submitted_at: string | null;
  completed_at: string | null;
  has_result: boolean;
  has_thinkings: boolean;
  event_count: number;
  scores?: {
    overall: number;
    privacy: number;
    bias_free: number;
    skill: number;
    match: number;
  };
  recommendation?: string;
  job_title?: string;
  company?: string;
}

export interface AgentThinkingRecord {
  id: number;
  agent_name: string;
  thinking_text: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface PipelineEventRecord {
  id: number;
  agent_name: string;
  event_type: string;
  step: string | null;
  status: string | null;
  data: Record<string, unknown> | null;
  timestamp: string | null;
}

export interface HistoryDetail extends HistorySummary {
  events: PipelineEventRecord[];
  thinkings: AgentThinkingRecord[];
  result?: Record<string, unknown>;
}

export async function getHistory(): Promise<HistorySummary[]> {
  const data = await request<{ history: HistorySummary[]; count: number }>("/api/history");
  return data.history ?? [];
}

export async function getHistoryDetail(conversationId: string): Promise<HistoryDetail> {
  return request<HistoryDetail>(`/api/history/${conversationId}`);
}

export function createWebSocket(
  onMessage: (msg: WebSocketMessage) => void,
  onStatusChange?: (status: "connected" | "disconnected" | "reconnecting") => void,
): { close: () => void } {
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let intentionalClose = false;
  const maxDelay = 30_000;

  function connect() {
    const token = getToken();
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      onStatusChange?.("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage;
        onMessage(msg);
      } catch {
        // Ignore malformed payloads
      }
    };

    ws.onclose = () => {
      if (intentionalClose) {
        onStatusChange?.("disconnected");
        return;
      }
      onStatusChange?.("reconnecting");
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** reconnectAttempts, maxDelay);
    reconnectAttempts += 1;
    reconnectTimeout = setTimeout(connect, delay);
  }

  function close() {
    intentionalClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    ws?.close();
  }

  connect();
  return { close };
}

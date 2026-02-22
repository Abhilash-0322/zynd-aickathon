"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Hexagon,
  Link2,
  Loader2,
  Radio,
  Scale,
  ScrollText,
  Shield,
  Target,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { API_URL, cn, getWsUrl } from "@/lib/utils";

/* ─── Submission tracking banner ─────────────────────────────────────────── */

function SubmissionBannerInner() {
  const params = useSearchParams();
  const id = params.get("id");
  if (!id) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex items-center gap-3 rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
    >
      <Radio className="h-4 w-4 shrink-0 animate-pulse text-sky-400" />
      <span>
        Tracking your submission —{" "}
        <span className="font-mono font-semibold text-sky-100">#{id}</span>
      </span>
    </motion.div>
  );
}

function SubmissionBanner() {
  return (
    <Suspense fallback={null}>
      <SubmissionBannerInner />
    </Suspense>
  );
}

/* ─── Agent definitions ──────────────────────────────────────────────────── */

interface AgentDef {
  id: string;
  name: string;
  icon: React.ElementType;
  role: string;
  color: string;
}

const agents: AgentDef[] = [
  { id: "orchestrator", name: "Orchestrator", icon: Hexagon, role: "Coordinates pipeline", color: "#7c3aed" },
  { id: "privacy", name: "Privacy Guardian", icon: Shield, role: "Anonymizes profile data", color: "#06b6d4" },
  { id: "bias", name: "Bias Detector", icon: Scale, role: "Flags risky language patterns", color: "#f59e0b" },
  { id: "skill", name: "Skill Verifier", icon: Target, role: "Verifies capability evidence", color: "#10b981" },
  { id: "matcher", name: "Candidate Matcher", icon: Link2, role: "Calculates role alignment", color: "#a78bfa" },
  { id: "credential", name: "Credential Issuer", icon: ScrollText, role: "Issues verifiable credential", color: "#ef4444" },
];

const PIPELINE_STEPS = ["privacy", "bias", "skill", "matcher", "credential"];

/* ─── Name normalization ─────────────────────────────────────────────────── */

function normalizeAgent(value: string): string {
  const name = value.toLowerCase().replace(/[^a-z]/g, "");
  if (name.includes("orchestrator")) return "orchestrator";
  if (name.includes("privacy")) return "privacy";
  if (name.includes("bias")) return "bias";
  if (name.includes("skill")) return "skill";
  if (name.includes("matcher") || name.includes("match")) return "matcher";
  if (name.includes("credential")) return "credential";
  return "";
}

/* ─── Log entry type ─────────────────────────────────────────────────────── */

interface LogEntry {
  id: string;
  timestamp: string;
  agent: string;
  agentId: string;
  status: string;
  message: string;
}

/* ─── Thinking box state ─────────────────────────────────────────────────── */

interface ThinkingBox {
  agentName: string;
  agentId: string;
  tokens: string;
  done: boolean;
}

/* ─── Event classifiers ──────────────────────────────────────────────────── */

type ActivityState = "running" | "done" | "error" | "pipeline_complete" | "info";

function classifyEvent(type: string, payload: Record<string, unknown>): ActivityState {
  const eventType = String(payload.event_type ?? "").toLowerCase();
  const status = String(payload.status ?? "").toLowerCase();

  if (type === "error" || eventType.includes("error") || status.includes("error") || status.includes("failed"))
    return "error";
  if (type === "pipeline_result" || (type === "pipeline_event" && status.includes("completed")) || eventType === "pipeline_complete")
    return "pipeline_complete";
  if (type === "result" || type === "thinking_end" || eventType.includes("complete") || status === "completed" || status === "done")
    return "done";
  if (type === "step" || type === "thinking_start" || eventType.includes("start") || status === "running" || status === "processing" || status === "started")
    return "running";
  return "info";
}

function toLogMessage(payload: Record<string, unknown>, type: string): string {
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.step === "string" && payload.step.trim()) return payload.step;
  if (typeof payload.event_type === "string" && payload.event_type.trim()) return payload.event_type;
  if (payload.data && typeof payload.data === "object") {
    const data = payload.data as Record<string, unknown>;
    if (typeof data.message === "string" && data.message.trim()) return data.message;
  }
  return type || "event";
}

function statusBadgeCls(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("error") || s.includes("failed")) return "bg-red-500/16 text-red-200 border-red-400/30";
  if (s.includes("run") || s.includes("start") || s.includes("process") || s.includes("thinking")) return "bg-sky-500/16 text-sky-100 border-sky-400/30";
  if (s.includes("done") || s.includes("complete")) return "bg-emerald-500/16 text-emerald-100 border-emerald-400/30";
  return "bg-white/[0.04] text-slate-300 border-white/15";
}

/* ─── Agent Network Canvas ───────────────────────────────────────────────── */

function AgentNetworkCanvas({
  activeAgents,
  pulsingAgents,
}: {
  activeAgents: Set<string>;
  pulsingAgents: Set<string>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.34;
    const now = Date.now();

    // Node positions
    const positions: Record<string, { x: number; y: number }> = {};
    positions["orchestrator"] = { x: cx, y: cy };
    const satellites = ["privacy", "bias", "skill", "matcher", "credential"];
    satellites.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / satellites.length - Math.PI / 2;
      positions[id] = {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });

    // Draw edges
    satellites.forEach((id) => {
      const from = positions["orchestrator"];
      const to = positions[id];
      const isActive = activeAgents.has(id) || pulsingAgents.has(id);

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);

      if (isActive) {
        const agent = agents.find((a) => a.id === id);
        ctx.strokeStyle = (agent?.color || "#7c3aed") + "80";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -((now % 1000) / 1000) * 20;
      } else {
        ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = 0;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    });

    // Draw nodes
    agents.forEach((agent) => {
      const pos = positions[agent.id];
      if (!pos) return;
      const isActive = activeAgents.has(agent.id) || pulsingAgents.has(agent.id);
      const nodeRadius = agent.id === "orchestrator" ? 24 : 20;

      // Pulse glow
      if (isActive) {
        const pulsePhase = (now % 2000) / 2000;
        const glowR = nodeRadius + 6 + pulsePhase * 14;
        const alpha = 0.35 * (1 - pulsePhase);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = agent.color + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();
      }

      // Outer ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#0c1627";
      ctx.fill();
      ctx.strokeStyle = isActive ? agent.color : "rgba(100, 116, 139, 0.45)";
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.stroke();

      // Inner fill
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius - 4, 0, Math.PI * 2);
      ctx.fillStyle = agent.color + (isActive ? "30" : "15");
      ctx.fill();

      // Status dot
      const dotColor = isActive ? "#22c55e" : "rgba(100,116,139,0.5)";
      ctx.beginPath();
      ctx.arc(pos.x + nodeRadius - 3, pos.y - nodeRadius + 3, 4, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();

      // Label
      ctx.font = "600 10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isActive ? "#f1f5f9" : "#94a3b8";
      ctx.fillText(agent.name, pos.x, pos.y + nodeRadius + 14);
    });

    // Continue animation if anything is active
    if (activeAgents.size > 0 || pulsingAgents.size > 0) {
      animRef.current = requestAnimationFrame(draw);
    }
  }, [activeAgents, pulsingAgents]);

  useEffect(() => {
    draw();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const handle = () => draw();
    window.addEventListener("resize", handle);
    const t = setTimeout(draw, 100);
    return () => {
      window.removeEventListener("resize", handle);
      clearTimeout(t);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      style={{ minHeight: 280 }}
    />
  );
}

/* ─── Thinking Box Component ─────────────────────────────────────────────── */

function ThinkingBoxUI({ box }: { box: ThinkingBox }) {
  const agent = agents.find((a) => a.id === box.agentId);
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [box.tokens]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
      className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-purple-300" />
          <span className="text-xs font-semibold" style={{ color: agent?.color || "#a78bfa" }}>
            {box.agentName}
          </span>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
            box.done
              ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
              : "border-purple-400/30 bg-purple-500/12 text-purple-200 animate-pulse",
          )}
        >
          {box.done ? "done" : "thinking\u2026"}
        </span>
      </div>

      <pre
        ref={scrollRef}
        className="max-h-40 overflow-y-auto px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words"
      >
        {box.tokens || (
          <span className="text-slate-600 italic">Waiting for tokens…</span>
        )}
      </pre>
    </motion.div>
  );
}

/* ─── Pipeline Step Bar ──────────────────────────────────────────────────── */

function PipelineBar({ stepStatuses }: { stepStatuses: Record<string, "waiting" | "running" | "done" | "error"> }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PIPELINE_STEPS.map((id, i) => {
        const agent = agents.find((a) => a.id === id);
        const status = stepStatuses[id] || "waiting";
        const Icon = agent?.icon || Target;

        return (
          <div key={id} className="flex items-center gap-1.5">
            {i > 0 && (
              <div
                className={cn(
                  "h-0.5 w-4 rounded-full transition-colors duration-500",
                  status === "done" ? "bg-emerald-400/60" : status === "running" ? "bg-sky-400/60" : "bg-white/10",
                )}
              />
            )}
            <motion.div
              animate={status === "running" ? { scale: [1, 1.08, 1] } : {}}
              transition={{ duration: 1.4, repeat: status === "running" ? Infinity : 0 }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-300",
                status === "done"
                  ? "border-emerald-400/40 bg-emerald-500/14"
                  : status === "running"
                    ? "border-sky-400/45 bg-sky-500/16"
                    : status === "error"
                      ? "border-red-400/40 bg-red-500/14"
                      : "border-white/12 bg-white/[0.03]",
              )}
              title={agent?.name}
            >
              {status === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              ) : status === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
              ) : status === "error" ? (
                <XCircle className="h-4 w-4 text-red-300" />
              ) : (
                <Icon className="h-4 w-4 text-slate-500" />
              )}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function LivePage() {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [pulsingAgents, setPulsingAgents] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [thinkingBoxes, setThinkingBoxes] = useState<Record<string, ThinkingBox>>({});
  const [stepStatuses, setStepStatuses] = useState<Record<string, "waiting" | "running" | "done" | "error">>({});
  const [pipelineActive, setPipelineActive] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNetwork, setShowNetwork] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wsUrl = getWsUrl();
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
        setReconnecting(false);
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        setReconnecting(true);
        retryTimer = setTimeout(connect, 1800);
      };

      ws.onerror = () => ws?.close();

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as Record<string, unknown>;
          const payload =
            message.payload && typeof message.payload === "object"
              ? (message.payload as Record<string, unknown>)
              : message;

          const type = String(message.type ?? "");
          const agentName = String(payload.agent_name ?? payload.agent ?? "System");
          const agentId = normalizeAgent(agentName);
          const activity = classifyEvent(type, payload);

          // ── Token streaming ──
          if (type === "thinking_start") {
            setThinkingBoxes((prev) => ({
              ...prev,
              [agentName]: { agentName, agentId, tokens: "", done: false },
            }));
            if (agentId) {
              setActiveAgents((prev) => new Set(prev).add(agentId));
              setPulsingAgents((prev) => new Set(prev).add(agentId));
            }
            return;
          }

          if (type === "token") {
            const token = String(payload.token ?? "");
            setThinkingBoxes((prev) => {
              const existing = prev[agentName];
              if (!existing) return prev;
              return { ...prev, [agentName]: { ...existing, tokens: existing.tokens + token } };
            });
            return;
          }

          if (type === "thinking_end") {
            setThinkingBoxes((prev) => {
              const existing = prev[agentName];
              if (!existing) return prev;
              return { ...prev, [agentName]: { ...existing, done: true } };
            });
            setTimeout(() => {
              setThinkingBoxes((prev) => {
                const next = { ...prev };
                delete next[agentName];
                return next;
              });
            }, 3000);
            if (agentId) {
              setActiveAgents((prev) => {
                const next = new Set(prev);
                next.delete(agentId);
                return next;
              });
            }
            return;
          }

          // ── Pipeline events ──
          if (type === "pipeline_event") {
            const status = String(payload.status ?? "").toLowerCase();
            if (status === "started") {
              setPipelineActive(true);
              setStepStatuses({});
              setThinkingBoxes({});
            } else if (status === "completed") {
              setPipelineActive(false);
              const allDone: Record<string, "done"> = {};
              PIPELINE_STEPS.forEach((id) => (allDone[id] = "done"));
              setStepStatuses(allDone);
              setActiveAgents(new Set());
              setPulsingAgents(new Set());
            }
          }

          // ── Step / result events ──
          if (type === "step" && agentId && PIPELINE_STEPS.includes(agentId)) {
            setStepStatuses((prev) => ({ ...prev, [agentId]: "running" }));
            setActiveAgents((prev) => new Set(prev).add(agentId));
            setPulsingAgents((prev) => new Set(prev).add(agentId));
          }

          if (type === "result" && agentId && PIPELINE_STEPS.includes(agentId)) {
            setStepStatuses((prev) => ({ ...prev, [agentId]: "done" }));
            setActiveAgents((prev) => {
              const next = new Set(prev);
              next.delete(agentId);
              return next;
            });
            setTimeout(() => {
              setPulsingAgents((prev) => {
                const next = new Set(prev);
                next.delete(agentId);
                return next;
              });
            }, 2000);
          }

          // ── General agent status ──
          if (agentId) {
            if (activity === "running") {
              setActiveAgents((prev) => new Set(prev).add(agentId));
              setPulsingAgents((prev) => new Set(prev).add(agentId));
            }
            if (activity === "done" || activity === "error") {
              setActiveAgents((prev) => {
                const next = new Set(prev);
                next.delete(agentId);
                return next;
              });
            }
            if (activity === "pipeline_complete") {
              setActiveAgents(new Set());
            }
          }

          // Skip pong / heartbeat / token from log
          if (type === "pong" || type === "heartbeat" || type === "token") return;

          const timestamp = String(message.timestamp ?? payload.timestamp ?? new Date().toISOString());

          setLogs((prev) => [
            ...prev.slice(-300),
            {
              id: crypto.randomUUID(),
              timestamp,
              agent: agentName,
              agentId,
              status: activity === "info" ? type || "info" : activity,
              message: toLogMessage(payload, type),
            },
          ]);
        } catch {
          // ignore malformed
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const statusLabel = useMemo(() => {
    if (connected) return "Connected";
    if (reconnecting) return "Reconnecting";
    return "Disconnected";
  }, [connected, reconnecting]);

  const thinkingBoxList = useMemo(() => Object.values(thinkingBoxes), [thinkingBoxes]);

  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 page-offset pb-20 sm:px-6 lg:px-8">
        <SubmissionBanner />
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Live Pipeline</h1>
            <p className="mt-2 text-sm text-slate-400 sm:text-base">
              Real-time agent activity, token streaming, and network visualization.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                connected
                  ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
                  : reconnecting
                    ? "border-amber-400/30 bg-amber-500/12 text-amber-200"
                    : "border-red-400/30 bg-red-500/12 text-red-200",
              )}
            >
              {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {statusLabel}
            </span>
          </div>
        </motion.div>

        {/* Pipeline step bar */}
        {pipelineActive && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass mb-6 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
                <span className="text-sm font-medium text-white">Pipeline Running</span>
              </div>
              <PipelineBar stepStatuses={stepStatuses} />
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left column — Agent network + status cards */}
          <motion.div
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6 xl:col-span-1"
          >
            {/* Agent Network Visualization */}
            <section className="glass rounded-2xl p-5">
              <button
                type="button"
                onClick={() => setShowNetwork((v) => !v)}
                className="mb-3 flex w-full items-center justify-between"
              >
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">
                  <Hexagon className="h-4 w-4 text-purple-300" />
                  Agent Network
                </h2>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-slate-500 transition-transform",
                    showNetwork ? "rotate-180" : "",
                  )}
                />
              </button>

              <AnimatePresence>
                {showNetwork && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="aspect-square w-full max-w-sm mx-auto">
                      <AgentNetworkCanvas activeAgents={activeAgents} pulsingAgents={pulsingAgents} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Agent status cards */}
            <section className="glass rounded-2xl p-5">
              <h2 className="mb-4 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">
                <Radio className="h-4 w-4 text-sky-300" />
                Agent Status
              </h2>

              <div className="space-y-2">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  const active = activeAgents.has(agent.id);

                  return (
                    <div
                      key={agent.id}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all duration-300",
                        active
                          ? "border-sky-400/35 bg-sky-500/8"
                          : "border-white/8 bg-white/[0.015]",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-lg border",
                            active
                              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
                              : "border-white/10 bg-white/[0.03] text-slate-500",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="text-xs font-medium text-white">{agent.name}</p>
                          <p className="text-[10px] text-slate-500">{agent.role}</p>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                          active
                            ? "border-sky-400/35 bg-sky-500/15 text-sky-100"
                            : "border-white/12 bg-white/[0.03] text-slate-500",
                        )}
                      >
                        {active ? "Active" : "Idle"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </motion.div>

          {/* Right column — Thinking boxes + Activity log */}
          <motion.div
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6 xl:col-span-2"
          >
            {/* Thinking boxes (token streaming) */}
            <AnimatePresence>
              {thinkingBoxList.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="glass rounded-2xl p-5"
                >
                  <h2 className="mb-4 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">
                    <Brain className="h-4 w-4 text-purple-300" />
                    Agent Reasoning
                    <span className="ml-1 rounded-full bg-purple-500/15 border border-purple-400/30 px-2 py-0.5 text-[10px] text-purple-200">
                      {thinkingBoxList.filter((b) => !b.done).length} active
                    </span>
                  </h2>

                  <div className="space-y-3">
                    <AnimatePresence>
                      {thinkingBoxList.map((box) => (
                        <ThinkingBoxUI key={box.agentName} box={box} />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Activity log */}
            <section className="glass flex min-h-[480px] flex-col rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">
                  Activity Log
                </h2>

                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-slate-400">
                    {logs.length} events
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutoScroll((v) => !v)}
                    className={cn(
                      "rounded-lg px-2 py-1 text-[10px] font-medium transition",
                      autoScroll
                        ? "border border-sky-400/30 bg-sky-500/12 text-sky-200"
                        : "border border-white/12 bg-white/[0.03] text-slate-400",
                    )}
                  >
                    Auto-scroll {autoScroll ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400 transition hover:bg-white/[0.06]"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div ref={logRef} className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {logs.length === 0 ? (
                    <div className="py-20 text-center text-sm text-slate-600">Waiting for pipeline events…</div>
                  ) : (
                    logs.map((entry) => {
                      const agent = agents.find((a) => a.id === entry.agentId);
                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="rounded-lg border border-white/8 bg-white/[0.015] px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-600">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${statusBadgeCls(entry.status)}`}
                            >
                              {entry.status}
                            </span>
                            <span
                              className="text-xs font-semibold"
                              style={{ color: agent?.color || "#94a3b8" }}
                            >
                              {entry.agent}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">{entry.message}</p>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </section>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

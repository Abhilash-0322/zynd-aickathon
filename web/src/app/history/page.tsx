"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Hexagon,
  Link2,
  Loader2,
  LogIn,
  Scale,
  ScrollText,
  Shield,
  Target,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { cn } from "@/lib/utils";
import {
  getHistory,
  getHistoryDetail,
  type AgentThinkingRecord,
  type HistoryDetail,
  type HistorySummary,
  type PipelineEventRecord,
} from "@/lib/api";

/* ─── Agent metadata ─────────────────────────────────────────────────────── */

const AGENT_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  orchestrator: { icon: Hexagon, color: "#7c3aed", label: "Orchestrator" },
  privacy: { icon: Shield, color: "#06b6d4", label: "Privacy Guardian" },
  bias: { icon: Scale, color: "#f59e0b", label: "Bias Detector" },
  skill: { icon: Target, color: "#10b981", label: "Skill Verifier" },
  matcher: { icon: Link2, color: "#a78bfa", label: "Candidate Matcher" },
  credential: { icon: ScrollText, color: "#ef4444", label: "Credential Issuer" },
};

function normalizeAgentKey(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  if (n.includes("orchestrator")) return "orchestrator";
  if (n.includes("privacy")) return "privacy";
  if (n.includes("bias")) return "bias";
  if (n.includes("skill")) return "skill";
  if (n.includes("matcher") || n.includes("match")) return "matcher";
  if (n.includes("credential")) return "credential";
  return "";
}

function getAgentMeta(name: string) {
  const key = normalizeAgentKey(name);
  return AGENT_META[key] || { icon: Brain, color: "#94a3b8", label: name };
}

/* ─── Score ring component ───────────────────────────────────────────────── */

function ScoreRing({ score, size = 48, stroke = 4, color }: { score: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const normalizedScore = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (normalizedScore / 100) * circumference;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  );
}

/* ─── Thinking Box (replay mode) ─────────────────────────────────────────── */

function ThinkingReplay({ thinking }: { thinking: AgentThinkingRecord }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getAgentMeta(thinking.agent_name);
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border"
            style={{ borderColor: meta.color + "40", background: meta.color + "15" }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
          </span>
          <span className="text-xs font-semibold" style={{ color: meta.color }}>
            {thinking.agent_name}
          </span>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2 py-0.5 text-[10px] text-emerald-200">
            {thinking.thinking_text.length.toLocaleString()} chars
          </span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <pre className="max-h-64 overflow-y-auto border-t border-white/8 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
              {thinking.thinking_text}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Event log replay ───────────────────────────────────────────────────── */

function EventLogReplay({ events }: { events: PipelineEventRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? events : events.slice(0, 5);

  return (
    <div className="space-y-1.5">
      {displayed.map((ev) => {
        const meta = getAgentMeta(ev.agent_name);
        return (
          <div
            key={ev.id}
            className="flex items-start gap-2.5 rounded-lg border border-white/8 bg-white/[0.015] px-3 py-2"
          >
            <span className="mt-0.5 text-[10px] font-mono text-slate-600 shrink-0">
              {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "—"}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase",
                ev.event_type === "result" || ev.event_type === "thinking_end"
                  ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
                  : ev.event_type === "error"
                    ? "border-red-400/30 bg-red-500/12 text-red-200"
                    : ev.event_type === "step" || ev.event_type === "thinking_start"
                      ? "border-sky-400/30 bg-sky-500/12 text-sky-200"
                      : "border-white/12 bg-white/[0.03] text-slate-400",
              )}
            >
              {ev.event_type}
            </span>
            <span className="text-xs font-semibold shrink-0" style={{ color: meta.color }}>
              {ev.agent_name}
            </span>
            <span className="text-xs text-slate-400 truncate">{ev.step || "—"}</span>
          </div>
        );
      })}

      {events.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.06]"
        >
          {expanded ? "Show less" : `Show all ${events.length} events`}
        </button>
      )}
    </div>
  );
}

/* ─── History Card ───────────────────────────────────────────────────────── */

function HistoryCard({ item }: { item: HistorySummary }) {
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadDetail = useCallback(async () => {
    if (detail) {
      setExpanded((v) => !v);
      return;
    }
    setLoading(true);
    try {
      const d = await getHistoryDetail(item.conversation_id);
      setDetail(d);
      setExpanded(true);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [detail, item.conversation_id]);

  const statusColor =
    item.status === "completed"
      ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
      : item.status === "failed"
        ? "border-red-400/30 bg-red-500/12 text-red-200"
        : item.status === "processing"
          ? "border-sky-400/30 bg-sky-500/12 text-sky-200"
          : "border-white/12 bg-white/[0.03] text-slate-400";

  const overallScore = item.scores?.overall ?? 0;
  const scoreColor =
    overallScore >= 75 ? "#10b981" : overallScore >= 50 ? "#f59e0b" : overallScore >= 25 ? "#ef4444" : "#64748b";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl overflow-hidden"
    >
      {/* Card header */}
      <button
        type="button"
        onClick={loadDetail}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* Score ring */}
          {item.has_result && (
            <div className="relative shrink-0">
              <ScoreRing score={overallScore} color={scoreColor} />
              <span
                className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                style={{ color: scoreColor }}
              >
                {Math.round(overallScore)}
              </span>
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white truncate">
                {item.job_title || `Pipeline Run`}
              </span>
              {item.company && (
                <span className="text-xs text-slate-500">@ {item.company}</span>
              )}
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase", statusColor)}>
                {item.status}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : "—"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {item.submitted_at ? new Date(item.submitted_at).toLocaleTimeString() : "—"}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {item.event_count} events
              </span>
              {item.has_thinkings && (
                <span className="flex items-center gap-1 text-purple-300">
                  <Brain className="h-3 w-3" />
                  thinking data
                </span>
              )}
            </div>

            {item.recommendation && (
              <p className="mt-1 text-xs text-slate-400 truncate max-w-md">
                {item.recommendation}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
          ) : (
            <ChevronRight className={cn("h-5 w-5 text-slate-500 transition-transform", expanded && "rotate-90")} />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 p-5 space-y-6">
              {/* Scores grid */}
              {detail.scores && (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Evaluation Scores
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[
                      { label: "Privacy", value: detail.scores.privacy, color: "#06b6d4" },
                      { label: "Bias-Free", value: detail.scores.bias_free, color: "#f59e0b" },
                      { label: "Skill", value: detail.scores.skill, color: "#10b981" },
                      { label: "Match", value: detail.scores.match, color: "#a78bfa" },
                      { label: "Overall", value: detail.scores.overall, color: scoreColor },
                    ].map((s) => (
                      <div key={s.label} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.015] p-3">
                        <div className="relative">
                          <ScoreRing score={s.value} size={40} stroke={3} color={s.color} />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: s.color }}>
                            {Math.round(s.value)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Result summary */}
              {detail.result && (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Executive Summary
                  </h3>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {String((detail.result as Record<string, unknown>).executive_summary ?? "No summary available.")}
                    </p>
                    {Array.isArray((detail.result as Record<string, unknown>).key_strengths) && (
                      <div className="mt-3">
                        <span className="text-[10px] uppercase tracking-wider text-emerald-300">Key Strengths</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {((detail.result as Record<string, unknown>).key_strengths as string[]).map((s: string, i: number) => (
                            <span key={i} className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex justify-end">
                    <Link
                      href={`/results?id=${item.conversation_id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-sky-300 transition hover:text-sky-200"
                    >
                      View full results <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              )}

              {/* Agent thinking */}
              {detail.thinkings && detail.thinkings.length > 0 && (
                <div>
                  <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    <Brain className="h-3.5 w-3.5 text-purple-300" />
                    Agent Reasoning ({detail.thinkings.length} agents)
                  </h3>
                  <div className="space-y-2">
                    {detail.thinkings.map((t) => (
                      <ThinkingReplay key={t.id} thinking={t} />
                    ))}
                  </div>
                </div>
              )}

              {/* Pipeline events */}
              {detail.events && detail.events.length > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Pipeline Events ({detail.events.length})
                  </h3>
                  <EventLogReplay events={detail.events} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function HistoryPage() {
  const [history, setHistory] = useState<HistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getHistory();
        if (active) setHistory(data);
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : "Failed to load history";
          if (msg.includes("401") || msg.includes("Authentication")) {
            setError("auth");
          } else {
            setError(msg);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 page-offset pb-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Pipeline History</h1>
          <p className="mt-2 text-sm text-slate-400 sm:text-base">
            Review past evaluations — agent reasoning, events, scores, and results are all persisted.
          </p>
        </motion.div>

        {loading ? (
          <div className="glass rounded-2xl p-16 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-300" />
            <p className="mt-4 text-sm text-slate-400">Loading pipeline history…</p>
          </div>
        ) : error === "auth" ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-12 text-center"
          >
            <LogIn className="mx-auto h-10 w-10 text-slate-500" />
            <h2 className="mt-4 text-lg font-semibold text-white">Sign in to view history</h2>
            <p className="mt-2 text-sm text-slate-400">
              Pipeline run history is linked to your account. Sign in to see your past evaluations.
            </p>
            <Link
              href="/auth/login"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(14,165,233,0.28)] transition hover:brightness-110"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </motion.div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-8 text-center"
          >
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        ) : history.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-12 text-center"
          >
            <FileText className="mx-auto h-10 w-10 text-slate-500" />
            <h2 className="mt-4 text-lg font-semibold text-white">No evaluations yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Submit an application to see your pipeline run history here.
            </p>
            <Link
              href="/apply"
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/12 px-5 py-2 text-sm text-sky-200 transition hover:bg-sky-500/20"
            >
              Submit application
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-400">
                {history.length} evaluation{history.length !== 1 ? "s" : ""}
              </span>
            </div>

            <AnimatePresence>
              {history.map((item) => (
                <HistoryCard key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

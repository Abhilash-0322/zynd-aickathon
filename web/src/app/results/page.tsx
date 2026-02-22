"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  ChevronDown,
  ChevronUp,
  FileText,
  Fingerprint,
  Hash,
  Inbox,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { API_URL, normalizeScore } from "@/lib/utils";

interface AppResult {
  id: string;
  conversation_id?: string;
  candidate_name?: string;
  job_title?: string;
  status: string;
  submitted_at?: string;
  completed_at?: string;
  result?: Record<string, unknown>;
  events?: Array<{
    event_type?: string;
    agent_name?: string;
    data?: Record<string, unknown>;
    status?: string;
  }>;
}

interface SkillConfidence {
  name: string;
  confidence: number;
}

interface NormalizedResult {
  overall: number;
  matchScore: number;
  skillScore: number;
  biasScore: number;
  privacyScore: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  verifiedSkills: SkillConfidence[];
  credentialId: string;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const maybeText = (item as Record<string, unknown>).text ?? (item as Record<string, unknown>).name;
        if (typeof maybeText === "string") return maybeText;
      }
      return "";
    })
    .filter(Boolean);
}

function toSkills(value: unknown): SkillConfidence[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const name =
        (typeof item.name === "string" && item.name) ||
        (typeof item.skill === "string" && item.skill) ||
        "";

      const rawConfidence = item.confidence ?? item.score ?? item.match;
      const confidence = typeof rawConfidence === "number" ? normalizeScore(rawConfidence) : 0;

      if (!name) return null;
      return { name, confidence };
    })
    .filter((item): item is SkillConfidence => Boolean(item));
}

function firstNonEmptyStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const parsed = asStringArray(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function firstNonEmptySkills(...values: unknown[]): SkillConfidence[] {
  for (const value of values) {
    const parsed = toSkills(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function extractFromEvents(app: AppResult): Record<string, unknown> {
  const completeEvent = app.events?.find((evt) => evt.event_type === "pipeline_complete");
  const data = completeEvent?.data;
  if (!data) return {};
  if (asObject(data.results)) return asObject(data.results) as Record<string, unknown>;
  return data;
}

function normalizeResult(app: AppResult): NormalizedResult {
  const resultObj = asObject(app.result) ?? {};
  const rawResult = asObject(resultObj.raw_result);
  const summary = asObject(resultObj.summary) ?? asObject(rawResult?.summary) ?? {};
  const pipeline = asObject(resultObj.pipeline_results) ?? asObject(rawResult?.pipeline_results) ?? {};

  const matching = asObject(pipeline.matching);
  const skillVerification = asObject(pipeline.skill_verification);
  const credential = asObject(pipeline.credential);
  const finalDecision = asObject(pipeline.final_decision);
  const fallback = extractFromEvents(app);

  const recommendationRaw =
    summary.recommendation ||
    summary.final_decision ||
    finalDecision?.final_recommendation ||
    matching?.recommendation ||
    fallback.recommendation ||
    "HOLD";

  const recommendation = String(recommendationRaw).toUpperCase();

  const executiveSummary =
    summary.executive_summary ||
    finalDecision?.executive_summary ||
    fallback.executive_summary ||
    "";

  const strengths = firstNonEmptyStringArray(
    summary.key_strengths,
    finalDecision?.key_strengths,
    fallback.key_strengths,
  );

  const gaps = firstNonEmptyStringArray(
    summary.skill_gaps,
    matching?.skill_gaps,
    fallback.skill_gaps,
  );

  const verifiedSkills = firstNonEmptySkills(
    summary.verified_skills,
    skillVerification?.verified_skills,
    fallback.verified_skills,
  );

  const credentialRaw =
    summary.credential_id || credential?.credential_id || fallback.credential_id || "";
  const credentialId = typeof credentialRaw === "string" ? credentialRaw : "";

  return {
    overall: normalizeScore(Number(summary.overall_score ?? resultObj.overall_score ?? fallback.overall_score ?? 0)),
    matchScore: normalizeScore(Number(summary.match_score ?? resultObj.match_score ?? fallback.match_score ?? 0)),
    skillScore: normalizeScore(Number(summary.skill_score ?? resultObj.skill_score ?? fallback.skill_score ?? 0)),
    biasScore: normalizeScore(Number(summary.bias_free_score ?? resultObj.bias_free_score ?? fallback.bias_free_score ?? 0)),
    privacyScore: normalizeScore(Number(summary.privacy_score ?? resultObj.privacy_score ?? fallback.privacy_score ?? 0)),
    recommendation,
    summary: String(executiveSummary || ""),
    strengths,
    gaps,
    verifiedSkills,
    credentialId,
  };
}

function ScoreCircle({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  const circumference = 2 * Math.PI * 35;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="6" />
          <motion.circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-white">{pct}%</span>
        </div>
      </div>
      <span className="text-[11px] uppercase tracking-[0.1em] text-slate-400">{label}</span>
    </div>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const upper = recommendation.toUpperCase();

  const styles: Record<string, string> = {
    ADVANCE: "border-emerald-400/30 bg-emerald-500/12 text-emerald-200",
    HOLD: "border-amber-400/30 bg-amber-500/12 text-amber-200",
    REJECT: "border-red-400/30 bg-red-500/12 text-red-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${styles[upper] || styles.HOLD}`}
    >
      <Award className="h-3.5 w-3.5" />
      {upper}
    </span>
  );
}

function ResultCard({ app }: { app: AppResult }) {
  const [expanded, setExpanded] = useState(false);
  const data = normalizeResult(app);

  return (
    <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{app.candidate_name || app.conversation_id || app.id}</h2>
          <p className="mt-1 text-sm text-slate-400">{app.job_title || "Application"}</p>
        </div>

        <RecommendationBadge recommendation={data.recommendation} />
      </div>

      <div className="mb-6 grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <ScoreCircle label="Overall" value={data.overall} color="#22d3ee" />
        <ScoreCircle label="Match" value={data.matchScore} color="#34d399" />
        <ScoreCircle label="Skill" value={data.skillScore} color="#38bdf8" />
        <ScoreCircle label="Bias-Free" value={data.biasScore} color="#22c55e" />
        <ScoreCircle label="Privacy" value={data.privacyScore} color="#f59e0b" />
      </div>

      {data.summary ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="mb-1 inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Executive Summary
          </p>
          <p className="text-sm leading-relaxed text-slate-200">{data.summary}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mx-auto mt-5 inline-flex items-center gap-1 text-sm text-sky-300 transition hover:text-sky-200"
      >
        {expanded ? "Hide details" : "Show details"}
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <section>
                  <p className="mb-2 inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Key strengths
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {data.strengths.length > 0 ? (
                      data.strengths.map((item, idx) => (
                        <span
                          key={`${item}-${idx}`}
                          className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No strengths listed.</span>
                    )}
                  </div>
                </section>

                <section>
                  <p className="mb-2 inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-400">
                    <Target className="h-3.5 w-3.5" />
                    Skill gaps
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {data.gaps.length > 0 ? (
                      data.gaps.map((item, idx) => (
                        <span
                          key={`${item}-${idx}`}
                          className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No major gaps detected.</span>
                    )}
                  </div>
                </section>
              </div>

              {data.verifiedSkills.length > 0 ? (
                <section>
                  <p className="mb-3 inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Verified skills
                  </p>

                  <div className="space-y-2">
                    {data.verifiedSkills.map((skill, idx) => (
                      <div key={`${skill.name}-${idx}`} className="flex items-center gap-3">
                        <span className="w-32 truncate text-xs text-slate-300">{skill.name}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${skill.confidence}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.05 }}
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
                          />
                        </div>
                        <span className="w-10 text-right text-xs text-slate-400">{Math.round(skill.confidence)}%</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {data.credentialId ? (
                <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
                  <Fingerprint className="h-4 w-4 shrink-0" />
                  <span className="text-xs uppercase tracking-[0.08em] text-sky-100/80">Credential</span>
                  <code className="truncate text-xs font-mono">
                    <Hash className="mr-1 inline h-3 w-3" />
                    {data.credentialId}
                  </code>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function normalizeApplications(payload: unknown): AppResult[] {
  if (Array.isArray(payload)) return payload as AppResult[];

  if (payload && typeof payload === "object") {
    if ("applications" in payload && Array.isArray((payload as { applications?: unknown }).applications)) {
      return (payload as { applications: AppResult[] }).applications;
    }

    return Object.values(payload) as AppResult[];
  }

  return [];
}

export default function ResultsPage() {
  const [apps, setApps] = useState<AppResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/applications`);
        if (!res.ok) throw new Error("Unable to load application results");
        const data = await res.json();

        if (!active) return;

        const all = normalizeApplications(data);
        const completed = all.filter((app) => {
          const status = String(app.status || "").toLowerCase();
          return status === "completed" || Boolean(app.result);
        });

        setApps(completed);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load results");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const sortedApps = useMemo(
    () => [...apps].sort((a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()),
    [apps],
  );

  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 page-offset pb-20 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Evaluation Results</h1>
          <p className="mt-2 text-sm text-slate-400 sm:text-base">
            Completed assessments from the full multi-agent hiring pipeline.
          </p>
        </motion.div>

        {loading ? (
          <div className="py-20 text-center text-slate-400">Loading results…</div>
        ) : error ? (
          <div className="glass rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-200">{error}</div>
        ) : sortedApps.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <Inbox className="mx-auto h-12 w-12 text-slate-600" />
            <h2 className="mt-4 text-lg font-semibold text-white">No completed results yet</h2>
            <p className="mt-1 text-sm text-slate-400">Submit an application to start evaluation.</p>
            <Link
              href="/apply"
              className="mt-6 inline-flex rounded-lg border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-sm text-sky-200 transition hover:bg-sky-500/20"
            >
              Submit application
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedApps.map((app) => (
              <ResultCard key={app.id || app.conversation_id} app={app} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

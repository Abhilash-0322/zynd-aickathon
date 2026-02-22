"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  Scale,
  ScrollText,
  Send,
  Shield,
  Sparkles,
  Target,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/layout/Navbar";
import { API_URL, getWsUrl } from "@/lib/utils";

interface PipelineStep {
  name: string;
  icon: React.ElementType;
  status: "waiting" | "running" | "done" | "error";
}

const demoCandidate = {
  name: "Alex Rivera",
  email: "alex.rivera@example.com",
  experience_years: "5",
  education: "BS Computer Science",
  skills: "TypeScript, React, Node.js, Python, AWS, Docker",
  experience_summary:
    "Full-stack engineer with 5 years building scalable platforms and leading delivery on product-critical systems.",
  github_url: "https://github.com/alexrivera",
  portfolio_url: "https://alexrivera.dev",
  certifications: "AWS Solutions Architect",
  cover_letter:
    "I value building equitable systems and measurable hiring processes. I can contribute across architecture and execution.",
};

const demoJob = {
  title: "Senior Full-Stack Engineer",
  description:
    "Build and maintain our hiring platform. Work across React, APIs, and cloud infrastructure.",
  requirements: "React, TypeScript, Node.js, REST APIs, 4+ years",
  nice_to_have: "Docker, AWS, CI/CD",
  experience_years: "4",
  company: "Zynd Protocol",
  salary_range: "$140k - $180k",
};

interface ThinkingBox {
  agentName: string;
  tokens: string;
  done: boolean;
}

const AGENT_COLORS: Record<string, string> = {
  privacyguardian: "#06b6d4",
  privacy: "#06b6d4",
  biasdetector: "#f59e0b",
  bias: "#f59e0b",
  skillverifier: "#10b981",
  skill: "#10b981",
  candidatematcher: "#a78bfa",
  matcher: "#a78bfa",
  credentialissuer: "#ef4444",
  credential: "#ef4444",
};

function getAgentColor(name: string): string {
  const key = normalizeAgentName(name);
  for (const [k, v] of Object.entries(AGENT_COLORS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return "#a78bfa";
}

const defaultSteps: PipelineStep[] = [
  { name: "Privacy Guardian", icon: Shield, status: "waiting" },
  { name: "Bias Detector", icon: Scale, status: "waiting" },
  { name: "Skill Verifier", icon: Target, status: "waiting" },
  { name: "Candidate Matcher", icon: Link2, status: "waiting" },
  { name: "Credential Issuer", icon: ScrollText, status: "waiting" },
];

const AGENT_INDEX: Record<string, number> = {
  privacyguardian: 0,
  privacyagent: 0,
  privacy: 0,
  biasdetector: 1,
  bias: 1,
  skillverifier: 2,
  skill: 2,
  candidatematcher: 3,
  matcher: 3,
  credentialissuer: 4,
  credentialagent: 4,
  credential: 4,
};

function normalizeAgentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function getAgentIndex(name: string): number | undefined {
  const normalized = normalizeAgentName(name);

  if (AGENT_INDEX[normalized] !== undefined) {
    return AGENT_INDEX[normalized];
  }

  for (const [key, idx] of Object.entries(AGENT_INDEX)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return idx;
    }
  }

  return undefined;
}

function getConversationId(message: Record<string, unknown>, payload: Record<string, unknown>): string | null {
  const direct =
    payload.conversation_id ||
    payload.application_id ||
    message.conversation_id ||
    message.application_id;

  if (typeof direct === "string" && direct.trim()) return direct;

  const result = payload.result;
  if (result && typeof result === "object" && "conversation_id" in result) {
    const nested = (result as { conversation_id?: unknown }).conversation_id;
    if (typeof nested === "string" && nested.trim()) return nested;
  }

  return null;
}

function classifyEvent(msgType: string, payload: Record<string, unknown>): "running" | "done" | "error" | "pipeline_complete" | "info" {
  const eventType = String(payload.event_type ?? "").toLowerCase();
  const status = String(payload.status ?? "").toLowerCase();

  if (
    msgType === "error" ||
    eventType.includes("error") ||
    status.includes("error") ||
    status.includes("failed")
  ) {
    return "error";
  }

  if (
    msgType === "pipeline_result" ||
    (msgType === "pipeline_event" && status.includes("completed")) ||
    eventType === "pipeline_complete"
  ) {
    return "pipeline_complete";
  }

  if (
    msgType === "result" ||
    msgType === "thinking_end" ||
    eventType.includes("complete") ||
    status === "complete" ||
    status === "completed" ||
    status === "done"
  ) {
    return "done";
  }

  if (
    msgType === "step" ||
    msgType === "thinking_start" ||
    eventType.includes("start") ||
    status === "running" ||
    status === "processing" ||
    status === "started"
  ) {
    return "running";
  }

  return "info";
}

function ApplyPageInner() {
  const searchParams = useSearchParams();
  const selectedJobId = searchParams.get("jobId");
  const router = useRouter();

  const [candidate, setCandidate] = useState({
    name: "",
    email: "",
    experience_years: "",
    education: "",
    skills: "",
    experience_summary: "",
    github_url: "",
    portfolio_url: "",
    certifications: "",
    cover_letter: "",
  });

  const [job, setJob] = useState({
    title: "",
    description: "",
    requirements: "",
    nice_to_have: "",
    experience_years: "",
    company: "",
    salary_range: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamConversationId, setStreamConversationId] = useState<string | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(defaultSteps);
  const [error, setError] = useState<string | null>(null);
  const [thinkingBoxes, setThinkingBoxes] = useState<Record<string, ThinkingBox>>({});

  // Resume upload state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeMsg, setResumeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const conversationRef = useRef<string | null>(null);
  const streamConversationRef = useRef<string | null>(null);

  useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    streamConversationRef.current = streamConversationId;
  }, [streamConversationId]);

  useEffect(() => {
    if (!selectedJobId) return;

    let active = true;
    setJobLoading(true);

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/jobs/${encodeURIComponent(selectedJobId)}`);
        if (!res.ok) throw new Error("Unable to load selected job");
        const data = await res.json();

        if (!active) return;

        setJob({
          title: data.title || "",
          description: data.description || "",
          requirements: Array.isArray(data.requirements) ? data.requirements.join(", ") : "",
          nice_to_have: Array.isArray(data.nice_to_have) ? data.nice_to_have.join(", ") : "",
          experience_years: data.experience_years ? String(data.experience_years) : "",
          company: data.company || "",
          salary_range: data.salary_range || "",
        });
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load selected job");
      } finally {
        if (active) setJobLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedJobId]);

  useEffect(() => {
    if (!conversationId) return;

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as Record<string, unknown>;
        const payload =
          message.payload && typeof message.payload === "object"
            ? (message.payload as Record<string, unknown>)
            : message;

        const msgType = String(message.type ?? "");
        const eventConversationId = getConversationId(message, payload);
        const currentConversation = conversationRef.current;
        const currentStreamConversation = streamConversationRef.current;

        if (
          !currentStreamConversation &&
          eventConversationId &&
          eventConversationId !== currentConversation &&
          (msgType === "pipeline_event" || msgType === "step" || msgType === "thinking_start")
        ) {
          setStreamConversationId(eventConversationId);
        }

        const trackedConversation = currentStreamConversation || currentConversation;
        if (trackedConversation && eventConversationId && eventConversationId !== trackedConversation) {
          return;
        }

        const agentName = String(payload.agent_name ?? payload.agent ?? "");
        const agentIdx = getAgentIndex(agentName);
        const eventClass = classifyEvent(msgType, payload);

        // ── Token streaming ──
        if (msgType === "thinking_start" && agentName) {
          setThinkingBoxes((prev) => ({
            ...prev,
            [agentName]: { agentName, tokens: "", done: false },
          }));
          // Don't return — also update pipeline steps
        }

        if (msgType === "token" && agentName) {
          const token = String(payload.token ?? "");
          setThinkingBoxes((prev) => {
            const existing = prev[agentName];
            if (!existing) return prev;
            return { ...prev, [agentName]: { ...existing, tokens: existing.tokens + token } };
          });
          return; // Don't add to pipeline log
        }

        if (msgType === "thinking_end" && agentName) {
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
        }

        setPipelineSteps((prev) => {
          const next = [...prev];

          if (eventClass === "pipeline_complete") {
            return next.map((step) => ({ ...step, status: "done" as const }));
          }

          if (agentIdx !== undefined) {
            if (eventClass === "running") {
              next[agentIdx] = { ...next[agentIdx], status: "running" };
              for (let i = 0; i < agentIdx; i += 1) {
                if (next[i].status !== "done") {
                  next[i] = { ...next[i], status: "done" };
                }
              }
            }

            if (eventClass === "done") {
              next[agentIdx] = { ...next[agentIdx], status: "done" };
            }

            if (eventClass === "error") {
              next[agentIdx] = { ...next[agentIdx], status: "error" };
            }
          }

          return next;
        });
      } catch {
        // Ignore malformed websocket payloads
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [conversationId]);

  function loadDemo() {
    setCandidate(demoCandidate);
    setResumeMsg(null);
    setResumeFile(null);
    setResumeId(null);
    setJob(demoJob);
  }

  async function handleResumeUpload(file: File) {
    setResumeFile(file);
    setResumeMsg(null);
    setResumeParsing(true);
    setResumeId(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = Cookies.get("zynd_token");
      const res = await fetch(`${API_URL}/api/resume/parse`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Parse failed");
      }
      const data = await res.json() as {
        resume_id: string | null;
        parsed: {
          name?: string; email?: string; experience_years?: number;
          education?: string; skills?: string[]; experience_summary?: string;
          github_url?: string; portfolio_url?: string;
          certifications?: string[]; cover_letter?: string;
        };
      };
      if (data.resume_id) setResumeId(data.resume_id);
      const p = data.parsed;
      setCandidate((prev) => ({
        ...prev,
        name: p.name || prev.name,
        email: p.email || prev.email,
        experience_years: p.experience_years != null ? String(p.experience_years) : prev.experience_years,
        education: p.education || prev.education,
        skills: Array.isArray(p.skills) && p.skills.length ? p.skills.join(", ") : prev.skills,
        experience_summary: p.experience_summary || prev.experience_summary,
        github_url: p.github_url || prev.github_url,
        portfolio_url: p.portfolio_url || prev.portfolio_url,
        certifications: Array.isArray(p.certifications) && p.certifications.length ? p.certifications.join(", ") : prev.certifications,
        cover_letter: prev.cover_letter, // keep existing cover letter
      }));
      setResumeMsg({ type: "success", text: `✓ Resume parsed — fields pre-filled from ${file.name}` });
    } catch (err: unknown) {
      setResumeMsg({ type: "error", text: err instanceof Error ? err.message : "Upload failed" });
      setResumeFile(null);
    } finally {
      setResumeParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setConversationId(null);
    setStreamConversationId(null);
    setPipelineSteps(defaultSteps.map((step) => ({ ...step, status: "waiting" })));
    setThinkingBoxes({});

    try {
      const body = {
        candidate: {
          name: candidate.name,
          email: candidate.email,
          experience_years: parseInt(candidate.experience_years, 10) || 0,
          education: candidate.education,
          skills: candidate.skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          experience_summary: candidate.experience_summary,
          github_url: candidate.github_url,
          portfolio_url: candidate.portfolio_url,
          certifications: candidate.certifications
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          cover_letter: candidate.cover_letter,
        },
        job_id: selectedJobId || undefined,
        resume_id: resumeId || undefined,
        job: {
          title: job.title,
          description: job.description,
          requirements: job.requirements
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          nice_to_have: job.nice_to_have
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          experience_years: parseInt(job.experience_years, 10) || 0,
          company: job.company,
          salary_range: job.salary_range,
        },
      };

      const token = Cookies.get("zynd_token");
      const res = await fetch(`${API_URL}/api/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Submission failed");
      }

      const data = await res.json();
      const id = data.conversation_id || data.application_id || data.id;
      if (!id) {
        throw new Error("Application submitted but no tracking ID returned");
      }

      setConversationId(String(id));
      router.push(`/live?id=${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/45 focus:ring-2 focus:ring-sky-500/20";

  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 page-offset pb-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Submit Application</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            Provide candidate and job details. The pipeline will stream each agent step in real time.
          </p>

          <button
            type="button"
            onClick={loadDemo}
            className="mt-4 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
          >
            Load demo data
          </button>

          {jobLoading ? (
            <p className="mt-3 text-xs text-slate-500">Loading selected job details…</p>
          ) : null}
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.section
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass rounded-2xl p-6"
            >
              <h2 className="mb-5 inline-flex items-center gap-2 text-lg font-semibold text-white">
                <Sparkles className="h-5 w-5 text-sky-300" />
                Candidate profile
              </h2>

              {/* ── Resume upload dropzone ── */}
              <div className="mb-5">
                <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Resume upload</label>
                <div
                  className={cn(
                    "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition",
                    resumeParsing
                      ? "border-sky-500/40 bg-sky-500/5"
                      : resumeMsg?.type === "success"
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-white/15 bg-white/[0.02] hover:border-sky-400/40 hover:bg-white/[0.04]",
                  )}
                  onClick={() => !resumeParsing && resumeInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f && !resumeParsing) handleResumeUpload(f);
                  }}
                >
                  <input
                    ref={resumeInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleResumeUpload(f);
                      e.target.value = "";
                    }}
                  />

                  {resumeParsing ? (
                    <>
                      <Loader2 className="mb-2 h-7 w-7 animate-spin text-sky-400" />
                      <p className="text-sm text-sky-300">Parsing resume with AI…</p>
                    </>
                  ) : resumeFile && resumeMsg?.type === "success" ? (
                    <>
                      <FileText className="mb-2 h-7 w-7 text-emerald-400" />
                      <p className="text-center text-sm font-medium text-emerald-300">{resumeMsg.text}</p>
                      <p className="mt-1 text-xs text-slate-500">{resumeFile.name} · {(resumeFile.size / 1024).toFixed(0)} KB</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setResumeFile(null); setResumeId(null); setResumeMsg(null); }}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                      >
                        <X className="h-3 w-3" /> Clear
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="mb-2 h-7 w-7 text-slate-400" />
                      <p className="text-sm text-slate-300">Drop your resume here or <span className="text-sky-400">browse</span></p>
                      <p className="mt-1 text-xs text-slate-500">PDF, DOCX, TXT · up to 5 MB · fields auto-filled by AI</p>
                      {resumeMsg?.type === "error" && (
                        <p className="mt-2 text-xs text-red-400">{resumeMsg.text}</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Full name</label>
                  <input
                    required
                    value={candidate.name}
                    onChange={(e) => setCandidate({ ...candidate, name: e.target.value })}
                    className={inputCls}
                    placeholder="Jane Doe"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Email</label>
                  <input
                    type="email"
                    value={candidate.email}
                    onChange={(e) => setCandidate({ ...candidate, email: e.target.value })}
                    className={inputCls}
                    placeholder="jane@company.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Experience (yrs)</label>
                    <input
                      type="number"
                      min={0}
                      value={candidate.experience_years}
                      onChange={(e) => setCandidate({ ...candidate, experience_years: e.target.value })}
                      className={inputCls}
                      placeholder="5"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Education</label>
                    <input
                      value={candidate.education}
                      onChange={(e) => setCandidate({ ...candidate, education: e.target.value })}
                      className={inputCls}
                      placeholder="BS Computer Science"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Skills</label>
                  <input
                    value={candidate.skills}
                    onChange={(e) => setCandidate({ ...candidate, skills: e.target.value })}
                    className={inputCls}
                    placeholder="React, TypeScript, Node.js"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Experience summary</label>
                  <textarea
                    rows={3}
                    value={candidate.experience_summary}
                    onChange={(e) =>
                      setCandidate({
                        ...candidate,
                        experience_summary: e.target.value,
                      })
                    }
                    className={`${inputCls} resize-none`}
                    placeholder="Short summary of recent achievements and responsibilities"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">GitHub URL</label>
                    <input
                      value={candidate.github_url}
                      onChange={(e) => setCandidate({ ...candidate, github_url: e.target.value })}
                      className={inputCls}
                      placeholder="https://github.com/username"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Portfolio URL</label>
                    <input
                      value={candidate.portfolio_url}
                      onChange={(e) => setCandidate({ ...candidate, portfolio_url: e.target.value })}
                      className={inputCls}
                      placeholder="https://portfolio.site"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Certifications</label>
                  <input
                    value={candidate.certifications}
                    onChange={(e) => setCandidate({ ...candidate, certifications: e.target.value })}
                    className={inputCls}
                    placeholder="AWS Solutions Architect"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Cover letter</label>
                  <textarea
                    rows={3}
                    value={candidate.cover_letter}
                    onChange={(e) => setCandidate({ ...candidate, cover_letter: e.target.value })}
                    className={`${inputCls} resize-none`}
                    placeholder="Brief motivation for the role"
                  />
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass rounded-2xl p-6"
            >
              <h2 className="mb-5 inline-flex items-center gap-2 text-lg font-semibold text-white">
                <Target className="h-5 w-5 text-emerald-300" />
                Job details
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Job title</label>
                  <input
                    required
                    value={job.title}
                    onChange={(e) => setJob({ ...job, title: e.target.value })}
                    className={inputCls}
                    placeholder="Senior Full-Stack Engineer"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Company</label>
                  <input
                    value={job.company}
                    onChange={(e) => setJob({ ...job, company: e.target.value })}
                    className={inputCls}
                    placeholder="Zynd Protocol"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Description</label>
                  <textarea
                    required
                    rows={4}
                    value={job.description}
                    onChange={(e) => setJob({ ...job, description: e.target.value })}
                    className={`${inputCls} resize-none`}
                    placeholder="Role scope and expected outcomes"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Requirements</label>
                  <input
                    value={job.requirements}
                    onChange={(e) => setJob({ ...job, requirements: e.target.value })}
                    className={inputCls}
                    placeholder="React, TypeScript, APIs"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Nice to have</label>
                  <input
                    value={job.nice_to_have}
                    onChange={(e) => setJob({ ...job, nice_to_have: e.target.value })}
                    className={inputCls}
                    placeholder="Kubernetes, GraphQL"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Experience (yrs)</label>
                    <input
                      type="number"
                      min={0}
                      value={job.experience_years}
                      onChange={(e) => setJob({ ...job, experience_years: e.target.value })}
                      className={inputCls}
                      placeholder="4"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Salary range</label>
                    <input
                      value={job.salary_range}
                      onChange={(e) => setJob({ ...job, salary_range: e.target.value })}
                      className={inputCls}
                      placeholder="$140k - $180k"
                    />
                  </div>
                </div>
              </div>
            </motion.section>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
              >
                {error}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex justify-center">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(14,165,233,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit for evaluation
            </button>
          </div>
        </form>

        <AnimatePresence>
          {conversationId ? (
            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="glass mt-12 rounded-2xl p-6"
            >
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white">Pipeline Progress</h3>
                <p className="mt-1 text-xs text-slate-500 font-mono">
                  Tracking ID: {streamConversationId || conversationId}
                </p>
              </div>

              <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-5">
                {pipelineSteps.map((step) => {
                  const Icon = step.icon;
                  const isRunning = step.status === "running";
                  const isDone = step.status === "done";
                  const isError = step.status === "error";

                  return (
                    <div
                      key={step.name}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center"
                    >
                      <motion.div
                        animate={isRunning ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 1.4, repeat: isRunning ? Infinity : 0 }}
                        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-lg border ${
                          isDone
                            ? "border-emerald-400/40 bg-emerald-500/14"
                            : isRunning
                              ? "border-sky-400/45 bg-sky-500/16"
                              : isError
                                ? "border-red-400/40 bg-red-500/14"
                                : "border-white/12 bg-white/[0.03]"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                        ) : isRunning ? (
                          <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
                        ) : (
                          <Icon className="h-5 w-5 text-slate-500" />
                        )}
                      </motion.div>

                      <p
                        className={`mt-2 text-xs ${
                          isDone
                            ? "text-emerald-300"
                            : isRunning
                              ? "text-sky-200"
                              : isError
                                ? "text-red-200"
                                : "text-slate-500"
                        }`}
                      >
                        {step.name}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Thinking Boxes */}
              {Object.values(thinkingBoxes).length > 0 && (
                <div className="mt-6 space-y-3">
                  <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300">
                    <Brain className="h-4 w-4 text-purple-300" />
                    Agent Reasoning
                    <span className="ml-1 rounded-full bg-purple-500/15 border border-purple-400/30 px-2 py-0.5 text-[10px] text-purple-200">
                      {Object.values(thinkingBoxes).filter((b) => !b.done).length} active
                    </span>
                  </h4>
                  <AnimatePresence>
                    {Object.values(thinkingBoxes).map((box) => (
                      <motion.div
                        key={box.agentName}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
                      >
                        <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2">
                          <div className="flex items-center gap-2">
                            <Brain className="h-3.5 w-3.5 text-purple-300" />
                            <span className="text-xs font-semibold" style={{ color: getAgentColor(box.agentName) }}>
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
                        <pre className="max-h-36 overflow-y-auto px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                          {box.tokens || <span className="text-slate-600 italic">Waiting for tokens\u2026</span>}
                        </pre>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {pipelineSteps.every((s) => s.status === "done") ? (
                <div className="mt-6 text-center">
                  <Link
                    href="/results"
                    className="inline-flex items-center rounded-lg border border-sky-400/30 bg-sky-500/12 px-4 py-2 text-sm text-sky-200 transition hover:bg-sky-500/20"
                  >
                    View full results
                  </Link>
                </div>
              ) : null}
            </motion.section>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ApplyPageFallback() {
  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 page-offset pb-20 sm:px-6 lg:px-8">
        <div className="glass rounded-2xl p-8 text-center text-slate-400">Loading application form…</div>
      </main>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<ApplyPageFallback />}>
      <ApplyPageInner />
    </Suspense>
  );
}

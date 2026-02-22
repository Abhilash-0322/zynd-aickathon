"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  Brain,
  CheckCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Fingerprint,
  GitBranch,
  Globe2,
  Heart,
  Link2,
  Lock,
  Scale,
  ScrollText,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ParticleBackground from "@/components/ui/ParticleBackground";

/* ─── animation helpers ─── */
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" as const } },
};

/* ─── section hook ─── */
function useSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return { ref, inView };
}

/* ─── data ─── */
const brokenStats = [
  { value: "75%", label: "of resumes never seen by a human", icon: EyeOff },
  { value: "46%", label: "of job posts contain biased language", icon: AlertTriangle },
  { value: "88%", label: "of candidates want transparent feedback", icon: Eye },
  { value: "0%", label: "of rejections come with verifiable proof", icon: ScrollText },
];

const agents = [
  {
    icon: Shield,
    name: "Privacy Guardian",
    role: "The Anonymizer",
    color: "from-sky-500 to-cyan-400",
    borderColor: "border-sky-400/25",
    bgColor: "bg-sky-500/10",
    textColor: "text-sky-300",
    story:
      "Before anyone sees your application, the Privacy Guardian strips away everything that doesn't matter — your name, photo, age, gender, ethnicity. What remains is pure signal: your skills, your work, your evidence. This is how blind screening should have always worked.",
    capability: "Rule-based PII removal + LLM-powered refinement for subtle identifiers. GDPR-aligned anonymization.",
  },
  {
    icon: Scale,
    name: "Bias Detector",
    role: "The Equalizer",
    color: "from-amber-500 to-orange-400",
    borderColor: "border-amber-400/25",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-300",
    story:
      "Job descriptions carry invisible filters — gendered language, age-coded requirements, elitist credential demands. The Bias Detector reads between the lines, flagging patterns humans miss and suggesting inclusive alternatives. It scores every posting for fairness before a single candidate is evaluated.",
    capability: "Linguistic + structural bias detection with severity rating. Diversity score and suggested rewrites.",
  },
  {
    icon: Target,
    name: "Skill Verifier",
    role: "The Evidence Seeker",
    color: "from-emerald-500 to-green-400",
    borderColor: "border-emerald-400/25",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-300",
    story:
      "Anyone can list \"Python\" on a resume. The Skill Verifier goes deeper — cross-referencing claims against portfolios, GitHub contributions, project complexity, and measurable indicators. It assigns confidence scores, not checkboxes. It finds the proof behind the promise.",
    capability: "Evidence-based skill verification with confidence scoring. Transferable skills considered.",
  },
  {
    icon: Link2,
    name: "Candidate Matcher",
    role: "The Connector",
    color: "from-violet-500 to-purple-400",
    borderColor: "border-violet-400/25",
    bgColor: "bg-violet-500/10",
    textColor: "text-violet-300",
    story:
      "With verified skills and an anonymized profile, the Candidate Matcher calculates fit purely on capability alignment. No school prestige. No company brand recognition. Just an honest answer to: can this person do this job? Skill gaps are listed transparently — no black boxes.",
    capability: "Objective skills-based matching with transparent weight reasoning and gap analysis.",
  },
  {
    icon: ScrollText,
    name: "Credential Issuer",
    role: "The Notary",
    color: "from-rose-500 to-pink-400",
    borderColor: "border-rose-400/25",
    bgColor: "bg-rose-500/10",
    textColor: "text-rose-300",
    story:
      "Every decision becomes a tamper-evident record. The Credential Issuer mints W3C Verifiable Credentials for every assessment — cryptographically signed, DID-anchored, and portable. Your evaluation is yours to keep, share, and challenge. Hiring outcomes finally have receipts.",
    capability: "W3C Verifiable Credentials with SHA-256 integrity proof and DID-based issuer identity.",
  },
  {
    icon: Brain,
    name: "Orchestrator",
    role: "The Conductor",
    color: "from-sky-400 to-emerald-400",
    borderColor: "border-sky-400/25",
    bgColor: "bg-sky-500/10",
    textColor: "text-sky-200",
    story:
      "The Orchestrator is the intelligence that binds all agents into a single coherent pipeline. It sequences operations, resolves conflicts, synthesizes a final ADVANCE / HOLD / REJECT recommendation, and broadcasts every step in real-time. Nothing happens in the dark.",
    capability: "Full pipeline coordination with real-time WebSocket streaming and audit trail generation.",
  },
];

const journeySteps = [
  { phase: "Submit", desc: "Application enters the pipeline", icon: Sparkles, time: "0s" },
  { phase: "Anonymize", desc: "PII stripped for blind review", icon: EyeOff, time: "~2s" },
  { phase: "Audit", desc: "Job posting scanned for bias", icon: Scale, time: "~5s" },
  { phase: "Verify", desc: "Skills cross-referenced with evidence", icon: Search, time: "~8s" },
  { phase: "Match", desc: "Capability alignment scored", icon: Target, time: "~11s" },
  { phase: "Credential", desc: "Verifiable credential issued", icon: Award, time: "~14s" },
  { phase: "Decision", desc: "Final recommendation delivered", icon: CheckCircle, time: "~16s" },
];

const principles = [
  {
    icon: Lock,
    title: "Privacy by Design",
    desc: "Identities are stripped before evaluation begins. No one sees what shouldn't influence the outcome.",
  },
  {
    icon: GitBranch,
    title: "Open Audit Trail",
    desc: "Every agent decision, score, and reasoning step is logged and reviewable — by the team and the candidate.",
  },
  {
    icon: Fingerprint,
    title: "Cryptographic Trust",
    desc: "Outcomes are anchored with W3C Verifiable Credentials, signed by DID-authenticated agents via Zynd Protocol.",
  },
  {
    icon: ShieldCheck,
    title: "Bias Accountability",
    desc: "Job posts are scored for fairness. Biased language is flagged with severity ratings and rewrite suggestions.",
  },
  {
    icon: Globe2,
    title: "Portable Credentials",
    desc: "Assessment results belong to candidates. Take them anywhere — they're cryptographically verifiable.",
  },
  {
    icon: Heart,
    title: "Human-Centered AI",
    desc: "Agents assist, they don't replace. Every recommendation is explainable in plain language a human can challenge.",
  },
];

/* ─── page ─── */
export default function HomePage() {
  const hero = useSection();
  const problem = useSection();
  const vision = useSection();
  const agentsSection = useSection();
  const journey = useSection();
  const trust = useSection();
  const cta = useSection();

  const { scrollYProgress } = useScroll();
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <ParticleBackground />
      <Navbar />

      {/* scroll progress */}
      <motion.div
        className="fixed left-0 top-0 z-50 h-[2px] bg-gradient-to-r from-sky-500 via-emerald-400 to-sky-500"
        style={{ width: progressWidth }}
      />

      <main className="relative z-10">
        {/* ═══════════ HERO ═══════════ */}
        <section ref={hero.ref} className="relative px-4 pb-24 pt-32 sm:px-6 sm:pb-32 sm:pt-44 lg:px-8">
          {/* large soft glow */}
          <div className="pointer-events-none absolute left-1/2 top-28 -translate-x-1/2">
            <div className="h-[520px] w-[720px] rounded-full bg-sky-500/[0.07] blur-[120px]" />
          </div>

          <div className="mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="mx-auto max-w-4xl text-center"
            >
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-1.5 text-xs uppercase tracking-[0.16em] text-sky-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                Multi-Agent Hiring Protocol
              </motion.span>

              <h1 className="mt-8 text-balance text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Hiring was never designed{" "}
                <br className="hidden sm:block" />
                to be <span className="gradient-text">fair</span>.
                <br />
                <span className="text-slate-400 font-medium">We&apos;re changing that.</span>
              </h1>

              <p className="mx-auto mt-8 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg sm:leading-relaxed">
                TalentInfra is a network of six AI agents that strip bias, verify skills with evidence, 
                and issue cryptographic credentials — so every hiring decision is{" "}
                <span className="text-white font-medium">transparent</span>,{" "}
                <span className="text-white font-medium">defensible</span>, and{" "}
                <span className="text-white font-medium">provably fair</span>.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/apply"
                  className="group inline-flex min-w-52 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(14,165,233,0.35)] transition-all hover:shadow-[0_20px_40px_rgba(14,165,233,0.45)] hover:brightness-110"
                >
                  Start your evaluation
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/jobs/new"
                  className="inline-flex min-w-52 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]"
                >
                  Post a fair role
                </Link>
              </div>
            </motion.div>

            {/* hero metrics */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mx-auto mt-20 grid max-w-5xl grid-cols-2 gap-4 lg:grid-cols-4"
            >
              {[
                { icon: Zap, value: "6", label: "Specialized AI Agents" },
                { icon: Activity, value: "Real-time", label: "Pipeline Visibility" },
                { icon: CheckCircle, value: "100%", label: "Auditable Steps" },
                { icon: Fingerprint, value: "W3C VCs", label: "Verifiable Credentials" },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <motion.div key={m.label} variants={fadeUp} className="glass glass-hover rounded-2xl p-5 text-center">
                    <Icon className="mx-auto h-5 w-5 text-sky-300" />
                    <p className="mt-3 text-xl font-bold text-white sm:text-2xl">{m.value}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">{m.label}</p>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* scroll hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="mt-16 flex flex-col items-center gap-2 text-slate-500"
            >
              <span className="text-[11px] uppercase tracking-[0.2em]">Scroll to discover</span>
              <ChevronDown className="h-4 w-4 animate-bounce" />
            </motion.div>
          </div>
        </section>

        {/* ═══════════ THE PROBLEM ═══════════ */}
        <section ref={problem.ref} className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-rose-500/[0.04] blur-[100px]" />

          <div className="mx-auto max-w-6xl">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate={problem.inView ? "visible" : "hidden"}
              className="mx-auto max-w-3xl"
            >
              <motion.span variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
                The Uncomfortable Truth
              </motion.span>
              <motion.h2 variants={fadeUp} className="mt-4 text-3xl font-bold text-white sm:text-5xl">
                Hiring is broken.
                <br />
                <span className="text-slate-400">And everyone knows it.</span>
              </motion.h2>
              <motion.div variants={fadeUp} className="mt-6 space-y-4 text-base leading-relaxed text-slate-300 sm:text-lg">
                <p>
                  A talented developer in Lagos writes better code than most of Silicon Valley — but her resume 
                  never reaches a human because an ATS filtered her out by school name. A senior engineer 
                  who took two years off for caregiving gets ranked below a fresh graduate because the algorithm 
                  penalizes employment gaps. A non-binary candidate is auto-rejected because the job description 
                  was written with unconscious gender coding.
                </p>
                <p>
                  This isn&apos;t a hypothetical. <span className="text-white font-medium">This is the default.</span> Résumé 
                  screening tools optimize for pattern-matching against historical data — data that encodes decades 
                  of structural bias. The result? Talent is systematically overlooked, and no one can explain why.
                </p>
              </motion.div>
            </motion.div>

            <motion.div
              variants={stagger}
              initial="hidden"
              animate={problem.inView ? "visible" : "hidden"}
              className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {brokenStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    variants={fadeUp}
                    className="glass rounded-2xl border-rose-500/10 p-6 text-center"
                  >
                    <Icon className="mx-auto h-6 w-6 text-rose-400/80" />
                    <p className="mt-4 text-3xl font-bold text-white">{stat.value}</p>
                    <p className="mt-2 text-sm leading-snug text-slate-400">{stat.label}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ═══════════ THE VISION ═══════════ */}
        <section ref={vision.ref} className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute left-0 top-1/3 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.05] blur-[120px]" />

          <div className="mx-auto max-w-6xl">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate={vision.inView ? "visible" : "hidden"}
              className="grid items-center gap-12 lg:grid-cols-2"
            >
              <div>
                <motion.span variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                  A Different Premise
                </motion.span>
                <motion.h2 variants={fadeUp} className="mt-4 text-3xl font-bold text-white sm:text-5xl">
                  What if hiring <br />
                  <span className="gradient-text">started with evidence?</span>
                </motion.h2>
                <motion.div variants={fadeUp} className="mt-6 space-y-4 text-base leading-relaxed text-slate-300 sm:text-lg">
                  <p>
                    We built TalentInfra on a radical premise: <span className="text-white font-medium">strip away 
                    everything except what a person can do</span>. No names. No photos. No school brands. 
                    No demographic signals. Just verified skills matched against real role requirements.
                  </p>
                  <p>
                    Six specialized AI agents work in sequence — each with a single responsibility, each 
                    explainable, each auditable. Together, they form a pipeline where every decision has 
                    a receipt and every outcome can be challenged.
                  </p>
                  <p className="text-white/90 font-medium italic border-l-2 border-emerald-500/50 pl-4">
                    &quot;We don&apos;t just promise fairness. We prove it — cryptographically.&quot;
                  </p>
                </motion.div>
              </div>

              <motion.div variants={fadeUp} className="relative">
                <div className="glass rounded-3xl p-8">
                  <div className="space-y-5">
                    {[
                      { label: "Traditional Hiring", items: ["Name recognition bias", "School prestige filtering", "Gap penalization", "Black-box ATS scores", "No feedback trail"], bad: true },
                      { label: "TalentInfra Pipeline", items: ["Blind, anonymized review", "Evidence-based skill verification", "Transferable skills considered", "Transparent match reasoning", "Verifiable credential for every outcome"], bad: false },
                    ].map((col) => (
                      <div key={col.label}>
                        <h4 className={`text-sm font-semibold uppercase tracking-wider ${col.bad ? "text-rose-400" : "text-emerald-400"}`}>
                          {col.label}
                        </h4>
                        <ul className="mt-3 space-y-2">
                          {col.items.map((item) => (
                            <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                              {col.bad ? (
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400/70" />
                              ) : (
                                <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400/70" />
                              )}
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════ MEET THE AGENTS ═══════════ */}
        <section ref={agentsSection.ref} className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate={agentsSection.inView ? "visible" : "hidden"}
              className="mx-auto max-w-3xl text-center"
            >
              <motion.span variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
                The Agent Network
              </motion.span>
              <motion.h2 variants={fadeUp} className="mt-4 text-3xl font-bold text-white sm:text-5xl">
                Six agents. One mission.
                <br />
                <span className="text-slate-400">Every decision explained.</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-base text-slate-300 sm:text-lg">
                Each agent has a single responsibility, runs on its own LLM instance, communicates through 
                the Zynd Protocol registry, and logs every action for full auditability.
              </motion.p>
            </motion.div>

            <motion.div
              variants={stagger}
              initial="hidden"
              animate={agentsSection.inView ? "visible" : "hidden"}
              className="mt-16 space-y-6"
            >
              {agents.map((agent, index) => {
                const Icon = agent.icon;
                const isEven = index % 2 === 0;
                return (
                  <motion.div
                    key={agent.name}
                    variants={fadeUp}
                    className={`glass glass-hover rounded-3xl p-6 sm:p-8 ${agent.borderColor}`}
                  >
                    <div className={`flex flex-col gap-6 lg:flex-row lg:items-start ${!isEven ? "lg:flex-row-reverse" : ""}`}>
                      <div className="flex flex-shrink-0 items-start gap-4 lg:w-64">
                        <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${agent.bgColor} border ${agent.borderColor}`}>
                          <Icon className={`h-7 w-7 ${agent.textColor}`} />
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Agent 0{index + 1}
                          </span>
                          <h3 className="text-lg font-bold text-white">{agent.name}</h3>
                          <p className={`text-xs font-semibold uppercase tracking-wider ${agent.textColor}`}>
                            {agent.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex-1 space-y-3">
                        <p className="text-[15px] leading-relaxed text-slate-300">{agent.story}</p>
                        <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                          <Zap className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-400" />
                          <p className="text-xs leading-relaxed text-slate-400">{agent.capability}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ═══════════ THE JOURNEY ═══════════ */}
        <section ref={journey.ref} className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute right-1/4 top-0 h-[400px] w-[400px] rounded-full bg-violet-500/[0.04] blur-[100px]" />

          <div className="mx-auto max-w-5xl">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate={journey.inView ? "visible" : "hidden"}
              className="text-center"
            >
              <motion.span variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                Candidate Journey
              </motion.span>
              <motion.h2 variants={fadeUp} className="mt-4 text-3xl font-bold text-white sm:text-5xl">
                From application to credential
                <br />
                <span className="text-slate-400">in under 20 seconds.</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
                Every step is streamed to the frontend in real-time via WebSocket. You watch the agents work. 
                Nothing happens behind closed doors.
              </motion.p>
            </motion.div>

            <motion.div
              variants={stagger}
              initial="hidden"
              animate={journey.inView ? "visible" : "hidden"}
              className="relative mt-16"
            >
              {/* vertical line */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-sky-500/40 via-emerald-500/30 to-violet-500/20 sm:left-8" />

              <div className="space-y-1">
                {journeySteps.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <motion.div key={step.phase} variants={fadeUp} className="relative flex items-start gap-5 py-5 pl-0 sm:gap-6">
                      <div className="relative z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[var(--bg-elevated)] sm:h-16 sm:w-16">
                        <Icon className="h-5 w-5 text-sky-300 sm:h-6 sm:w-6" />
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[9px] font-bold text-sky-300">
                          {i + 1}
                        </span>
                      </div>
                      <div className="pt-1 sm:pt-2">
                        <div className="flex items-center gap-3">
                          <h4 className="text-base font-semibold text-white sm:text-lg">{step.phase}</h4>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate-500">
                            {step.time}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-400">{step.desc}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════ TRUST ARCHITECTURE ═══════════ */}
        <section ref={trust.ref} className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate={trust.inView ? "visible" : "hidden"}
              className="mx-auto max-w-3xl text-center"
            >
              <motion.span variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Trust Architecture
              </motion.span>
              <motion.h2 variants={fadeUp} className="mt-4 text-3xl font-bold text-white sm:text-5xl">
                Built on principles,
                <br />
                <span className="text-slate-400">not promises.</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-base text-slate-300 sm:text-lg">
                Every architectural decision in TalentInfra serves one goal: making hiring outcomes 
                something both sides of the table can verify, challenge, and trust.
              </motion.p>
            </motion.div>

            <motion.div
              variants={stagger}
              initial="hidden"
              animate={trust.inView ? "visible" : "hidden"}
              className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {principles.map((p) => {
                const Icon = p.icon;
                return (
                  <motion.div key={p.title} variants={fadeUp} className="glass glass-hover rounded-2xl p-6">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10">
                      <Icon className="h-5 w-5 text-sky-300" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-white">{p.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.desc}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ═══════════ PROTOCOL ═══════════ */}
        <section className="px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="glass rounded-3xl border-sky-500/15 p-8 sm:p-12">
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
                    Powered by Zynd Protocol
                  </span>
                  <h3 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
                    Decentralized agent identity
                    <br />
                    <span className="text-slate-400">for accountable AI.</span>
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
                    Every agent in TalentInfra authenticates through the Zynd Protocol registry using 
                    Decentralized Identifiers (DIDs). This means each agent&apos;s actions are cryptographically 
                    attributable — you can verify <em>which</em> agent made <em>which</em> decision, 
                    and <em>when</em>. No spoofing. No ambiguity. Full accountability.
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-sky-500/30 to-transparent" />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">DID · VC · SHA-256</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-emerald-500/30 to-transparent" />
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Agent Authentication", desc: "DID-based identity for every agent in the network" },
                    { label: "Credential Issuance", desc: "W3C Verifiable Credentials for assessment outcomes" },
                    { label: "Integrity Proofs", desc: "SHA-256 hashes ensure credential tamper-evidence" },
                    { label: "Registry Discovery", desc: "Agents discover and authenticate via protocol registry" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <TrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                      <div>
                        <p className="text-sm font-semibold text-white">{item.label}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════ FINAL CTA ═══════════ */}
        <section ref={cta.ref} className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[500px] w-[700px] rounded-full bg-sky-500/[0.06] blur-[140px]" />
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={cta.inView ? "visible" : "hidden"}
            className="relative mx-auto max-w-3xl text-center"
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-bold text-white sm:text-5xl">
              Talent deserves better
              <br />
              <span className="gradient-text">than a black box.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Whether you&apos;re a candidate who wants proof of a fair process, or a team that wants 
              defensible decisions — TalentInfra is built for you.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/apply"
                className="group inline-flex min-w-52 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(14,165,233,0.35)] transition-all hover:shadow-[0_20px_40px_rgba(14,165,233,0.45)] hover:brightness-110"
              >
                Get evaluated fairly
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/jobs/new"
                className="inline-flex min-w-52 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]"
              >
                Post a bias-checked role
              </Link>
            </motion.div>
            <motion.p variants={fadeIn} className="mt-8 text-xs text-slate-500">
              Open pipeline · Real-time agent streaming · Verifiable credentials · Zynd Protocol
            </motion.p>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

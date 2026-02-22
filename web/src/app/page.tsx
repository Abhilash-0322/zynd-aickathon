"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import {
  Activity,
  CheckCircle,
  Link2,
  Scale,
  ScrollText,
  Shield,
  Target,
  Users,
  Zap,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ParticleBackground from "@/components/ui/ParticleBackground";

const metrics = [
  { icon: Zap, value: "6", label: "Specialized Agents" },
  { icon: CheckCircle, value: "100%", label: "Traceable Pipeline Steps" },
  { icon: Activity, value: "Live", label: "Execution Visibility" },
  { icon: Users, value: "Verifiable", label: "Skill Credentials" },
];

const steps = [
  {
    icon: Shield,
    title: "Privacy Guardian",
    description: "Removes identifying context for blind, evidence-first screening.",
  },
  {
    icon: Scale,
    title: "Bias Detector",
    description: "Flags language and structural patterns that create unfair filtering.",
  },
  {
    icon: Target,
    title: "Skill Verifier",
    description: "Cross-checks claims with measurable technical indicators.",
  },
  {
    icon: Link2,
    title: "Candidate Matcher",
    description: "Matches role fit using verified capabilities, not demographics.",
  },
  {
    icon: ScrollText,
    title: "Credential Issuer",
    description: "Generates tamper-evident outcome credentials for auditability.",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

export default function HomePage() {
  const howRef = useRef<HTMLDivElement>(null);
  const inView = useInView(howRef, { once: true, margin: "-90px" });

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <ParticleBackground />
      <Navbar />

      <main className="relative z-10">
        <section className="px-4 pb-20 pt-32 sm:px-6 sm:pb-24 sm:pt-40 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="mx-auto max-w-3xl text-center"
            >
              <span className="inline-flex items-center rounded-full border border-sky-400/35 bg-sky-500/12 px-3 py-1 text-xs uppercase tracking-[0.14em] text-sky-200">
                Multi-agent hiring operations
              </span>
              <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight text-white sm:text-6xl">
                Clean, defensible hiring decisions with a <span className="gradient-text">human-readable AI pipeline</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg">
                Zynd orchestrates privacy, bias checks, skill verification, matching, and credentialing in one
                transparent workflow teams can trust.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/apply"
                  className="inline-flex min-w-48 items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(14,165,233,0.3)] transition hover:brightness-110"
                >
                  Start an evaluation
                </Link>
                <Link
                  href="/jobs/new"
                  className="inline-flex min-w-48 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]"
                >
                  Post a role
                </Link>
              </div>
            </motion.div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <motion.div
                    key={metric.label}
                    variants={cardVariants}
                    className="glass glass-hover rounded-2xl p-5"
                  >
                    <Icon className="h-5 w-5 text-sky-300" />
                    <p className="mt-4 text-2xl font-semibold text-white">{metric.value}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        <section ref={howRef} className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45 }}
              className="mx-auto max-w-2xl text-center"
            >
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                How The Pipeline Works
              </h2>
              <p className="mt-3 text-slate-400">
                Each stage is explicit, logged, and reviewable so outcomes are explainable to hiring teams and candidates.
              </p>
            </motion.div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate={inView ? "visible" : "hidden"}
              className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5"
            >
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={step.title}
                    variants={cardVariants}
                    className="glass glass-hover relative rounded-2xl p-5"
                  >
                    <span className="absolute right-4 top-4 text-[11px] font-mono text-slate-500">0{index + 1}</span>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-500/12 text-sky-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

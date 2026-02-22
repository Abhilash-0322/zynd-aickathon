"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, CheckCircle2, Loader2, Send } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { API_URL } from "@/lib/utils";

export default function NewJobPage() {
  const [form, setForm] = useState({
    title: "",
    company: "",
    description: "",
    requirements: "",
    nice_to_have: "",
    experience_years: "",
    location: "",
    salary_range: "",
    remote: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessId(null);

    try {
      const body = {
        title: form.title,
        company: form.company,
        description: form.description,
        requirements: form.requirements
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        nice_to_have: form.nice_to_have
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        experience_years: parseInt(form.experience_years, 10) || 0,
        location: form.location,
        salary_range: form.salary_range,
        remote: form.remote,
      };

      const res = await fetch(`${API_URL}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to post job");
      }

      const data = await res.json();
      setSuccessId(String(data.job_id || data.job?.id || "created"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to post job");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSuccessId(null);
    setError(null);
    setForm({
      title: "",
      company: "",
      description: "",
      requirements: "",
      nice_to_have: "",
      experience_years: "",
      location: "",
      salary_range: "",
      remote: false,
    });
  }

  const inputCls =
    "w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/45 focus:ring-2 focus:ring-sky-500/20";

  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4 page-offset pb-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-9"
        >
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Create a job listing</h1>
          <p className="mt-2 text-sm text-slate-400 sm:text-base">
            Define requirements clearly so pipeline scoring stays consistent and transparent.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {successId ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="glass rounded-2xl p-8 text-center"
            >
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300" />
              <h2 className="mt-4 text-xl font-semibold text-white">Job posted successfully</h2>
              <p className="mt-2 text-sm text-slate-400">Reference ID</p>
              <code className="mt-1 inline-block rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-sm text-sky-200">
                {successId}
              </code>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/jobs"
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.08]"
                >
                  View all jobs
                </Link>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-sky-400/30 bg-sky-500/12 px-4 py-2 text-sm text-sky-200 transition hover:bg-sky-500/20"
                >
                  Post another
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass rounded-2xl p-6 sm:p-7"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200">
                <Briefcase className="h-4 w-4" />
                Role details
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Job title</label>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={inputCls}
                    placeholder="Senior Full-Stack Engineer"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Company</label>
                  <input
                    required
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className={inputCls}
                    placeholder="Zynd Protocol"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Description</label>
                <textarea
                  required
                  rows={5}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={`${inputCls} resize-none`}
                  placeholder="Describe outcomes, responsibilities, and team context."
                />
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Requirements</label>
                <input
                  value={form.requirements}
                  onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                  className={inputCls}
                  placeholder="React, TypeScript, APIs, 4+ years"
                />
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Nice to have</label>
                <input
                  value={form.nice_to_have}
                  onChange={(e) => setForm({ ...form, nice_to_have: e.target.value })}
                  className={inputCls}
                  placeholder="Kubernetes, GraphQL, ML experience"
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Experience</label>
                  <input
                    type="number"
                    min={0}
                    value={form.experience_years}
                    onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                    className={inputCls}
                    placeholder="4"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Location</label>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className={inputCls}
                    placeholder="Remote / City"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Salary range</label>
                  <input
                    value={form.salary_range}
                    onChange={(e) => setForm({ ...form, salary_range: e.target.value })}
                    className={inputCls}
                    placeholder="$120k - $160k"
                  />
                </div>
              </div>

              <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.remote}
                  onChange={(e) => setForm({ ...form, remote: e.target.checked })}
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-sky-500 focus:ring-sky-500/20"
                />
                Remote role available
              </label>

              {error ? (
                <div className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(14,165,233,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publish job
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

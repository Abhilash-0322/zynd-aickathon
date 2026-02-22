"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Briefcase, Clock3, DollarSign, Inbox, MapPin, Plus, Wifi } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { API_URL } from "@/lib/utils";

interface Job {
  id: string;
  title: string;
  company?: string;
  description: string;
  requirements: string[];
  nice_to_have?: string[];
  experience_years?: number;
  location?: string;
  remote?: boolean;
  salary_range?: string;
  created_at?: string;
}

function normalizeJobs(payload: unknown): Job[] {
  if (Array.isArray(payload)) return payload as Job[];
  if (payload && typeof payload === "object" && "jobs" in payload) {
    const jobs = (payload as { jobs?: unknown }).jobs;
    if (Array.isArray(jobs)) return jobs as Job[];
  }
  return [];
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/jobs`);
        if (!res.ok) throw new Error("Unable to load jobs");
        const data = await res.json();
        if (!active) return;
        setJobs(normalizeJobs(data));
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load jobs");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [jobs],
  );

  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 page-offset pb-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Open Roles</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400 sm:text-base">
              Live listings evaluated with the same transparent, bias-aware pipeline used for every applicant.
            </p>
          </div>

          <Link
            href="/jobs/new"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(14,165,233,0.28)] transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Post a job
          </Link>
        </motion.div>

        {loading ? (
          <div className="py-20 text-center text-slate-400">Loading open positions…</div>
        ) : error ? (
          <div className="glass rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-200">{error}</div>
        ) : sortedJobs.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <Inbox className="mx-auto h-12 w-12 text-slate-600" />
            <p className="mt-4 text-lg font-medium text-white">No job posts yet</p>
            <p className="mt-1 text-sm text-slate-400">Create the first role to start candidate evaluations.</p>
            <Link
              href="/jobs/new"
              className="mt-6 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.08]"
            >
              Create a role
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {sortedJobs.map((job) => (
              <motion.article
                key={job.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass glass-hover flex h-full flex-col rounded-2xl p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{job.title}</h2>
                    {job.company && (
                      <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-400">
                        <Briefcase className="h-3.5 w-3.5" />
                        {job.company}
                      </p>
                    )}
                  </div>

                  {job.experience_years ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200">
                      <Clock3 className="h-3.5 w-3.5" />
                      {job.experience_years}+ yrs
                    </span>
                  ) : null}
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-300">{job.description}</p>

                {job.requirements?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {job.requirements.slice(0, 6).map((req, idx) => (
                      <span
                        key={`${job.id}-req-${idx}`}
                        className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300"
                      >
                        {req}
                      </span>
                    ))}
                    {job.requirements.length > 6 && (
                      <span className="px-1 text-[11px] text-slate-500">+{job.requirements.length - 6}</span>
                    )}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    {job.salary_range && (
                      <span className="inline-flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        {job.salary_range}
                      </span>
                    )}
                    {job.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
                      </span>
                    )}
                    {job.remote && (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <Wifi className="h-3.5 w-3.5" />
                        Remote
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/apply?jobId=${encodeURIComponent(job.id)}`}
                    className="rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]"
                  >
                    Apply
                  </Link>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

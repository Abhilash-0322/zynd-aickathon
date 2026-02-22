import { Shield, Scale, Target, ScrollText, Brain, Link2 } from "lucide-react";
import Link from "next/link";

const footerAgents = [
  { icon: Shield, label: "Privacy" },
  { icon: Scale, label: "Bias" },
  { icon: Target, label: "Skills" },
  { icon: Link2, label: "Matching" },
  { icon: ScrollText, label: "Credentials" },
  { icon: Brain, label: "Orchestrator" },
];

export default function Footer() {
  return (
    <footer className="mt-14 border-t border-white/10 bg-[#071121]/70">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          {/* brand */}
          <div>
            <p className="text-lg font-bold text-white">
              <span className="gradient-text">TalentInfra</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              A fair hiring network powered by Zynd Protocol
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Six AI agents working in concert to make every hiring decision transparent,
              evidence-based, and cryptographically verifiable.
            </p>
          </div>

          {/* quick links */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Platform</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/apply", label: "Submit Application" },
                { href: "/jobs", label: "Browse Roles" },
                { href: "/jobs/new", label: "Post a Role" },
                { href: "/live", label: "Live Pipeline" },
                { href: "/results", label: "View Results" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400 transition hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* agent network */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Agent Network</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {footerAgents.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400"
                  >
                    <Icon className="h-3 w-3 text-sky-400" />
                    {a.label}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
              <span className="text-[11px] text-slate-500">DID · Verifiable Credentials · SHA-256</span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/5 pt-6 text-center">
          <p className="text-xs text-slate-500">
            Privacy-preserving evaluation · Bias-aware scoring · Verifiable credentials
          </p>
          <p className="text-[11px] text-slate-600">
            ZYND AICKATHON 2026 · Built to prove fairness, not just promise it.
          </p>
        </div>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Cookies from "js-cookie";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, UserCircle2, LogOut } from "lucide-react";
import { API_URL, cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/apply", label: "Submit" },
  { href: "/jobs", label: "Jobs" },
  { href: "/live", label: "Live" },
  { href: "/results", label: "Results" },
  { href: "/history", label: "History" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/12">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">TalentInfra</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-400">
          a fair hiring network powered by Zynd Protocol
        </span>
      </span>
    </Link>
  );
}

function ConnectionStatus({ healthy }: { healthy: boolean | null }) {
  const cls = healthy === null ? "reconnecting" : healthy ? "live" : "offline";
  const label = healthy === null ? "Checking" : healthy ? "Online" : "Unavailable";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300">
      <span className={cn("status-dot", cls)} />
      <span>{label}</span>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const user = useStore((s) => s.user);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const setUser = useStore((s) => s.setUser);
  const logout = useStore((s) => s.logout);

  const handleLogout = useCallback(() => {
    Cookies.remove("zynd_token");
    logout();
  }, [logout]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = Cookies.get("zynd_token");
    if (!token) {
      logout();
      return;
    }

    let active = true;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error("session-expired");
        }

        const data = await res.json();
        if (!active) return;
        setUser({
          id: String(data.id),
          email: data.email,
          name: data.name,
          role: data.role,
          createdAt: data.created_at,
        });
      } catch {
        if (!active) return;
        Cookies.remove("zynd_token");
        logout();
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount to validate stored session

  useEffect(() => {
    let active = true;

    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        if (!active) return;
        setHealthy(res.ok);
      } catch {
        if (!active) return;
        setHealthy(false);
      }
    };

    ping();
    const timer = setInterval(ping, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const authBlock = useMemo(() => {
    if (!isAuthenticated || !user) {
      return (
        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(14,165,233,0.25)] transition hover:brightness-110"
          >
            Create account
          </Link>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
        <UserCircle2 className="h-4 w-4 text-slate-200" />
        <span className="text-sm text-slate-100">{user.name}</span>
        <button
          onClick={handleLogout}
          className="ml-1 rounded p-0.5 text-slate-400 transition hover:text-red-300"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }, [isAuthenticated, user, handleLogout]);

  return (
    <motion.header
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <nav className="mx-auto mt-2 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/10 bg-[var(--surface-strong)]/92 px-4 py-3 shadow-[0_16px_30px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <Logo />

            <div className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "rounded-lg px-3.5 py-2 text-sm font-medium transition",
                      active
                        ? "bg-sky-500/15 text-sky-200"
                        : "text-slate-300 hover:bg-white/6 hover:text-white",
                      "link-hover",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <ConnectionStatus healthy={healthy} />
              {authBlock}
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white md:hidden"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden md:hidden"
              >
                <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
                  {NAV_LINKS.map((link) => {
                    const active = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "block rounded-lg px-3 py-2 text-sm font-medium",
                          active
                            ? "bg-sky-500/15 text-sky-200"
                            : "text-slate-300 hover:bg-white/7 hover:text-white",
                        )}
                      >
                        {link.label}
                      </Link>
                    );
                  })}

                  <div className="flex items-center justify-between border-t border-white/10 pt-3">
                    <ConnectionStatus healthy={healthy} />
                    {!isAuthenticated && (
                      <Link
                        href="/auth/signup"
                        className="rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Create account
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>
    </motion.header>
  );
}

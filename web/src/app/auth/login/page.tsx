"use client";

import { useState } from "react";
import Cookies from "js-cookie";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { API_URL } from "@/lib/utils";
import { useStore } from "@/store/useStore";

export default function LoginPage() {
  const router = useRouter();
  const setUser = useStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        let message = "Invalid email or password";
        if (typeof data.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          message = data.detail
            .map((e: { msg?: string; loc?: string[] }) => {
              const field = e.loc?.slice(-1)[0] || "field";
              const msg = (e.msg || "").replace(/^Value error, /, "");
              return `${field}: ${msg}`;
            })
            .join("; ");
        }
        throw new Error(message);
      }

      const data = await res.json();
      Cookies.set("zynd_token", data.token, { expires: 7, sameSite: "lax" });

      if (data.user) {
        setUser({
          id: String(data.user.id),
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          createdAt: data.user.created_at,
        });
      }

      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/45 focus:ring-2 focus:ring-sky-500/20";

  return (
    <div className="min-h-screen bg-[#070e19]">
      <Navbar />

      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 pb-10 pt-28">
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full glass gradient-border rounded-2xl p-7 sm:p-8"
        >
          <h1 className="text-2xl font-semibold text-white">Sign in</h1>
          <p className="mt-2 text-sm text-slate-400">Access the fair hiring workspace.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.08em] text-slate-400">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Enter your password"
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(14,165,233,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Sign in
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-400">
            New here?{" "}
            <Link href="/auth/signup" className="font-semibold text-sky-300 hover:text-sky-200">
              Create an account
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

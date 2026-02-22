export default function Footer() {
  return (
    <footer className="mt-14 border-t border-white/10 bg-[#071121]/70">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-8 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-slate-300">
          Built for fair, transparent hiring with <span className="gradient-text font-semibold">Zynd Protocol</span>
        </p>
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Privacy-preserving evaluation · Bias-aware scoring · Verifiable credentials
        </p>
      </div>
    </footer>
  );
}

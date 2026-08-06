import { useEffect, useState, useMemo, type FormEvent } from "react";
import Layout from "@/components/Layout";
import SignalCard from "@/components/SignalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/AuthProvider";
import { useSupabaseSignals } from "@/hooks/useSupabaseSignals";
import { INSTRUMENTS, type SignalStatus, type Market } from "@contracts/instruments";
import { cn } from "@/lib/utils";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  UserCheck,
} from "lucide-react";

function SignalCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-2.5 w-8" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

const STATUS_TABS: { value: SignalStatus | "all" | "closed"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Live" },
  { value: "closed", label: "Graded" },
  { value: "expired", label: "Expired" },
];

const MARKET_TABS: { value: Market | "all"; label: string }[] = [
  { value: "all", label: "All Markets" },
  { value: "crypto", label: "Crypto" },
  { value: "gold", label: "Gold" },
  { value: "forex", label: "Forex" },
];

export default function Signals() {
  const { user, isLoading: isLoadingAuth, refetchUser } = useAuth();

  useEffect(() => {
    document.title = "Live Signal Feed — KR-Signal";
  }, []);

  const [marketCategory, setMarketCategory] = useState<Market | "all">("all");
  const [symbol, setSymbol] = useState<string | undefined>();
  const [tab, setTab] = useState<"all" | SignalStatus | "closed">("all");

  // Inline login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      utils.auth.me.setData(undefined, data);
      refetchUser();
    },
    onError: (err) => {
      setErrorMsg(err.message || "Invalid email or password.");
    },
  });

  const handleInlineLogin = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }
    loginMutation.mutate({
      email,
      password,
      rememberMe: true,
    });
  };

  const query = trpc.signals.list.useQuery(
    {
      symbol,
      status: tab === "all" || tab === "closed" ? undefined : tab,
      closedOnly: tab === "closed" ? true : undefined,
      limit: 100,
    },
    {
      enabled: Boolean(user), // Query signals only when user is authenticated
      refetchInterval: 60_000,
    },
  );

  const { supabaseSignals } = useSupabaseSignals({
    symbol,
    status: tab,
    closedOnly: tab === "closed",
  });

  const rawSignals = query.data && query.data.length > 0 ? query.data : supabaseSignals;

  const displaySignals = useMemo(() => {
    if (marketCategory === "all") return rawSignals;
    return rawSignals.filter((s) => s.market === marketCategory);
  }, [rawSignals, marketCategory]);

  const filteredInstruments = useMemo(() => {
    if (marketCategory === "all") return INSTRUMENTS;
    return INSTRUMENTS.filter((i) => i.market === marketCategory);
  }, [marketCategory]);

  const isLoadingSignals = query.isLoading && supabaseSignals.length === 0;

  return (
    <Layout>
      <section className="py-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Signal feed
            </h1>
            <p className="mt-2 max-w-2xl text-base text-zinc-400">
              Published setups across all covered markets. Every signal is graded against candle tape and kept permanently in the ledger.
            </p>
          </div>
          {user && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-xs text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span>Live Feed · Auto-Refreshing</span>
            </div>
          )}
        </div>

        {/* Loading State for Auth */}
        {isLoadingAuth && (
          <div className="mt-8 space-y-4">
            <SignalCardSkeleton />
            <SignalCardSkeleton />
          </div>
        )}

        {/* Auth Gated Screen: Shown when user is NOT logged in */}
        {!isLoadingAuth && !user && (
          <div className="mt-8 relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#0c120e]/90 p-8 sm:p-12 backdrop-blur-xl shadow-2xl">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

            <div className="mx-auto max-w-md space-y-6 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
                <Lock className="h-7 w-7" />
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Sign In to Access Signals
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Please log in to view active market signal setups, entry zones, stop losses, and target levels.
                </p>
              </div>

              {/* Inline Login Form */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-left shadow-inner space-y-4">
                {errorMsg && (
                  <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleInlineLogin} className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="inline-email" className="block text-xs font-medium text-zinc-300">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input
                        id="inline-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="inline-password" className="block text-xs font-medium text-zinc-300">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input
                        id="inline-password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-10 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loginMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 font-semibold text-sm text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-all duration-150 shadow-lg shadow-emerald-500/20 mt-2 cursor-pointer"
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <span>Sign In & Unlock Signals</span>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Authenticated View: Full Signal Feed */}
        {!isLoadingAuth && user && (
          <>
            {/* Auth Status Ribbon */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-xs text-emerald-300 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>
                  Authenticated as <strong className="text-white font-semibold">{user.name || user.email}</strong> ({user.role.toUpperCase()})
                </span>
              </div>
              <span className="font-mono text-[11px] text-emerald-400/80">
                Session Verified
              </span>
            </div>

            {/* Filter Controls */}
            <div className="mt-8 space-y-3 border-b border-white/10 pb-5">
              {/* Status & Market Category Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Status:</span>
                {STATUS_TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className={cn(
                      "rounded-full border px-3.5 py-1 text-xs font-medium transition-all",
                      tab === t.value
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-2xs"
                        : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {t.label}
                  </button>
                ))}

                <span className="mx-2 h-4 w-px bg-white/10" />

                <span className="mr-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Category:</span>
                {MARKET_TABS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => {
                      setMarketCategory(m.value);
                      setSymbol(undefined);
                    }}
                    className={cn(
                      "rounded-full border px-3.5 py-1 text-xs font-medium transition-all",
                      marketCategory === m.value
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-2xs"
                        : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Individual Asset Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button
                  onClick={() => setSymbol(undefined)}
                  className={cn(
                    "rounded-md border px-3 py-1 font-mono text-xs font-medium transition-all",
                    !symbol
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                      : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  All Assets
                </button>
                {filteredInstruments.map((i) => (
                  <button
                    key={i.symbol}
                    onClick={() => setSymbol(i.symbol)}
                    className={cn(
                      "rounded-md border px-3 py-1 font-mono text-xs font-medium transition-all",
                      symbol === i.symbol
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {i.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* Signal Cards Feed */}
            <div className="mt-8 grid gap-4">
              {isLoadingSignals && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SignalCardSkeleton key={i} />
                  ))}
                </>
              )}
              {!isLoadingSignals && displaySignals.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.01] py-16 px-6 text-center">
                  <p className="text-base font-medium text-white">No signals match this filter right now</p>
                  <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
                    Our rule engine gates setup candidates strictly. When market conditions align, new setups publish automatically.
                  </p>
                </div>
              )}
              {displaySignals.map((s) => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import Layout from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/AuthProvider";
import { Activity, Lock, Mail, User as UserIcon, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

function getPasswordStrength(pass: string) {
  let score = 0;
  if (!pass) return { score: 0, label: "Empty", color: "bg-zinc-700" };
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass) || /[a-z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  if (score <= 1) return { score: 25, label: "Weak", color: "bg-rose-500" };
  if (score === 2) return { score: 50, label: "Fair", color: "bg-amber-500" };
  if (score === 3) return { score: 75, label: "Good", color: "bg-emerald-400" };
  return { score: 100, label: "Strong", color: "bg-emerald-500" };
}

export default function Register() {
  const navigate = useNavigate();
  const { refetchUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      refetchUser();
      navigate("/");
    },
    onError: (err) => {
      setErrorMsg(err.message || "Failed to create account.");
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name || !email || !password) {
      setErrorMsg("Please fill out all required fields.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    registerMutation.mutate({
      name,
      email,
      password,
    });
  };

  return (
    <Layout>
      <div className="relative min-h-[calc(100vh-16rem)] flex items-center justify-center py-12 px-4">
        {/* Glow backdrop effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-md space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/5 mb-2">
              <Activity className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Create an Account
            </h1>
            <p className="text-sm text-zinc-400">
              Join KR-Signal to access signal analytics
            </p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0c120e]/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-5">
            {errorMsg && (
              <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="name"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:bg-white/10 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:bg-white/10 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars with letter & number"
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-10 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:bg-white/10 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {password.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Strength:</span>
                      <span className="font-semibold text-zinc-200">
                        {strength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strength.color}`}
                        style={{ width: `${strength.score}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:bg-white/10 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 font-semibold text-sm text-zinc-950 hover:bg-emerald-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 transition-all duration-150 shadow-lg shadow-emerald-500/20 mt-4"
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <span>Create Account</span>
                )}
              </button>
            </form>
          </div>

          {/* Footer Link */}
          <p className="text-center text-xs text-zinc-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-emerald-400 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

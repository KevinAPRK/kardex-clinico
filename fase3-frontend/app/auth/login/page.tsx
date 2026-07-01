"use client";
// app/auth/login/page.tsx
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const db = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await db.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("Credenciales incorrectas. Verifica tu email y contraseña.");
      setLoading(false);
      return;
    }

    // Supabase asigna sesión; middleware redirige según rol
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(230,167,0,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.10),_transparent_34%),linear-gradient(180deg,_rgba(2,6,23,0.94),_rgba(15,23,42,0.98))]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-[1.75rem] border border-white/10 bg-slate-900/75 px-6 py-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur sm:px-10 sm:py-10">
          <div className="mx-auto mb-8 flex w-fit max-w-full justify-center rounded-[1.25rem] bg-transparent px-0 py-0 shadow-none">
            <Image
              src="/truicios-logo.png"
              alt="Truicios"
              width={706}
              height={339}
              priority
              className="h-auto w-auto max-w-[300px] object-contain sm:max-w-[340px]"
            />
          </div>

          <div className="mx-auto max-w-[560px] text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Iniciar sesión</h2>

            <form onSubmit={handleLogin} className="mx-auto mt-8 space-y-5 text-left sm:max-w-[560px]">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white shadow-sm outline-none transition placeholder:text-slate-500 focus:border-ev-gold focus:ring-4 focus:ring-ev-gold/15"
                  placeholder="usuario@clinica.com"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-sm text-white shadow-sm outline-none transition placeholder:text-slate-500 focus:border-ev-gold focus:ring-4 focus:ring-ev-gold/15"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ev-gold px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_30px_rgba(230,167,0,0.22)] transition hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

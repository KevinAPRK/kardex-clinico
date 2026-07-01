"use client";
// app/auth/login/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ActivitySquare, Eye, EyeOff, Loader2 } from "lucide-react";

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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="hidden flex-col justify-between bg-[#12172a] px-8 py-7 text-white lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-ev-gold/80 text-ev-gold">
              <ActivitySquare className="h-5 w-5" />
            </div>
            <span className="text-[1.05rem] font-semibold tracking-tight text-white">Kardex Evolution</span>
          </div>

          <div className="max-w-[680px] pb-4">
            <blockquote className="max-w-[640px] text-[1.7rem] font-light leading-[1.5] text-slate-200 xl:text-[1.9rem]">
              "Control de inventario hospitalario con trazabilidad completa, FEFO automatizado y alertas en tiempo real."
            </blockquote>

            <div className="mt-8 grid max-w-[680px] grid-cols-3 gap-4">
              {[
                { label: "FEFO", desc: "Automático" },
                { label: "Lotes", desc: "Trazables" },
                { label: "Stock", desc: "Tiempo real" },
              ].map(({ label, desc }) => (
                <div key={label} className="rounded-xl bg-[#262d41] px-4 py-5 shadow-sm">
                  <p className="text-lg font-semibold text-ev-gold">{label}</p>
                  <p className="mt-1 text-sm text-slate-300">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500">Sistema de Inventario Clínico — Todos los derechos reservados</p>
        </section>

        <section className="flex items-center justify-center bg-white px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center lg:text-left">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Iniciar sesión</h2>
              <p className="mt-2 text-sm text-slate-500">Ingresa con tus credenciales institucionales</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-ev-gold focus:ring-4 focus:ring-ev-gold/15"
                  placeholder="usuario@clinica.com"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-ev-gold focus:ring-4 focus:ring-ev-gold/15"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#12172a] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
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

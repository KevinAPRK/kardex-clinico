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

    // Supabase asigna sesión; middleware redirige según rol
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-slate-900 p-10 text-white">
        <div className="flex items-center gap-3">
          <ActivitySquare className="h-8 w-8 text-ev-gold" />
          <span className="text-xl font-semibold tracking-tight">Kardex Evolution</span>
        </div>
        <div>
          <blockquote className="text-2xl font-light leading-relaxed text-slate-300 max-w-md">
            "Control de inventario hospitalario con trazabilidad completa, FEFO automatizado y alertas en tiempo real."
          </blockquote>
          <div className="mt-8 grid grid-cols-3 gap-4">
              {[
              { label: "FEFO", desc: "Automático" },
              { label: "Inventario", desc: "Controlado" },
              { label: "Stock", desc: "Tiempo real" },
            ].map(({ label, desc }) => (
              <div key={label} className="rounded-lg bg-slate-800 p-4">
                <p className="text-ev-gold font-bold text-lg">{label}</p>
                <p className="text-slate-400 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-600">Sistema de Inventario Clínico — Todos los derechos reservados</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <ActivitySquare className="h-6 w-6 text-ev-gold" />
            <span className="font-semibold text-slate-900">Kardex Evolution</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-slate-500">Ingresa con tus credenciales institucionales</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-ev-gold focus:outline-none focus:ring-1 focus:ring-ev-gold"
                placeholder="usuario@clinica.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-ev-gold focus:outline-none focus:ring-1 focus:ring-ev-gold"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ev-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

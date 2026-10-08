import { useCallback, useEffect, useState } from "react";
import { api } from "./api.ts";

/** Ruta con hash: #/p/slug/imagenes → ["p", "slug", "imagenes"]. */
export function useRuta(): string[] {
  const leer = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => setRuta(leer());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return ruta;
}

export function useDatos<T>(ruta: string | null, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const recargar = useCallback(async () => {
    if (!ruta) return;
    setCargando(true);
    try {
      setDatos(await api.get<T>(ruta));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [ruta]);
  useEffect(() => {
    void recargar();
  }, [recargar, ...deps]);
  return { datos, error, cargando, recargar, setDatos };
}

/** Ejecuta una acción mostrando su error, sin bloquear la interfaz. */
export function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const ejecutar = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    setError(null);
    setMensaje(null);
    try {
      const r = await fn();
      if (ok) setMensaje(ok);
      return r;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }, []);
  return { ocupado, error, mensaje, ejecutar, setError };
}

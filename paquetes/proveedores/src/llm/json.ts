import { formatearErrorZod } from "@guion2video/nucleo";
import type { z } from "zod";

/** Saca el JSON de una respuesta de texto (tolera ```json ... ``` y texto alrededor). */
export function extraerJson(texto: string): unknown {
  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidato = bloque ? bloque[1] : texto;
  const inicio = candidato.search(/[[{]/);
  if (inicio < 0) throw new Error("La respuesta no contiene JSON");
  const cierre = candidato[inicio] === "{" ? "}" : "]";
  const fin = candidato.lastIndexOf(cierre);
  return JSON.parse(candidato.slice(inicio, fin + 1));
}

/** Valida contra el esquema Zod y la validación extra; devuelve los errores legibles. */
export function validarRespuesta<T>(
  crudo: unknown,
  esquema: z.ZodType<T>,
  validar?: (d: T) => string[],
): { ok: true; datos: T } | { ok: false; errores: string } {
  const r = esquema.safeParse(crudo);
  if (!r.success) return { ok: false, errores: formatearErrorZod(r.error) };
  const extra = validar?.(r.data) ?? [];
  if (extra.length) return { ok: false, errores: extra.map((e) => `  • ${e}`).join("\n") };
  return { ok: true, datos: r.data };
}

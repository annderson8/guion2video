import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

/** JSON estable: las claves se ordenan para que la huella no dependa del orden de inserción. */
export function jsonEstable(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(valor as object).sort()) {
      const v = (valor as Record<string, unknown>)[clave];
      if (v !== undefined) salida[clave] = ordenar(v);
    }
    return salida;
  }
  return valor;
}

export function sha256(texto: string | Buffer): string {
  return createHash("sha256").update(texto).digest("hex");
}

/** Huella de cualquier conjunto de entradas (objetos, textos, números). */
export function huella(...partes: unknown[]): string {
  return sha256(jsonEstable(partes)).slice(0, 24);
}

/** Huella del contenido de un archivo; "ausente" si no existe. */
export async function huellaArchivo(ruta: string): Promise<string> {
  try {
    await stat(ruta);
  } catch {
    return "ausente";
  }
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(ruta)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex").slice(0, 24)))
      .on("error", reject);
  });
}

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ejecutarComando } from "../medios.ts";
import { ErrorProveedor } from "../http.ts";
import type { ProveedorLlm } from "../tipos.ts";
import { extraerJson, validarRespuesta } from "./json.ts";

/**
 * USO PERSONAL (rama local, no se publica): llama a Claude Code en modo no interactivo
 * (`claude -p`) con la sesión de la suscripción de quien lo ejecuta, en vez de la API.
 * Se quita ANTHROPIC_API_KEY del entorno para que Claude Code no la use en lugar de la sesión.
 */
export function crearClaudeCli(cfg: { modelo: string; esfuerzo: string }): ProveedorLlm {
  const modelo = cfg.modelo;

  async function llamar(sistema: string, mensaje: string, etiqueta: string) {
    // Carpeta vacía: Claude Code no carga CLAUDE.md ni ajustes de ningún proyecto.
    const dir = await mkdtemp(join(tmpdir(), "guion2video-claude-"));
    const entorno = { ...process.env };
    delete entorno.ANTHROPIC_API_KEY;
    try {
      const { stdout } = await ejecutarComando(
        "claude",
        [
          "-p",
          "--output-format", "json",
          "--system-prompt", sistema,
          "--tools", "",
          "--model", modelo,
          "--no-session-persistence",
          "--setting-sources", "",
          "--strict-mcp-config",
          ...(["low", "medium", "high", "max"].includes(cfg.esfuerzo) ? ["--effort", cfg.esfuerzo] : []),
        ],
        { entrada: Buffer.from(mensaje, "utf8"), cwd: dir, env: entorno, timeoutMs: 20 * 60_000 },
      );
      const r = JSON.parse(stdout) as {
        is_error?: boolean;
        result?: string;
        subtype?: string;
        usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
        modelUsage?: Record<string, unknown>;
      };
      if (r.is_error || r.subtype !== "success") {
        const texto = r.result ?? r.subtype ?? "error desconocido";
        const limite = /limit|límite|usage/i.test(texto);
        throw new ErrorProveedor("claude-cli", limite ? `Llegaste al límite de uso de tu suscripción: ${texto}` : `"${etiqueta}": ${texto}`, limite ? 429 : 500, !limite);
      }
      const u = r.usage ?? {};
      return {
        texto: r.result ?? "",
        modelo: Object.keys(r.modelUsage ?? {})[0] ?? modelo,
        tokens: { entrada: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), salida: u.output_tokens ?? 0 },
      };
    } catch (e) {
      if (e instanceof ErrorProveedor) throw e;
      const msg = (e as Error).message;
      if (/No encuentro "claude"/.test(msg)) throw new ErrorProveedor("claude-cli", "No encuentro Claude Code. Instálalo e inicia sesión con `claude`.", 400, false);
      if (/not logged in|login|authenticat/i.test(msg)) throw new ErrorProveedor("claude-cli", "Claude Code no tiene sesión iniciada: ejecuta `claude` e inicia sesión.", 401, false);
      throw new ErrorProveedor("claude-cli", msg.slice(0, 400));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  return {
    id: "claude-cli",
    modelo,
    // Con suscripción no hay cobro por llamada: el costo es parte de tu plan.
    estimarCosto: () => 0,
    async generarJson(pet) {
      const tokens = { entrada: 0, salida: 0 };
      let mensaje = pet.mensaje;
      let modeloUsado = modelo;
      for (let intento = 0; intento < 2; intento++) {
        const r = await llamar(`${pet.sistema}\n\nResponde únicamente con el JSON pedido, sin texto adicional.`, mensaje, pet.etiqueta);
        modeloUsado = r.modelo;
        tokens.entrada += r.tokens.entrada;
        tokens.salida += r.tokens.salida;
        let errores: string;
        try {
          const v = validarRespuesta(extraerJson(r.texto), pet.esquema, pet.validar);
          if (v.ok) return { datos: v.datos, costoUsd: 0, modelo: modeloUsado, tokens };
          errores = v.errores;
        } catch (e) {
          errores = `  • ${(e as Error).message}`;
        }
        if (intento === 1) throw new ErrorProveedor("claude-cli", `"${pet.etiqueta}" devolvió JSON inválido dos veces:\n${errores}`, 422, false);
        // Sin sesión persistente: el reintento lleva la respuesta anterior y los errores en el mensaje.
        mensaje = `${pet.mensaje}\n\n---\nTu respuesta anterior fue:\n${r.texto}\n\nNo cumple el formato pedido:\n${errores}\n\nDevuelve de nuevo el JSON completo y corregido.`;
      }
      throw new Error("inalcanzable");
    },
  };
}

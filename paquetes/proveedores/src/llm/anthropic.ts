import Anthropic from "@anthropic-ai/sdk";
import type { CalculadoraCostos } from "@guion2video/nucleo";
import { ErrorProveedor } from "../http.ts";
import type { ProveedorLlm } from "../tipos.ts";
import { extraerJson, validarRespuesta } from "./json.ts";

type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Claude vía la API de Anthropic. Pide JSON, lo valida con Zod y, si no valida,
 * reintenta una vez en la misma conversación mostrándole el error.
 */
export function crearAnthropic(
  clave: string | undefined,
  cfg: { modelo: string; esfuerzo: Esfuerzo },
  costos: CalculadoraCostos,
): ProveedorLlm {
  let cliente: Anthropic | undefined;
  const obtenerCliente = () => (cliente ??= new Anthropic(clave ? { apiKey: clave } : {}));

  return {
    id: "anthropic",
    modelo: cfg.modelo,
    estimarCosto: (entrada, salida) => costos.llm(cfg.modelo, entrada, salida),
    async generarJson(pet) {
      const mensajes: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: pet.mensaje }];
      let costo = 0;
      const tokens = { entrada: 0, salida: 0 };
      let modeloUsado = cfg.modelo;
      for (let intento = 0; intento < 2; intento++) {
        let respuesta: Anthropic.Beta.Messages.BetaMessage;
        try {
          // Streaming: las respuestas largas (cientos de escenas) no chocan con el timeout HTTP.
          const stream = obtenerCliente().beta.messages.stream({
            model: cfg.modelo,
            max_tokens: pet.maxTokens ?? 64000,
            thinking: { type: "adaptive" },
            output_config: { effort: cfg.esfuerzo },
            // Si un clasificador rechaza la petición (p. ej. por hablar de delitos financieros),
            // la API la reintenta en el modelo de respaldo recomendado en vez de devolver el rechazo.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: [{ type: "text", text: pet.sistema, cache_control: { type: "ephemeral" } }],
            messages: mensajes,
          });
          respuesta = await stream.finalMessage();
        } catch (e) {
          if (e instanceof Anthropic.AuthenticationError) {
            throw new ErrorProveedor("anthropic", "Clave inválida o ausente (ANTHROPIC_API_KEY)", 401, false);
          }
          if (e instanceof Anthropic.BadRequestError) throw new ErrorProveedor("anthropic", e.message, 400, false);
          if (e instanceof Anthropic.RateLimitError) throw new ErrorProveedor("anthropic", e.message, 429, true);
          if (e instanceof Anthropic.APIError) throw new ErrorProveedor("anthropic", e.message, e.status ?? 500);
          throw e;
        }
        modeloUsado = respuesta.model;
        const u = respuesta.usage;
        const entrada = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        tokens.entrada += entrada;
        tokens.salida += u.output_tokens;
        costo += costos.llm(respuesta.model, entrada, u.output_tokens);

        if (respuesta.stop_reason === "refusal") {
          throw new ErrorProveedor("anthropic", `Petición rechazada en "${pet.etiqueta}"`, 400, false);
        }
        if (respuesta.stop_reason === "max_tokens") {
          throw new ErrorProveedor("anthropic", `La respuesta de "${pet.etiqueta}" se cortó por max_tokens`, 400, false);
        }
        const texto = respuesta.content
          .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        let errores: string;
        try {
          const v = validarRespuesta(extraerJson(texto), pet.esquema, pet.validar);
          if (v.ok) return { datos: v.datos, costoUsd: costo, modelo: modeloUsado, tokens };
          errores = v.errores;
        } catch (e) {
          errores = `  • ${(e as Error).message}`;
        }
        if (intento === 1) {
          throw new ErrorProveedor("anthropic", `"${pet.etiqueta}" devolvió JSON inválido dos veces:\n${errores}`, 422, false);
        }
        mensajes.push(
          { role: "assistant", content: respuesta.content as Anthropic.Beta.Messages.BetaContentBlockParam[] },
          {
            role: "user",
            content: `Tu respuesta no cumple el formato pedido:\n${errores}\n\nDevuelve de nuevo el JSON completo y corregido, sin texto adicional.`,
          },
        );
      }
      throw new Error("inalcanzable");
    },
  };
}

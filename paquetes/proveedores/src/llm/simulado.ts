import type { CalculadoraCostos } from "@guion2video/nucleo";
import type { ProveedorLlm } from "../tipos.ts";
import { validarRespuesta } from "./json.ts";

export function crearLlmSimulado(costos?: CalculadoraCostos): ProveedorLlm {
  return {
    id: "simulado",
    modelo: "simulado",
    estimarCosto: (entrada, salida) => costos?.llm("simulado", entrada, salida) ?? 0,
    async generarJson(pet) {
      const v = validarRespuesta(pet.simulacion(), pet.esquema, pet.validar);
      if (!v.ok) throw new Error(`La simulación de "${pet.etiqueta}" no valida:\n${v.errores}`);
      // Tokens aproximados (4 caracteres por token) para que el registro de costos sea realista.
      const tokens = { entrada: Math.ceil((pet.sistema.length + pet.mensaje.length) / 4), salida: Math.ceil(JSON.stringify(v.datos).length / 4) };
      return { datos: v.datos, costoUsd: costos?.llm("simulado", tokens.entrada, tokens.salida) ?? 0, modelo: "simulado", tokens };
    },
  };
}

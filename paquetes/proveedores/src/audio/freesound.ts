import { descargar, exigirClave, pedirJson } from "../http.ts";
import type { CandidatoAudio, ProveedorAudio } from "../tipos.ts";
import { licenciaDesdeUrl } from "./jamendo.ts";

interface SonidoFreesound {
  id: number;
  name: string;
  username: string;
  license: string;
  duration: number;
  url: string;
  previews: Record<string, string>;
}

/** FreeSound: solo CC0 o CC-BY (se guarda la atribución). */
export function crearFreesound(clave: string | undefined): ProveedorAudio {
  return {
    id: "freesound",
    async buscar({ tipo, consulta }) {
      const token = exigirClave("freesound", "FREESOUND_API_KEY", clave);
      const duracion = tipo === "efecto" ? "duration:[0.5 TO 20]" : "duration:[60 TO 900]";
      const params = new URLSearchParams({
        query: consulta,
        filter: `license:("Creative Commons 0" OR "Attribution") ${duracion}`,
        fields: "id,name,username,license,previews,duration,url",
        page_size: "15",
        sort: "rating_desc",
        token,
      });
      const r = await pedirJson<{ results: SonidoFreesound[] }>("freesound", `https://freesound.org/apiv2/search/text/?${params}`);
      return r.results.map<CandidatoAudio>((s) => ({
        id: `freesound-${s.id}`,
        titulo: s.name,
        autor: s.username,
        licencia: licenciaDesdeUrl(s.license),
        url_licencia: s.license,
        url_fuente: s.url,
        duracion_s: s.duration,
        origen: s.previews["preview-hq-mp3"] ?? s.previews["preview-lq-mp3"],
      }));
    },
    descargar: (c) => descargar("freesound", c.origen),
  };
}

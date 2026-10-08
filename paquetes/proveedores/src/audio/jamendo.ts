import { descargar, exigirClave, pedirJson } from "../http.ts";
import type { CandidatoAudio, ProveedorAudio } from "../tipos.ts";

interface PistaJamendo {
  id: string;
  name: string;
  artist_name: string;
  duration: number;
  audiodownload: string;
  audiodownload_allowed: boolean;
  license_ccurl: string;
  shareurl: string;
}

/** Licencias que permiten uso comercial y sincronización con video (sin NC ni ND). */
export const licenciaComercial = (url: string) => /creativecommons\.org\/licenses\/by(-sa)?\//.test(url);

export function crearJamendo(clientId: string | undefined): ProveedorAudio {
  return {
    id: "jamendo",
    async buscar({ tipo, consulta, duracionMinS }) {
      if (tipo !== "musica") return [];
      const id = exigirClave("jamendo", "JAMENDO_CLIENT_ID", clientId);
      const params = new URLSearchParams({
        client_id: id,
        format: "json",
        limit: "30",
        fuzzytags: consulta.replace(/\s+/g, "+"),
        vocalinstrumental: "instrumental",
        audiodlformat: "mp32",
        include: "licenses",
        order: "popularity_total",
      });
      if (duracionMinS) params.set("durationbetween", `${Math.round(duracionMinS)}_1200`);
      const r = await pedirJson<{ results: PistaJamendo[] }>("jamendo", `https://api.jamendo.com/v3.0/tracks/?${params}`);
      return r.results
        .filter((p) => p.audiodownload_allowed && p.audiodownload && licenciaComercial(p.license_ccurl))
        .map<CandidatoAudio>((p) => ({
          id: `jamendo-${p.id}`,
          titulo: p.name,
          autor: p.artist_name,
          licencia: licenciaDesdeUrl(p.license_ccurl),
          url_licencia: p.license_ccurl,
          url_fuente: p.shareurl,
          duracion_s: p.duration,
          origen: p.audiodownload,
        }));
    },
    descargar: (c) => descargar("jamendo", c.origen),
  };
}

export function licenciaDesdeUrl(url: string): string {
  if (/publicdomain\/zero/.test(url)) return "CC0";
  const m = url.match(/licenses\/([a-z-]+)\/([\d.]+)/);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : url;
}

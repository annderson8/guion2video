import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { useEstilo, useResolver } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { ENTRADA_SALIDA, FondoGrafico, progreso } from "./comun.tsx";

export interface PropsLlamado {
  /** Usuario del canal tal como se ve en YouTube ("@RendimientoGarantizado"). */
  canal: string;
  /** Título que se muestra bajo el reproductor simulado (el del video). */
  titulo?: string;
  /** Logo del canal (ruta del proyecto); sin logo se dibuja la inicial. */
  logo?: string;
  /** Línea bajo el nombre ("12,4 mil suscriptores"). Opcional: no se inventa ninguna cifra. */
  suscriptores?: string;
  /** Frames (desde el inicio del segmento) en que el cursor hace clic en cada botón. */
  clics?: { suscribir?: number; like?: number };
  /** Duración del segmento en frames. */
  duracion: number;
}

// Geometría del "reproductor" simulado. Todo se dibuja en una columna de 1360 px centrada en 1920×1080,
// y las posiciones de los botones salen de aquí para que el cursor llegue exactamente a donde debe.
const COLUMNA = { ancho: 1360, izquierda: 280 };
const FILA = { y: 536, alto: 76 };
const SUSCRIBIR = { x: 640, ancho: 300 };
const LIKE = { x: 1030, ancho: 330, mitad: 180 };
const OBJETIVO = {
  suscribir: { x: SUSCRIBIR.x + SUSCRIBIR.ancho / 2, y: FILA.y + FILA.alto / 2 },
  like: { x: LIKE.x + LIKE.mitad / 2, y: FILA.y + FILA.alto / 2 },
};

type Boton = keyof typeof OBJETIVO;
interface Clic {
  boton: Boton;
  frame: number;
}

/** Clic del cursor: de 0 a 1 en unos frames y de vuelta, para encoger el cursor y el botón. */
const pulso = (frame: number, clic: number) =>
  interpolate(frame, [clic - 2, clic, clic + 5], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

function IconoLike({ tam, color, relleno }: { tam: number; color: string; relleno: boolean }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill={relleno ? color : "none"} stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
      <path d="M7 10v11H3V10h4Zm0 0 4-7c1.7 0 2.7 1.3 2.4 3L13 10h6.2c1.2 0 2.1 1.1 1.8 2.3l-1.7 7.2c-.2.9-1 1.5-1.9 1.5H7" />
    </svg>
  );
}

function IconoCampana({ tam, color }: { tam: number; color: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M12 22a2.5 2.5 0 0 0 2.4-1.8h-4.8A2.5 2.5 0 0 0 12 22Zm7-5.5V11a7 7 0 0 0-5.5-6.8V3.5a1.5 1.5 0 0 0-3 0v.7A7 7 0 0 0 5 11v5.5L3.5 18v1h17v-1L19 16.5Z" />
    </svg>
  );
}

function Cursor({ x, y, apretado }: { x: number; y: number; apretado: number }) {
  return (
    <svg width={54} height={54} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, transform: `scale(${1 - apretado * 0.2})`, transformOrigin: "3px 2px", filter: "drop-shadow(0 6px 10px rgba(0,0,0,.55))" }}>
      <path d="M3 2v17l4.6-4.2 3 6.6 2.7-1.2-3-6.5H17L3 2Z" fill="#fff" stroke="#111" strokeWidth={1.3} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Simula la pantalla de un video de YouTube: el cursor llega al botón de suscribirse y al de me gusta, hace clic
 * y cada botón cambia de estado. Los frames de los clics se sincronizan con las palabras narradas.
 */
export function LlamadoSuscripcion({ canal, titulo, logo, suscriptores, clics, duracion }: PropsLlamado) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { colores, tipografia } = useEstilo();
  const resolver = useResolver();
  const fuente = familia(tipografia.subtitulos);

  // Orden de los clics según lo que dice la voz; si falta alguno, se reparte en el tiempo.
  const lista: Clic[] = (
    [
      { boton: "suscribir" as const, frame: clics?.suscribir ?? Math.round(duracion * 0.4) },
      { boton: "like" as const, frame: clics?.like ?? Math.round(duracion * 0.65) },
    ]
  ).sort((a, b) => a.frame - b.frame);

  // Trayectoria del cursor: entra desde abajo a la derecha y llega a cada botón 5 frames antes del clic.
  const waypoints: { f: number; x: number; y: number }[] = [{ f: 0, x: COLUMNA.ancho + 90, y: 880 }];
  for (const c of lista) {
    const previo = waypoints[waypoints.length - 1];
    const sale = previo.f === 0 ? 0 : previo.f + 8;
    const llega = Math.max(c.frame - 5, sale + 10);
    waypoints.push({ f: sale, x: previo.x, y: previo.y }, { f: llega, x: OBJETIVO[c.boton].x, y: OBJETIVO[c.boton].y });
  }
  let cx = waypoints[0].x;
  let cy = waypoints[0].y;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    if (frame >= a.f && frame <= b.f && b.f > a.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: ENTRADA_SALIDA });
      cx = a.x + (b.x - a.x) * t;
      cy = a.y + (b.y - a.y) * t;
      break;
    }
    if (frame > b.f) {
      cx = b.x;
      cy = b.y;
    }
  }
  // Un temblor mínimo para que no parezca un robot.
  cx += Math.sin(frame / 5) * 1.4;
  cy += Math.cos(frame / 6) * 1.4;

  const clicSub = lista.find((c) => c.boton === "suscribir")!.frame;
  const clicLike = lista.find((c) => c.boton === "like")!.frame;
  const suscrito = frame >= clicSub;
  const gustado = frame >= clicLike;
  const ultimoClic = lista[lista.length - 1].frame;
  const apretado = Math.max(...lista.map((c) => pulso(frame, c.frame)));

  const entrada = progreso(frame, 0, 16);
  const camara = 1 + interpolate(frame, [0, duracion], [0, 0.05]);

  // Estado de los botones.
  const cambioSub = progreso(frame, clicSub, clicSub + 6);
  const saltoLike = spring({ frame: frame - clicLike, fps, config: { damping: 8, stiffness: 220 }, durationInFrames: 22 });
  const campana = frame >= clicSub ? Math.sin((frame - clicSub) * 0.9) * 22 * Math.max(0, 1 - (frame - clicSub) / 26) : 0;

  const superficie = "rgba(255,255,255,0.1)";
  const tenue = "rgba(255,255,255,0.62)";
  const tituloVideo = titulo?.trim();
  const inicial = canal.replace(/^@/, "").charAt(0).toUpperCase() || "C";
  const tamNombre = canal.length > 24 ? 28 : 34;

  const onda = (clic: number, boton: Boton) => {
    const t = progreso(frame, clic, clic + 16);
    if (frame < clic || t >= 1) return null;
    return (
      <div
        key={`onda-${boton}`}
        style={{
          position: "absolute",
          left: OBJETIVO[boton].x - 80,
          top: OBJETIVO[boton].y - 80,
          width: 160,
          height: 160,
          borderRadius: "50%",
          border: `4px solid ${colores.acento}`,
          opacity: 0.8 * (1 - t),
          transform: `scale(${0.2 + t * 1.1})`,
        }}
      />
    );
  };

  // Chispas del me gusta: seis puntos que salen del pulgar.
  const chispas = Array.from({ length: 6 }, (_, i) => {
    const t = progreso(frame, clicLike + 1, clicLike + 20);
    if (frame <= clicLike || t >= 1) return null;
    const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const r = 30 + t * 46;
    return (
      <div
        key={i}
        style={{ position: "absolute", left: OBJETIVO.like.x + Math.cos(ang) * r - 5, top: OBJETIVO.like.y + Math.sin(ang) * r - 5, width: 10, height: 10, borderRadius: "50%", background: colores.acento, opacity: 1 - t, transform: `scale(${1 - t * 0.5})` }}
      />
    );
  });

  return (
    <FondoGrafico>
      <AbsoluteFill style={{ opacity: entrada, transform: `scale(${camara}) translateY(${(1 - entrada) * 24}px)`, transformOrigin: "50% 45%" }}>
        <div style={{ position: "absolute", left: COLUMNA.izquierda, top: 0, width: COLUMNA.ancho, height: 1080, fontFamily: fuente, color: "#fff" }}>
          {/* Reproductor */}
          <div style={{ position: "absolute", left: 0, top: -40, width: COLUMNA.ancho, height: 460, borderRadius: "0 0 28px 28px", overflow: "hidden", background: `linear-gradient(135deg, ${colores.acento}33, #05070a 70%)`, boxShadow: "0 30px 80px rgba(0,0,0,.55)" }}>
            <svg width="100%" height="100%" viewBox="0 0 1360 460" style={{ position: "absolute", inset: 0 }}>
              <circle cx={680} cy={250} r={64} fill="rgba(0,0,0,.45)" />
              <path d="M660 218v64l52-32-52-32Z" fill="#fff" opacity={0.92} />
            </svg>
            <div style={{ position: "absolute", left: 28, right: 28, bottom: 28, height: 6, borderRadius: 3, background: "rgba(255,255,255,.3)" }}>
              <div style={{ width: `${22 + (frame / duracion) * 6}%`, height: "100%", borderRadius: 3, background: colores.alerta }} />
              <div style={{ position: "absolute", left: `${22 + (frame / duracion) * 6}%`, top: -5, width: 16, height: 16, borderRadius: "50%", background: colores.alerta, transform: "translateX(-50%)" }} />
            </div>
          </div>

          {/* Título del video */}
          {tituloVideo && (
            <div style={{ position: "absolute", left: 0, top: 452, width: COLUMNA.ancho, fontWeight: 700, fontSize: 40, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tituloVideo}</div>
          )}

          {/* Fila del canal */}
          <div style={{ position: "absolute", left: 0, top: FILA.y, width: 84, height: 84, borderRadius: "50%", overflow: "hidden", background: colores.acento, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 44, color: colores.fondo }}>
            {logo ? <Img src={resolver(logo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : inicial}
          </div>
          <div style={{ position: "absolute", left: 108, top: FILA.y, width: 512, height: FILA.alto + 8, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontWeight: 700, fontSize: tamNombre, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{canal}</div>
            {suscriptores && <div style={{ fontSize: 26, color: tenue, marginTop: 2 }}>{suscriptores}</div>}
          </div>

          {/* Botón de suscribirse */}
          <div
            style={{
              position: "absolute",
              left: SUSCRIBIR.x,
              top: FILA.y,
              width: SUSCRIBIR.ancho,
              height: FILA.alto,
              borderRadius: FILA.alto / 2,
              overflow: "hidden",
              transform: `scale(${1 - pulso(frame, clicSub) * 0.06})`,
              background: suscrito ? superficie : "#fff",
              boxShadow: suscrito ? "none" : `0 0 0 ${3 + Math.sin(frame / 8) * 2}px ${colores.acento}55`,
            }}
          >
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 30, color: "#0f0f0f", opacity: 1 - cambioSub }}>Suscribirse</div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontWeight: 700, fontSize: 30, color: "#fff", opacity: cambioSub }}>
              <span style={{ display: "inline-flex", transform: `rotate(${campana}deg)`, transformOrigin: "50% 15%" }}>
                <IconoCampana tam={34} color="#fff" />
              </span>
              Suscrito
            </div>
          </div>

          {/* Me gusta / no me gusta */}
          <div style={{ position: "absolute", left: LIKE.x, top: FILA.y, width: LIKE.ancho, height: FILA.alto, borderRadius: FILA.alto / 2, background: superficie, overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: LIKE.mitad,
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: gustado ? `${colores.acento}30` : "transparent",
                transform: `scale(${1 - pulso(frame, clicLike) * 0.06})`,
              }}
            >
              <span style={{ display: "inline-flex", transform: gustado ? `translateY(${-14 * Math.sin(Math.min(1, saltoLike) * Math.PI)}px) scale(${1 + 0.25 * Math.sin(Math.min(1, saltoLike) * Math.PI)})` : undefined }}>
                <IconoLike tam={40} color={gustado ? colores.acento : "#fff"} relleno={gustado} />
              </span>
            </div>
            <div style={{ position: "absolute", left: LIKE.mitad, top: 18, width: 2, height: FILA.alto - 36, background: "rgba(255,255,255,.25)" }} />
            <div style={{ position: "absolute", left: LIKE.mitad, top: 0, width: LIKE.ancho - LIKE.mitad, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", transform: "scaleY(-1)" }}>
              <IconoLike tam={40} color="#fff" relleno={false} />
            </div>
          </div>

          {/* Comentarios de relleno que se desvanecen hacia abajo */}
          <div style={{ position: "absolute", left: 0, top: 680, width: COLUMNA.ancho, height: 200, overflow: "hidden", WebkitMaskImage: "linear-gradient(#000 20%, transparent)", maskImage: "linear-gradient(#000 20%, transparent)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", gap: 22, marginBottom: 34, alignItems: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: superficie, flex: "none" }} />
                <div>
                  <div style={{ width: 180 + i * 50, height: 16, borderRadius: 8, background: superficie, marginBottom: 12 }} />
                  <div style={{ width: 640 - i * 90, height: 16, borderRadius: 8, background: "rgba(255,255,255,.06)" }} />
                </div>
              </div>
            ))}
          </div>

          {onda(clicSub, "suscribir")}
          {onda(clicLike, "like")}
          {chispas}
          <Cursor x={cx} y={cy} apretado={apretado} />
        </div>
      </AbsoluteFill>
      {/* Tras el último clic, el cursor se queda quieto; este velo evita que la escena se corte en seco. */}
      <AbsoluteFill style={{ background: colores.fondo, opacity: progreso(frame, Math.max(ultimoClic + 40, duracion - 12), duracion) * 0.6, pointerEvents: "none" }} />
    </FondoGrafico>
  );
}

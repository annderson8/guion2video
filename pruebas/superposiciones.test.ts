import { describe, expect, it } from "vitest";
import { compilarAnimacion } from "@guion2video/pasos";

const valida = `function Superposicion({ duracion, momento }) {
  const frame = useCurrentFrame();
  const entra = momento("imposibles") ?? 0;
  const t = spring({ frame: frame - entra, fps: 30 });
  return <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: t }}>
    <Iconos.TriangleAlert size={64} color={tema.colores.acento} />
    <span style={{ fontFamily: tema.fuentes.titulos, fontSize: 96 }}>RENDIMIENTOS IMPOSIBLES</span>
  </AbsoluteFill>;
}`;

describe("compilarAnimacion", () => {
  it("compila el JSX de Claude a JavaScript sin JSX", () => {
    const r = compilarAnimacion(valida);
    expect("js" in r).toBe(true);
    if ("js" in r) {
      expect(r.js).toContain("React.createElement");
      expect(r.js).toContain("function Superposicion");
    }
  });

  it("devuelve el error de sintaxis para que Claude lo corrija", () => {
    const r = compilarAnimacion("function Superposicion() { return <div>; }");
    expect("error" in r && r.error.length > 0).toBe(true);
  });

  it("exige declarar function Superposicion", () => {
    const r = compilarAnimacion("const Otra = () => <div>hola, esta animación no tiene el nombre esperado</div>;");
    expect(r).toEqual({ error: 'debe declarar "function Superposicion(props)"' });
  });

  it.each(["fetch('http://x')", "window.location", "Math.random()", "new Date()", "document.body", "setTimeout(f, 1)"])("bloquea %s", (prohibido) => {
    const r = compilarAnimacion(`function Superposicion() { ${prohibido}; return null; }`);
    expect("error" in r && r.error).toMatch(/no está permitido/);
  });

  it("no confunde palabras en español con nombres bloqueados", () => {
    const r = compilarAnimacion(`function Superposicion() { return <span>documento importante del proceso</span>; }`);
    expect("js" in r).toBe(true);
  });
});

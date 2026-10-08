export class ErrorGuion2Video extends Error {
  constructor(
    mensaje: string,
    readonly codigo:
      | "revision_pendiente"
      | "presupuesto"
      | "dependencia"
      | "validacion"
      | "proveedor"
      | "configuracion"
      | "no_encontrado" = "validacion",
  ) {
    super(mensaje);
    this.name = "ErrorGuion2Video";
  }
}

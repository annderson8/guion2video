# Cómo contribuir

¡Gracias por querer mejorar guion2video!

1. Abre un *issue* antes de un cambio grande, para acordar el enfoque.
2. `corepack enable && pnpm install`, y trabaja en una rama.
3. Antes de abrir el *pull request*:
   ```bash
   pnpm typecheck
   pnpm test        # siempre en modo simulado: no gasta dinero
   ```
4. Si cambias la lógica de un paso, sube su `VERSION` en el archivo del paso. Así los proyectos existentes saben que deben regenerarlo.

## Convenciones

- El código, los comentarios y los mensajes van en español, como el resto del proyecto.
- Los nombres de modelo y los precios van en `configuracion.json` y `tarifas.json`, nunca en el código.
- Un proveedor nuevo implementa la interfaz de `paquetes/proveedores/src/tipos.ts`, tiene su versión simulada y se registra en `registro.ts`.
- `render` no llama a ninguna API: solo lee `timeline.json` y archivos.
- No incluyas claves, proyectos generados ni material con derechos de autor.

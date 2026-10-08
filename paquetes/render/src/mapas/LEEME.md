# Mapas

- `colombia.json`: departamentos de Colombia (simplificado). Origen: gist de John Guerra "Colombia.geo.json" (datos derivados del DANE).
- `paises.json`: países del mundo (simplificado). Origen: Natural Earth 1:50m, dominio público.

Para regenerarlos o añadir otro país con divisiones internas, deja un GeoJSON con la propiedad `nombre` en cada feature y regístralo en `componentes/MapaRegion.tsx`.

#!/usr/bin/env bash
# Uso: despliegue/desplegar.sh   (desde tu Mac; sube el código y reconstruye en el VPS)
set -euo pipefail
VPS="${VPS:-annderson@179.236.69.209}"
LLAVE="${LLAVE:-$HOME/.ssh/linkea_hostinger}"
DESTINO="${DESTINO:-/home/annderson/guion2video}"
SSH="ssh -i $LLAVE"
cd "$(dirname "$0")/.."

# Código (sin proyectos, claves ni node_modules). Los estilos solo se siembran la primera vez.
rsync -az --delete -e "$SSH" \
  --exclude .git --exclude node_modules --exclude proyectos --exclude .env \
  --exclude .guion2video-tmp --exclude datos --exclude estilos --exclude 'paquetes/web/dist' \
  ./ "$VPS:$DESTINO/"
rsync -az --ignore-existing -e "$SSH" estilos/ "$VPS:$DESTINO/despliegue/datos/estilos/"

$SSH "$VPS" "set -e; cd $DESTINO/despliegue
  mkdir -p datos/proyectos; touch datos/.env; chmod 600 datos/.env
  docker compose up -d --build
  docker compose ps"
echo "Listo. Claves: súbelas desde la interfaz (Configuración) o con scp a $DESTINO/despliegue/datos/.env"

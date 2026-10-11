FROM node:22-bookworm-slim

# ffmpeg + librerías que necesita el Chrome headless de Remotion + fuentes
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-dejavu-core fonts-liberation ca-certificates \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libasound2 libxrandr2 \
      libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libgbm1 libcups2 \
      libcairo2 libpango-1.0-0 libx11-6 libxext6 libxcb1 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @guion2video/web build \
 && pnpm --filter @guion2video/render exec remotion browser ensure

# Claude Code: el proyecto lo invoca como `claude` (proveedor claude-cli). La sesión se guarda
# en el volumen /data/claude (CLAUDE_CONFIG_DIR) para sobrevivir a reconstrucciones.
RUN npm install -g @anthropic-ai/claude-code

ENV CLAUDE_CONFIG_DIR=/data/claude GUION2VIDEO_HOST=0.0.0.0 GUION2VIDEO_PUERTO_API=4310 NODE_ENV=production
EXPOSE 4310
CMD ["pnpm", "api"]

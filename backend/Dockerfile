# Debian (glibc), NOT Alpine: onnxruntime-node (the engine behind the local embedding models) ships glibc-only
# binaries and fails on Alpine's musl with "Error loading shared library ld-linux-x86-64.so.2".
# Builds for linux/amd64 and linux/arm64 (Oracle's free Ampere A1 servers are ARM).
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# onnxruntime-node downloads ~hundreds of MB of CUDA (GPU) libraries on linux/x64 during install; we run on CPU only.
# Skipping them keeps the image small (it was 3.2 GB) and the install fast and offline-safe.
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# /logs: the scraper logger resolves it relative to the app dir, which a non-root user cannot create.
# /models: the embedding models (~0.7 GB) download here on first use; mount a volume on it so they survive restarts.
RUN mkdir -p /logs /models && chown node:node /logs /models
ENV EMBEDDING_CACHE_DIR=/models
USER node
EXPOSE 5000
# no wget/curl in the slim image: use node itself
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD node -e "fetch('http://localhost:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

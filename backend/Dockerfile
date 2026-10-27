FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# the scraper logger writes to /logs (resolved relative to the app dir), which a non-root user cannot create
RUN mkdir -p /logs && chown node:node /logs
USER node
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:5000/api/health || exit 1
CMD ["node", "server.js"]

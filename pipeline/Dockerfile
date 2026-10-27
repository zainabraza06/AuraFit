FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# One image, two roles: docker-compose picks `node src/consumer/index.js` or `node src/worker/index.js`
USER node
EXPOSE 9100
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:9100/healthz || exit 1
CMD ["node", "src/consumer/index.js"]

# Optional API image for Fly.io / Render / any container host.
# GitHub Pages cannot run this — frontend is static-only.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]

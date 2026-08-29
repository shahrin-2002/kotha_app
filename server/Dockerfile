# Kotha backend — Node + tsx (TypeScript run directly, no build step)
FROM node:20-slim

WORKDIR /app

# Install deps first (better layer caching).
# Note: tsx + typescript are devDependencies but required at runtime, so install all.
COPY package.json package-lock.json* ./
RUN npm install

# App source
COPY . .

# Cloud platforms inject PORT; server reads process.env.PORT (defaults to 3001)
ENV NODE_ENV=production
EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]

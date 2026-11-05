# syntax=docker/dockerfile:1

# ---------- base: dependencias ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# ---------- dev: Vite con hot reload ----------
FROM node:24-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------- build: bundle de producción ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- prod: estáticos servidos por nginx ----------
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# Integration addition (not from CMS upstream): builds the CMS React/Vite SPA
# and serves it via nginx. Kept alongside the vendored source so the Docker
# build context stays local. See ../../CONTRACTS.md.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The SPA calls the API at a relative /api (see src/api.js), so it is served
# same-origin under the contracts subdomain — Caddy proxies /api to the backend.
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

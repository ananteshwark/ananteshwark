FROM node:20-alpine as build

WORKDIR /app

RUN npm install -g pnpm@9.15.4

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

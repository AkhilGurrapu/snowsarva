FROM node:18 AS build
WORKDIR /app
COPY react/package*.json ./
RUN npm install
COPY react/. .
RUN npm run build

FROM nginx:alpine
EXPOSE 8080
COPY --from=build /app/dist /usr/share/nginx/html
RUN sed -i 's/listen       80;/listen 8080;/' /etc/nginx/conf.d/default.conf || true
CMD ["nginx", "-g", "daemon off;"]

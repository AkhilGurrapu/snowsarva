FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files
COPY public/ /usr/share/nginx/html/

# Add non-root user
RUN adduser -D -s /bin/sh -u 1001 app \
    && chown -R app:app /usr/share/nginx/html \
    && chown -R app:app /var/cache/nginx \
    && chown -R app:app /var/log/nginx \
    && chown -R app:app /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown -R app:app /var/run/nginx.pid

USER app

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/health.html || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
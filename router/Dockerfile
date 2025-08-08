FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create non-root user
RUN adduser -D -s /bin/sh -u 1001 app \
    && chown -R app:app /var/cache/nginx \
    && chown -R app:app /var/log/nginx \
    && chown -R app:app /etc/nginx \
    && touch /var/run/nginx.pid \
    && chown -R app:app /var/run/nginx.pid

USER app

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["nginx", "-g", "daemon off;"]
FROM nginx:1.28.0-alpine
RUN mkdir -p /logs && chown -R nginx:nginx /logs /var/cache/nginx
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html app.js style.css /usr/share/nginx/html/
USER nginx
EXPOSE 8080

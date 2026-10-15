FROM grafana/promtail:3.5.1
USER root
RUN mkdir -p /positions && chown 10001:10001 /positions
USER 10001:10001

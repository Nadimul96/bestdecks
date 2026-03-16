FROM ghcr.io/presenton/presenton:latest

COPY scripts/presenton/get_layout_by_name.py /app/servers/fastapi/utils/get_layout_by_name.py

# Render.com requires the container to listen on $PORT (default 10000).
# Presenton's nginx is hardcoded to port 80, so we patch it at startup.
COPY deploy/presenton/start.sh /start-render.sh
RUN chmod +x /start-render.sh

CMD ["/start-render.sh"]

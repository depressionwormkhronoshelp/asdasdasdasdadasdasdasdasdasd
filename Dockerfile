# XTV: один образ для Render и Hugging Face Spaces
FROM php:8.3-cli
RUN printf "upload_max_filesize=16M\npost_max_size=20M\n" > /usr/local/etc/php/conf.d/xtv.ini
WORKDIR /app
COPY web/ /app/
RUN mkdir -p /app/public/live/stream && chmod -R 777 /app/public/live/stream
# Render передаёт порт в $PORT, Hugging Face ждёт 7860
ENV PORT=7860 PHP_CLI_SERVER_WORKERS=8
EXPOSE 7860
CMD ["sh", "-c", "exec php -S 0.0.0.0:${PORT} -t public router.php"]

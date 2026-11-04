FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS ui-builder
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY ui/ ./
RUN npm run build

FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runtime
ENV NODE_ENV=production \
    DATA_DIR=/data \
    SERVER_PORT=5163
WORKDIR /app
RUN addgroup -S app -g 1001 && adduser -S app -u 1001 -G app
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev --omit=optional --ignore-scripts
COPY server/ ./server/
COPY --from=ui-builder /ui/dist ./ui/dist
RUN mkdir -p /data && chown -R app:app /data /app
USER app
VOLUME ["/data"]
EXPOSE 5163 51826
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${SERVER_PORT}/api/state || exit 1
CMD ["node", "server/index.js"]

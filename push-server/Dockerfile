FROM node:24-alpine
WORKDIR /app/push-server
COPY push-server/package.json push-server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY streak.js streak-themes.js /app/
COPY push-server/server.cjs ./
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
EXPOSE 3000
CMD ["node", "server.cjs"]

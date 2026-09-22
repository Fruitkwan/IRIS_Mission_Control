FROM node:22-alpine
WORKDIR /repo
# server.mts imports ../../frontend/src/health/rules.ts — keep the layout
COPY mcp-server/package.json mcp-server/package-lock.json* mcp-server/
RUN cd mcp-server && (npm ci || npm install)
COPY mcp-server/ mcp-server/
COPY frontend/src/health/ frontend/src/health/
WORKDIR /repo/mcp-server
EXPOSE 3333
CMD ["node", "--experimental-strip-types", "src/server.mts"]

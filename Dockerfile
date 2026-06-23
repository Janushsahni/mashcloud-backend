# Stage 1: Build the React client
# MASHCLOUD_DOCKER_SIGNATURE: Handcrafted by Janush sahni.
FROM node:20-alpine AS client-build
LABEL maintainer="Janush sahni"
LABEL mashcloud_signature="Handcrafted with excellence by Janush sahni. Built for privacy, secured with Pentaract E2EE. © 2026."
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Setup the Express server
FROM node:20-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --production

# Copy server code
COPY server/ ./

# Copy built client from Stage 1
COPY --from=client-build /app/client/dist /app/client/dist

# Expose port
EXPOSE 3005

# Setup volume for persistent database and uploads
VOLUME ["/app/server/uploads"]

# Fix: Force IPv4 DNS resolution (Node.js tries IPv6 first in Alpine, causing Telegram API timeouts)
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# Run the server
CMD ["node", "server.js"]

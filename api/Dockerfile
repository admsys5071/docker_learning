# ---- Stage 1: Install dependencies ----
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 2: Production image ----
FROM node:18-alpine

# Install curl for healthchecks
RUN apk add --no-cache curl

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Switch to non-root user
USER appuser

EXPOSE 3000

CMD ["node", "server.js"]

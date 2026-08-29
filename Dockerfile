# Step 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions and tsconfig
COPY package*.json tsconfig.json ./

# Install dependencies (ignore-scripts prevents premature build before source code is copied)
RUN npm ci --ignore-scripts

# Copy source code and build TypeScript to JS
COPY . .
RUN npm run build

# Step 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled code and public assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 5000

CMD ["node", "dist/index.js"]

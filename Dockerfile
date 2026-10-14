# Use official lightweight Node.js Alpine image
FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]

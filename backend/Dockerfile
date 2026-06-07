FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy prisma schema first for generation
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source and config
COPY tsconfig.json .
COPY prisma.config.ts .
COPY src ./src/
COPY templates ./templates/

# Build the project
RUN npm run build

# Copy entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8001

# Run the entrypoint script
ENTRYPOINT ["./entrypoint.sh"]

FROM node:18-bullseye

WORKDIR /app

# Install dependencies
COPY package*.json ./

# Install all dependencies including devDependencies (needed for tsc)
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]

# ---------------------------
# Stage 1: Build the React application
# ---------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package config and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the application source code 
COPY . .

# Build the React app (outputs to the /dist folder)
# We expect the platform to inject VITE_API_URL here during the build step
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------------------------
# Stage 2: Serve the compiled static assets
# ---------------------------
FROM node:20-alpine AS server

WORKDIR /app

# Install 'serve', a lightweight robust static file server
RUN npm install -g serve

# Copy over the built assets from the builder stage
COPY --from=builder /app/dist ./dist

# Keep the container running lightweight by using serve
# Note: -s enables "Single Page Application" mode to route all 404s back to index.html (for React Router)
CMD serve -s dist -l ${PORT:-3000}
EXPOSE 3000

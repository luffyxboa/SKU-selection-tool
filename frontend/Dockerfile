FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# CRITICAL: We must declare this ARG so Docker knows to look for it passed from Railway
ARG VITE_API_URL
# Make it available as an ENV so Vite can read it during the build step
ENV VITE_API_URL=$VITE_API_URL

# Build the frontend (Vite permanently bakes VITE_API_URL into the HTML/JS here)
RUN npm run build

# Install a simple static file server (since Nginx isn't used)
RUN npm install -g serve

# Railway provides the PORT environment variable dynamically (defaults to 80 locally)
ENV PORT=80
EXPOSE $PORT

# Serve the 'dist' directory as a Single Page Application (-s)
CMD ["sh", "-c", "serve -s dist -l $PORT"]

FROM node:22-slim AS base
WORKDIR /app

# Install Python 3 for Docling/parser
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Setup Python virtual environment
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
RUN pip install --no-cache-dir pypdf pdfplumber docling

# Install Node dependencies
COPY package*.json ./
RUN npm ci

# Copy project source
COPY . .

# Build frontend and server
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server.cjs"]

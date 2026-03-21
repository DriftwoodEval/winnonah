# Spin up needed Docker containers for development
deps:
    docker compose up -d driftwood-db redis cloudflared

# Turn off Docker containers
down:
    docker compose down

# Start the Python API with hot-reloading
python-dev:
    cd python && uv run uvicorn api:app --reload --port 8000

# Start development server, bringing up and installing dependencies first
dev:
    docker compose up -d driftwood-db redis cloudflared
    trap "docker compose down" EXIT INT TERM; \
    pnpm install && \
    (cd python && uv run uvicorn api:app --reload --port 8000 & pnpm dev)

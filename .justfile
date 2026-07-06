set dotenv-load

# Run `dev` when running `just` with no args
default: dev

# Spin up needed Docker containers for development
deps:
    docker compose up -d driftwood-db redis cloudflared

# Turn off Docker containers
down:
    docker compose down

# Start the Python API with hot-reloading
python-dev:
    cd python && uv run uvicorn api:app --reload --port 8000

# Sync the production database down to the local container
sync-db:
    @WAS_RUNNING="$(docker ps -q -f name=driftwood-db -f status=running)"; \
    if [ -z "$WAS_RUNNING" ]; then \
        echo "Database container is not running. Starting driftwood-db..."; \
        docker compose up -d driftwood-db; \
        echo "Waiting for database to become healthy..."; \
        while ! docker compose ps driftwood-db --format json | grep -q '"Health":"healthy"'; do \
            sleep 0.5; \
        done; \
    fi; \
    echo "Syncing production database..."; \
    ssh opti "cat backup.sql.gz" | (pigz -dc 2>/dev/null || gunzip) | sed '/GTID_PURGED/d' | docker exec -i driftwood-db mysql -u root -p"${MYSQL_ROOT_PASSWORD}" driftwood; \
    echo "Database sync complete!"; \
    if [ -z "$WAS_RUNNING" ]; then \
        echo "Shutting down automatically started database container..."; \
        docker compose stop driftwood-db; \
    fi

# Start development server, bringing up and installing dependencies first
dev: deps
    pnpm install
    trap "docker compose down" EXIT INT TERM; \
    (cd python && uv run uvicorn api:app --reload --port 8000) & \
    pnpm dev

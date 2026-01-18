# Spin up needed Docker containers for development
deps:
  docker compose up -d driftwood-db redis cloudflared

# Turn off Docker containers
down:
  docker compose down

# Start development server, bringing up and installing dependencies first
dev: deps
  pnpm install
  pnpm dev

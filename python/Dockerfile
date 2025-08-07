FROM selenium/standalone-chrome:4 AS base
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

FROM base AS build
USER root
WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen

COPY . .

FROM base
COPY --from=build /app /app

CMD ["uv", "run", "main.py"]

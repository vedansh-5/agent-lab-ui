# Use the official Python lightweight image
FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install the project into /app
COPY . /app
WORKDIR /app

# Allow statements and log messages to immediately appear in the logs
ENV PYTHONUNBUFFERED=1


ARG PORT=8080
ENV PORT=${PORT}

# Install dependencies
RUN uv sync

EXPOSE $PORT

CMD uv run fastmcp run server.py --transport http --port $PORT --host 0.0.0.0
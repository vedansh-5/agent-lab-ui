# Use an official Python runtime as a parent image
FROM python:3.12-slim-bookworm

# The installer requires curl (and certificates) to download the release archive
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates

# Download the latest installer
ADD https://astral.sh/uv/install.sh /uv-installer.sh

# Run the installer then remove it
RUN sh /uv-installer.sh && rm /uv-installer.sh

# Ensure the installed binary is on the `PATH`
ENV PATH="/root/.local/bin/:$PATH"
ENV UV_SYSTEM_PYTHON=1

# Set the working directory in the container
WORKDIR /app

# Set environment variables to prevent Python from writing pyc files to disc
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1


# Copy the pyproject.toml file into the container
COPY pyproject.toml .


# Install dependencies using uv
# --system installs packages into the system's site-packages, which is standard for containers.
RUN uv pip install --no-cache --system -r pyproject.toml

# Copy the application code into the container
COPY . .

# Cloud Run will set the PORT environment variable.
# The application's __main__.py is configured to read this variable.
# We expose port 8080 as a default, but Cloud Run's PORT variable will take precedence.
EXPOSE 8080

# Command to run the application
CMD uv run . --host 0.0.0.0 --app-url-override $APP_URL_OVERRIDE
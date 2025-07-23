# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Set environment variables to prevent Python from writing pyc files to disc
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install uv for package management
RUN pip install uv

# Copy the requirements file into the container
COPY requirements.txt .

# Install dependencies using uv
RUN uv pip install --system --no-cache -r requirements.txt

# Copy the application code into the container
COPY . .

# Cloud Run will set the PORT environment variable.
# The application's __main__.py is configured to read this variable.
# We expose port 8080 as a default, but Cloud Run's PORT variable will take precedence.
EXPOSE 8080

# Command to run the application
CMD ["uv", "run", ".", "--host", "0.0.0.0"]
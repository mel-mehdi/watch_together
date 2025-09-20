# Watch Together - Makefile
# A synchronized video watching platform with chat

.PHONY: all clean install docker docker-build docker-up docker-down docker-logs docker-clean help

# Default target
all: install docker-build docker-up

# Install dependencies
install:
	@echo "Installing Node.js dependencies..."
	npm install

# Clean up build artifacts and dependencies
clean:
	@echo "Cleaning up..."
	rm -rf node_modules
	rm -rf logs
	rm -f npm-debug.log*
	rm -f .env.local
	docker system prune -f
	docker volume prune -f

# Docker targets
docker: docker-build docker-up

# Build Docker images
docker-build:
	@echo "Building Docker images..."
	docker-compose build --no-cache

# Start Docker containers
docker-up:
	@echo "Starting Docker containers..."
	docker-compose up -d
	@echo "Application is running at http://localhost:3000"

# Stop Docker containers
docker-down:
	@echo "Stopping Docker containers..."
	docker-compose down

# View Docker logs
docker-logs:
	@echo "Showing Docker logs..."
	docker-compose logs -f

# Clean Docker containers and volumes
docker-clean:
	@echo "Cleaning Docker containers and volumes..."
	docker-compose down -v
	docker system prune -f
	docker volume prune -f

# Development targets
dev:
	@echo "Starting development server..."
	npm run dev

# Production start
start:
	@echo "Starting production server..."
	npm start

# Run tests (if any)
test:
	@echo "Running tests..."
	npm test

# Lint code (if eslint is configured)
lint:
	@echo "Linting code..."
	npm run lint

# Format code (if prettier is configured)
format:
	@echo "Formatting code..."
	npm run format

# Database operations
db-init:
	@echo "Initializing database..."
	docker-compose exec mongo mongo watch-together --eval "db.createCollection('messages')"
	docker-compose exec mongo mongo watch-together --eval "db.createCollection('rooms')"
	docker-compose exec mongo mongo watch-together --eval "db.createCollection('users')"
	docker-compose exec mongo mongo watch-together --eval "db.createCollection('videohistories')"

# Backup database
db-backup:
	@echo "Backing up database..."
	docker-compose exec mongo mongodump --db watch-together --out /backup
	docker cp $$(docker-compose ps -q mongo):/backup ./backup

# Restore database
db-restore:
	@echo "Restoring database..."
	docker cp ./backup $$(docker-compose ps -q mongo):/backup
	docker-compose exec mongo mongorestore --db watch-together /backup/watch-together

# Show help
help:
	@echo "Watch Together - Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  all           - Install dependencies, build and start Docker containers"
	@echo "  install       - Install Node.js dependencies"
	@echo "  clean         - Clean up build artifacts, dependencies and Docker"
	@echo "  docker        - Build and start Docker containers"
	@echo "  docker-build  - Build Docker images"
	@echo "  docker-up     - Start Docker containers"
	@echo "  docker-down   - Stop Docker containers"
	@echo "  docker-logs   - View Docker logs"
	@echo "  docker-clean  - Clean Docker containers and volumes"
	@echo "  dev           - Start development server with nodemon"
	@echo "  start         - Start production server"
	@echo "  test          - Run tests"
	@echo "  lint          - Lint code"
	@echo "  format        - Format code"
	@echo "  db-init       - Initialize database collections"
	@echo "  db-backup     - Backup database"
	@echo "  db-restore    - Restore database from backup"
	@echo "  help          - Show this help message"
	@echo ""
	@echo "Usage examples:"
	@echo "  make all          # Complete setup"
	@echo "  make docker-up    # Start the application"
	@echo "  make docker-logs  # Monitor logs"
	@echo "  make clean        # Clean everything"

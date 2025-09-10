# Watch Together - Simple Makefile

# Variables
APP_NAME = watch-together
PORT = 3000

# Development
install:
	npm install

dev:
	npm run dev

start:
	npm start

clean: stop db-stop
	rm -rf node_modules package-lock.json
	docker rmi $(APP_NAME) || true
	docker rmi mongo:latest || true
	docker volume rm $(APP_NAME)-data || true
	docker system prune -f

# Docker
build:
	docker build -t $(APP_NAME) .

run:
	docker run -d --name $(APP_NAME) -p $(PORT):$(PORT) $(APP_NAME)

stop:
	docker stop $(APP_NAME) || true
	docker rm $(APP_NAME) || true

logs:
	docker logs -f $(APP_NAME)

# Docker Compose
up:
	docker-compose up -d

down:
	docker-compose down

restart: down up

# Database
db-start:
	docker run -d --name $(APP_NAME)-mongo -p 27017:27017 -v $(APP_NAME)-data:/data/db mongo:latest

db-stop:
	docker stop $(APP_NAME)-mongo || true
	docker rm $(APP_NAME)-mongo || true

# Help
help:
	@echo "Available commands:"
	@echo "  install    - Install dependencies"
	@echo "  dev        - Start development server"
	@echo "  start      - Start production server"
	@echo "  clean      - Clean node_modules"
	@echo "  clean-all  - Clean everything (packages, Docker images, volumes)"
	@echo "  build      - Build Docker image"
	@echo "  run        - Run Docker container"
	@echo "  stop       - Stop Docker container"
	@echo "  logs       - View container logs"
	@echo "  up         - Start with docker-compose"
	@echo "  down       - Stop docker-compose"
	@echo "  restart    - Restart docker-compose"
	@echo "  db-start   - Start MongoDB"
	@echo "  db-stop    - Stop MongoDB"

.PHONY: install dev start clean clean-all build run stop logs up down restart db-start db-stop help

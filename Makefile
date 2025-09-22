# Watch Together - Simple Makefile

.PHONY: all clean install docker

# Default target - install and start
all:
	@npm start

# Install dependencies
install:
	@echo "Installing dependencies..."
	@npm install

# Clean up
clean:
	@echo "Cleaning up..."
	rm -rf node_modules
# docker-compose down -v
# docker system prune -f

# Start with Docker Compose
docker:
	

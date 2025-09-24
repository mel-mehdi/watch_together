# Watch Together - Simple Makefile

IP := $(shell hostname -I | awk '{print $1}')
IP := $(if $(IP),$(IP),localhost)

all:
	@echo "http://$(IP):3000/"
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
	docker-compose up -d

.PHONY: all clean install docker
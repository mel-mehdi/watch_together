# Watch Together 🎬

A synchronized video watching platform with real-time chat, voice communication, and room management features.

## Features

- **Synchronized Video Playback**: Watch YouTube, Vimeo, and direct video files together
- **Real-time Chat**: Text messaging with user authentication and guest mode
- **Voice Chat**: WebRTC-based voice communication
- **Admin Controls**: Room management with invite systems
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **User Authentication**: JWT-based authentication with session management
- **Video History**: Track previously watched videos
- **Room Invites**: Generate shareable invite links

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- Git (to clone the repository)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd watching
cp .env.example .env
# Edit .env file with your configuration
```

### 2. Start with Docker Compose

```bash
# Using Makefile (recommended)
make up

# Or directly with docker-compose
docker-compose up -d
```

### 3. Access the Application

- **Application**: http://localhost:3000
- **MongoDB**: mongodb://localhost:27017
- **Health Check**: http://localhost:3000/health

To access the application from other devices on the same network, use `http://<your-local-ip>:3000`. To find your local IP address, run `hostname -I` in the terminal.

## Development Setup

### Prerequisites

- Node.js 16+ and npm
- MongoDB (local or remote)

### Installation

```bash
# Install dependencies
make install
# or
npm install

# Create environment file
make env-example
cp .env.example .env
# Edit .env with your configuration

# Start development server
make dev
# or
npm run dev
```

## Makefile Commands

### Development
```bash
make install          # Install dependencies
make dev             # Start development server
make start           # Start production server
make clean           # Clean node_modules
make fresh-install   # Clean and reinstall dependencies
```

### Environment
```bash
make env-check       # Check if .env exists
make env-example     # Create .env.example file
```

### Docker
```bash
make docker-build    # Build Docker image
make docker-run      # Run Docker container
make docker-stop     # Stop and remove container
make docker-logs     # View container logs
make docker-shell    # Access container shell
make docker-clean    # Remove image and containers
```

### Docker Compose
```bash
make up              # Start all services
make down            # Stop all services
make logs            # View logs
make restart         # Restart all services
make compose-build   # Build services
```

### Database
```bash
make db-start        # Start MongoDB container
make db-stop         # Stop MongoDB container
make db-shell        # Access MongoDB shell
make backup-db       # Backup database
make restore-db BACKUP_DIR=path  # Restore database
```

### Production
```bash
make prod-build      # Build for production
make prod-deploy     # Deploy to production
```

### Utilities
```bash
make status          # Show overall status
make health-check    # Check application health
make ps              # Show running processes
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/watch-together

# Authentication
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-super-secret-session-key

# Email (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Application Settings
DEFAULT_ROOM=default
MAX_USERS_PER_ROOM=50
INVITE_EXPIRY_HOURS=24
```

## Docker Configuration

### Dockerfile Features

- **Multi-stage build** optimized for production
- **Non-root user** for security
- **Health checks** for container monitoring
- **Alpine Linux** for smaller image size

### Docker Compose Services

- **app**: Main Node.js application
- **mongo**: MongoDB database with persistent volume
- **redis**: Redis for session storage (optional)
- **nginx**: Reverse proxy for production (optional)

## Production Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Production build and deploy
make prod-deploy

# Or manually
docker-compose -f docker-compose.yml up -d
```

### Option 2: Manual Docker

```bash
# Build image
make docker-build

# Run with environment
docker run -d \
  --name watch-together \
  -p 3000:3000 \
  --env-file .env \
  watch-together:latest
```

### Option 3: Cloud Platforms

The application can be deployed to:
- **Heroku**: Use included `Dockerfile`
- **AWS ECS**: Use Docker image
- **Google Cloud Run**: Use containerized deployment
- **DigitalOcean App Platform**: Use Dockerfile

## API Endpoints

### Health Check
```
GET /health
```
Returns server status, uptime, and database connectivity.

### Authentication
```
POST /api/auth/login    # User login
POST /api/auth/register # User registration
POST /api/auth/logout   # User logout
```

### Rooms
```
GET /api/rooms/:roomId                  # Get room info
POST /api/rooms/:roomId/invite          # Generate invite
DELETE /api/rooms/:roomId/invite        # Revoke invite
```

### Database
```
GET /api/db/rooms      # Get all rooms (admin)
GET /api/db/users      # Get all users (admin)
GET /api/db/messages   # Get all messages (admin)
```

## WebSocket Events

### Client to Server
- `user join`: Join room
- `chat message`: Send message
- `change video`: Change video URL
- `video play/pause`: Control playback
- `request admin`: Request admin privileges

### Server to Client
- `chat message`: Receive message
- `video state`: Video synchronization
- `admin status`: Admin privilege updates
- `user count`: Online user count

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   make docker-stop  # Stop existing containers
   ```

2. **Database connection failed**
   ```bash
   make db-start     # Start MongoDB container
   ```

3. **Permission denied**
   ```bash
   sudo chown -R $USER:$USER .
   ```

4. **Node modules issues**
   ```bash
   make fresh-install
   ```

5. **Cannot access from other devices on the network**
   - Ensure the server is listening on `0.0.0.0` (configured in `server.js`).
   - Check your local IP with `hostname -I`.
   - Verify that port 3000 is not blocked by firewall (e.g., if UFW is installed, run `sudo ufw allow 3000`).
   - Make sure devices are on the same network.

### Logs and Debugging

```bash
# Application logs
make logs

# Container logs
make docker-logs

# Database logs
docker logs watch-together-mongo

# Health check
make health-check
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test locally: `make dev`
5. Build Docker image: `make docker-build`
6. Submit pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Docker and application logs
3. Open an issue on GitHub

---

**Quick Commands Summary:**
```bash
make help           # Show all commands
make up             # Start everything
make down           # Stop everything
make logs           # View logs
make status         # Check status
```

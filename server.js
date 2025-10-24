const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');

// Load environment variables
dotenv.config();

// Flag for database availability
let isDatabaseConnected = false;

// Import models (but don't use them until DB is connected)
const User = require('./models/User');
const Room = require('./models/Room');
const Message = require('./models/Message');
const VideoHistory = require('./models/VideoHistory');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());

// Enable CORS for all routes
app.use(cors({
    origin: true, // Allow all origins in development
    credentials: true
}));

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log(`🔍 Request: ${req.method} ${req.url}`);
    next();
});

// Function to configure Passport after DB connection
function configurePassport(withDatabase = true) {
    // Passport configuration
    app.use(passport.initialize());
    app.use(passport.session());

    // Google OAuth Strategy - only configure if credentials are properly set AND database is available
    if (withDatabase && 
        process.env.GOOGLE_CLIENT_ID && 
        process.env.GOOGLE_CLIENT_SECRET && 
        process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id' && 
        process.env.GOOGLE_CLIENT_SECRET !== 'your-google-client-secret') {
        
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
          },
          async (accessToken, refreshToken, profile, done) => {
            try {
              console.log('Google OAuth profile received:', profile.id, profile.emails[0]?.value, profile.displayName);
              
              // Ensure database is connected before proceeding
              const mongoose = require('mongoose');
              if (!isDatabaseConnected || mongoose.connection.readyState !== 1) {
                console.error('Database not ready for Google authentication');
                return done(null, false, { message: 'Database not available. Please try again later.' });
              }
              
              // Check if user already exists with this Google ID
              let user = await User.findOne({ googleId: profile.id });
              
              if (user) {
                console.log('Existing Google user found:', user.username);
                return done(null, user);
              }
              
              // Check if user exists with same email
              user = await User.findOne({ email: profile.emails[0].value });
              
              if (user) {
                // Link Google account to existing user
                console.log('Linking Google account to existing user:', user.username);
                user.googleId = profile.id;
                user.provider = 'google';
                await user.save();
                return done(null, user);
              }
              
              // Create new user
              const username = profile.displayName.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 1000);
              console.log('Creating new user from Google OAuth:', username, profile.emails[0].value);
              
              user = new User({
                username: username,
                email: profile.emails[0].value,
                googleId: profile.id,
                provider: 'google',
                avatar: profile.photos[0]?.value
              });
              
              await user.save();
              console.log('New Google user created successfully:', user.username);
              return done(null, user);
            } catch (error) {
              console.error('Google OAuth strategy error:', error);
              return done(error, null);
            }
          }
        ));
        
        passport.serializeUser((user, done) => {
          done(null, user.id);
        });

        passport.deserializeUser(async (id, done) => {
          try {
            // Check if database is available
            const mongoose = require('mongoose');
            if (!isDatabaseConnected || mongoose.connection.readyState !== 1) {
              console.warn('Database not ready for user deserialization, skipping');
              return done(null, false); // Return false instead of error to prevent 500
            }
            
            const user = await User.findById(id);
            if (!user) {
              return done(null, false);
            }
            done(null, user);
          } catch (error) {
            console.error('User deserialization error:', error.message);
            done(null, false); // Don't fail the request, just skip user session
          }
        });
    } else {
        if (!withDatabase) {
            console.log('Google OAuth strategy not configured - database connection required');
        } else {
            console.log('Google OAuth strategy not configured - using placeholder credentials or missing configuration');
        }
    }
}

// Initialize server after database connection
async function initializeServer() {
    // Connect to database with fallback
    try {
        console.log('🔄 Attempting to connect to MongoDB...');
        await connectDB();
        console.log("✅ Database connected successfully");
        isDatabaseConnected = true;
        
        // Verify connection state
        const mongoose = require('mongoose');
        console.log(`📊 MongoDB connection state: ${mongoose.connection.readyState} (1 = connected, 0 = disconnected)`);
        
        if (mongoose.connection.readyState !== 1) {
            throw new Error('Database connection not fully established');
        }
        
        // Session configuration with MongoStore
        app.use(session({
            secret: process.env.SESSION_SECRET || 'fallback-session-secret',
            resave: false,
            saveUninitialized: false,
            store: MongoStore.create({
                mongoUrl: process.env.MONGO_URI
            }),
            cookie: {
                secure: false, // Set to true if using HTTPS
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
            }
        }));
        
        console.log('✅ Session middleware configured with MongoStore');
        
        // Configure Passport after database connection
        configurePassport(true); // Pass true to enable Google OAuth
        console.log('✅ Passport configured');
    } catch (err) {
        console.error("❌ Database connection failed, running in memory-only mode:", err.message);
        isDatabaseConnected = false;
        
        // Session configuration with memory store
        app.use(session({
            secret: process.env.SESSION_SECRET || 'fallback-session-secret',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false,
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 * 7
            }
        }));
        
        console.log('⚠️  Session middleware configured with memory store');
        
        // Configure Passport without database-dependent features
        configurePassport(false); // Pass false to disable Google OAuth
        console.log('⚠️  Passport configured (without database - Google OAuth disabled)');
    }

    // Import routes after database is ready
    const authRoutes = require('./routes/auth');
    const roomRoutes = require('./routes/rooms');
    const adminRoutes = require('./routes/admin')(io);

    // Mount routes
    app.use('/api/auth', authRoutes);
    app.use('/api/rooms', roomRoutes);
    app.use('/api/admin', adminRoutes);
    
    console.log('✅ Routes mounted successfully');
}

const users = {};
// Store room-specific data for each socket connection
const socketRooms = new Map(); // socketId -> roomId
// Store admin user for each room
const roomAdmins = new Map(); // roomId -> socketId
// Store system message configuration for each room
const roomSystemMessageConfig = new Map(); // roomId -> config object

// Voice chat users
const voiceChatUsers = {};

// Default system message configuration
function getDefaultSystemMessageConfig() {
    return {
        showJoinLeaveMessages: false,
        showAdminChangeMessages: false,
        showVideoChangeMessages: false,
        showCriticalMessages: false
    };
}

// Helper function to send system messages based on room configuration
function sendSystemMessage(roomId, message, messageType = 'critical') {
    const config = roomSystemMessageConfig.get(roomId) || getDefaultSystemMessageConfig();
    
    let shouldSend = false;
    switch (messageType) {
        case 'join-leave':
            shouldSend = config.showJoinLeaveMessages;
            break;
        case 'admin-change':
            shouldSend = config.showAdminChangeMessages;
            break;
        case 'video-change':
            shouldSend = config.showVideoChangeMessages;
            break;
        case 'critical':
        default:
            shouldSend = config.showCriticalMessages;
            break;
    }
    
    if (shouldSend) {
        io.to(roomId).emit('system message', message);
    }
    
    return shouldSend;
}

function detectVideoType(url) {
    if (!url) return 'unknown';
    
    url = url.trim();
    
    // YouTube
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        return 'youtube';
    }
    
    // Vimeo
    if (url.includes('vimeo.com/')) {
        return 'vimeo';
    }
    
    // Direct video files
    if (url.match(/\.(mp4|webm|ogg|mov)($|\?)/i)) {
        return 'direct';
    }
    
    // Facebook
    if (url.includes('facebook.com/') && url.includes('/videos/')) {
        return 'facebook';
    }
    
    // Twitch
    if (url.includes('twitch.tv/')) {
        return 'twitch';
    }
    
    // Dailymotion
    if (url.includes('dailymotion.com/') || url.includes('dai.ly/')) {
        return 'dailymotion';
    }
    
    // For other URLs, try to use iframe embedding as a fallback
    return 'iframe';
}

// Load recent chat messages from database
async function loadRecentMessages(roomId, limit = 50) {
    if (!isDatabaseConnected) {
        console.log("Database not connected, returning empty messages");
        return [];
    }
    
    try {
        return await Message.find({ roomId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    } catch (error) {
        console.error('Error loading recent messages:', error);
        return [];
    }
}

io.on('connection', async (socket) => {
    console.log('A user connected');
    
    // Get user info from auth token if available
    let authenticatedUser = null;
    if (socket.handshake.auth?.token) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET || 'fallback-secret-key');
            if (decoded.userId) {
                authenticatedUser = await User.findById(decoded.userId);
            }
        } catch (error) {
            console.log('Invalid or expired token for socket connection');
        }
    }
    
    // Handle joining a specific room
    socket.on('join room', async ({ roomId, username }) => {
        try {
            // Find the room in the database - handle both room codes and ObjectId
            let room;
            if (roomId.length === 8) {
                // It's a room code
                room = await Room.findOne({ roomCode: roomId.toUpperCase() });
            } else {
                // It's an ObjectId
                room = await Room.findById(roomId);
            }
            
            if (!room) {
                socket.emit('error', 'Room not found');
                return;
            }

            // Join the socket room (use the actual room ObjectId for internal management)
            const actualRoomId = room._id.toString();
            socket.join(actualRoomId);
            socketRooms.set(socket.id, actualRoomId);

            // Handle user creation/lookup
            let userId = null;
            let userAvatar = '';
            if (isDatabaseConnected) {
                try {
                    let user = authenticatedUser;
                    if (!user) {
                        // Try to find existing user by username
                        user = await User.findOne({ username });
                        if (!user) {
                            const guestEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@guest.com`;
                            user = new User({ 
                                username, 
                                email: guestEmail,
                                isGuest: true 
                            });
                            await user.save();
                        }
                    }
                    userId = user._id;
                    userAvatar = user.avatar || '';
                } catch (error) {
                    console.error('Database error during user join:', error.message);
                }
            }

            // Store user info (including avatar)
            users[socket.id] = {
                userId: userId,
                username: username,
                avatar: userAvatar,
                roomId: actualRoomId, // Use the actual ObjectId
                roomCode: room.roomCode, // Also store the room code for reference
                isAdmin: false
            };

            // Check if this room needs an admin (first user becomes admin)
            const roomUsers = Object.values(users).filter(u => u.roomId === actualRoomId);
            if (roomUsers.length === 1 || !roomAdmins.has(actualRoomId)) {
                roomAdmins.set(actualRoomId, socket.id);
                users[socket.id].isAdmin = true;
                socket.emit('admin status', true);
            }

            // Send current room state to the user
            socket.emit('video state', {
                url: room.currentVideo?.url || '',
                playing: room.videoState?.playing || false,
                currentTime: room.videoState?.currentTime || 0,
                videoType: room.currentVideo?.type || 'unknown'
            });

            // Send current admin info
            const roomAdmin = roomAdmins.get(actualRoomId);
            if (roomAdmin && users[roomAdmin]) {
                socket.emit('admin user', users[roomAdmin].username);
            }

            // Initialize room system message config if it doesn't exist
            if (!roomSystemMessageConfig.has(actualRoomId)) {
                roomSystemMessageConfig.set(actualRoomId, getDefaultSystemMessageConfig());
            }

            // Send current system message configuration
            socket.emit('system message config', roomSystemMessageConfig.get(actualRoomId));

            // Load recent messages for this room
            if (isDatabaseConnected) {
                try {
                    const recentMessages = await loadRecentMessages(actualRoomId);
                    socket.emit('recent messages', recentMessages.reverse());
                } catch (error) {
                    console.error('Database error loading recent messages:', error.message);
                }
            }

            // Notify others in the room
            const systemMessage = `${username} has joined the room`;
            const messageSent = sendSystemMessage(actualRoomId, systemMessage, 'join-leave');
            
            // Save join message to database (only if it was sent to users)
            if (isDatabaseConnected && messageSent) {
                try {
                    const message = new Message({
                        roomId: actualRoomId,
                        username: 'System',
                        content: systemMessage,
                        isSystemMessage: true
                    });
                    await message.save();
                } catch (error) {
                    console.error('Database error saving join message:', error.message);
                }
            }

            console.log(`User ${username} joined room ${room.roomCode} (${actualRoomId})`);

        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', 'Failed to join room');
        }
    });
    
    // Handle chat messages with room context
    socket.on('chat message', async (msg) => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('error message', 'Please join a room first');
            return;
        }

        if (!msg || typeof msg !== 'string' || msg.trim().length === 0) {
            socket.emit('error message', 'Message cannot be empty');
            return;
        }

        const sanitizedMessage = msg.trim().substring(0, 500);
        const messageData = {
            username: user.username,
            avatar: user.avatar || '',
            message: sanitizedMessage,
            timestamp: new Date().toISOString(),
            isAdmin: user.isAdmin
        };
        
        // Send message to all users in the same room
        io.to(user.roomId).emit('chat message', messageData);
        
        // Save message to database
        if (isDatabaseConnected && user.roomId) {
            try {
                const message = new Message({
                    roomId: user.roomId,
                    user: user.userId,
                    username: user.username,
                    content: sanitizedMessage,
                    isSystemMessage: false
                });
                await message.save();
            } catch (error) {
                console.error('Database error saving chat message:', error.message);
            }
        }
    });
    
    // Handle system message configuration updates
    socket.on('update system message config', (config) => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('error message', 'Please join a room first');
            return;
        }

        // Only admin can update system message configuration
        if (roomAdmins.get(user.roomId) !== socket.id) {
            socket.emit('error message', 'Only admin can change chat notification settings');
            return;
        }

        // Validate configuration object
        if (!config || typeof config !== 'object') {
            socket.emit('error message', 'Invalid configuration');
            return;
        }

        // Update room configuration
        const currentConfig = roomSystemMessageConfig.get(user.roomId) || getDefaultSystemMessageConfig();
        const newConfig = {
            showJoinLeaveMessages: typeof config.showJoinLeaveMessages === 'boolean' ? config.showJoinLeaveMessages : currentConfig.showJoinLeaveMessages,
            showAdminChangeMessages: typeof config.showAdminChangeMessages === 'boolean' ? config.showAdminChangeMessages : currentConfig.showAdminChangeMessages,
            showVideoChangeMessages: typeof config.showVideoChangeMessages === 'boolean' ? config.showVideoChangeMessages : currentConfig.showVideoChangeMessages,
            showCriticalMessages: typeof config.showCriticalMessages === 'boolean' ? config.showCriticalMessages : currentConfig.showCriticalMessages
        };

        roomSystemMessageConfig.set(user.roomId, newConfig);

        // Broadcast the updated configuration to all users in the room
        io.to(user.roomId).emit('system message config', newConfig);

        console.log(`Admin ${user.username} updated system message config for room ${user.roomId}:`, newConfig);
    });
    
    // Handle video play event
    socket.on('video play', async (time) => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('system message', 'Please join a room first');
            return;
        }
        
        // Only admin can control video for everyone in the room
        if (roomAdmins.get(user.roomId) === socket.id) {
            try {
                const room = await Room.findById(user.roomId);
                if (room) {
                    room.videoState.playing = true;
                    room.videoState.currentTime = time;
                    room.videoState.lastUpdated = new Date();
                    await room.save();
                }
                
                // Broadcast to other users in the same room
                socket.to(user.roomId).emit('video play', {
                    time: time,
                    serverTime: Date.now()
                });
            } catch (error) {
                console.error('Error updating video play state:', error);
            }
        }
    });
    
    // Handle video pause event
    socket.on('video pause', async (time) => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('system message', 'Please join a room first');
            return;
        }
        
        // Only admin can control video for everyone in the room
        if (roomAdmins.get(user.roomId) === socket.id) {
            try {
                const room = await Room.findById(user.roomId);
                if (room) {
                    room.videoState.playing = false;
                    room.videoState.currentTime = time;
                    room.videoState.lastUpdated = new Date();
                    await room.save();
                }
                
                // Broadcast to other users in the same room
                socket.to(user.roomId).emit('video pause', {
                    time: time,
                    serverTime: Date.now()
                });
            } catch (error) {
                console.error('Error updating video pause state:', error);
            }
        }
    });
    
    // Handle video seek event
    socket.on('video seek', async (time) => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('system message', 'Please join a room first');
            return;
        }
        
        // Only admin can control video for everyone in the room
        if (roomAdmins.get(user.roomId) === socket.id) {
            try {
                const room = await Room.findById(user.roomId);
                if (room) {
                    room.videoState.currentTime = time;
                    room.videoState.lastUpdated = new Date();
                    await room.save();
                }
                
                socket.to(user.roomId).emit('video seek', time);
            } catch (error) {
                console.error('Error updating video seek state:', error);
            }
        }
    });
    
    // Handle time synchronization
    socket.on('sync time', async (time) => {
        const user = users[socket.id];
        if (!user) return;
        
        // Only admin can sync time for everyone in the room
        if (roomAdmins.get(user.roomId) === socket.id) {
            try {
                const room = await Room.findById(user.roomId);
                if (room) {
                    room.videoState.currentTime = time;
                    room.videoState.lastUpdated = new Date();
                    await room.save();
                }
                
                socket.to(user.roomId).emit('sync time', time);
            } catch (error) {
                console.error('Error updating sync time:', error);
            }
        }
    });
    
    // Handle changing video URL
    socket.on('change video', async (url) => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('system message', 'Please join a room first');
            return;
        }
        
        // Only admin can change video for everyone in the room
        if (roomAdmins.get(user.roomId) === socket.id) {
            try {
                const videoType = detectVideoType(url);
                const room = await Room.findById(user.roomId);
                
                if (room) {
                    room.currentVideo = {
                        url: url,
                        type: videoType
                    };
                    room.videoState = {
                        playing: false,
                        currentTime: 0,
                        lastUpdated: new Date()
                    };
                    await room.save();
                    
                    // Save to video history
                    if (isDatabaseConnected) {
                        const videoHistory = new VideoHistory({
                            roomId: user.roomId,
                            url: url,
                            type: videoType,
                            addedBy: user.userId,
                            addedByUsername: user.username
                        });
                        await videoHistory.save();
                    }
                }
                
                // Broadcast to all users in the room
                io.to(user.roomId).emit('change video', url);
                
                const systemMessage = `${user.username} changed the video`;
                const messageSent = sendSystemMessage(user.roomId, systemMessage, 'video-change');
                
                // Save system message to database (only if it was sent to users)
                if (isDatabaseConnected && messageSent) {
                    const message = new Message({
                        roomId: user.roomId,
                        username: 'System',
                        content: systemMessage,
                        isSystemMessage: true
                    });
                    await message.save();
                }
            } catch (error) {
                console.error('Error changing video:', error);
            }
        }
    });

    // Handle get video history request
    socket.on('get video history', async () => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('error message', 'Please join a room first');
            return;
        }

        try {
            if (isDatabaseConnected) {
                const history = await VideoHistory.find({ roomId: user.roomId })
                    .sort({ watchedAt: -1 })
                    .limit(20)
                    .select('url type addedByUsername watchedAt');
                
                const formattedHistory = history.map(item => ({
                    url: item.url,
                    type: item.type,
                    changedBy: item.addedByUsername,
                    timestamp: item.watchedAt
                }));
                
                socket.emit('video history', formattedHistory);
            } else {
                // If database is not connected, return empty history
                socket.emit('video history', []);
            }
        } catch (error) {
            console.error('Error fetching video history:', error);
            socket.emit('video history', []);
        }
    });

    // Handle request to become admin
    socket.on('request admin', () => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('system message', 'Please join a room first');
            return;
        }
        
        const currentAdmin = roomAdmins.get(user.roomId);
        if (currentAdmin && socket.id !== currentAdmin && users[currentAdmin]) {
            io.to(currentAdmin).emit('admin request', user.username, socket.id);
        }
    });
    
    // Handle admin transfer
    socket.on('transfer admin', (targetSocketId) => {
        const user = users[socket.id];
        if (!user) return;
        
        const currentAdmin = roomAdmins.get(user.roomId);
        if (socket.id === currentAdmin && users[targetSocketId] && users[targetSocketId].roomId === user.roomId) {
            console.log(`🔄 [Admin Transfer] From ${socket.id} to ${targetSocketId}`);
            console.log(`🔄 [Admin Transfer] Previous admin: ${users[currentAdmin].username}, New admin: ${users[targetSocketId].username}`);
            
            // Transfer admin status
            users[currentAdmin].isAdmin = false;
            roomAdmins.set(user.roomId, targetSocketId);
            users[targetSocketId].isAdmin = true;
            
            // Notify all users in the room about admin change
            io.to(user.roomId).emit('admin user', users[targetSocketId].username);
            sendSystemMessage(user.roomId, `${users[targetSocketId].username} is now the admin controller`, 'admin-change');
            
            // Notify the old admin that they lost admin status
            console.log(`🔄 [Admin Transfer] Emitting 'admin status: false' to ${currentAdmin}`);
            io.to(currentAdmin).emit('admin status', false);
            
            // Notify the new admin
            console.log(`🔄 [Admin Transfer] Emitting 'admin status: true' to ${targetSocketId}`);
            io.to(targetSocketId).emit('admin status', true);
        }
    });
    
    // Handle admin actions for visual cues
    socket.on('admin action', (action) => {
        const user = users[socket.id];
        if (!user) return;
        
        if (roomAdmins.get(user.roomId) === socket.id) {
            socket.to(user.roomId).emit('admin action', action);
        }
    });
    
    // Simple Voice Chat System
    socket.on('join-voice-chat', () => {
        const user = users[socket.id];
        if (!user) return;
        
        voiceChatUsers[socket.id] = { 
            username: user.username,
            roomId: user.roomId
        };
        
        // Notify others in the same room that this user joined voice chat
        socket.to(user.roomId).emit('user-joined-voice', socket.id);
        
        console.log(`${user.username} joined voice chat in room ${user.roomId}`);
    });

    socket.on('leave-voice-chat', () => {
        const user = users[socket.id];
        if (voiceChatUsers[socket.id] && user) {
            delete voiceChatUsers[socket.id];
            
            // Notify others in the same room that this user left voice chat
            socket.to(user.roomId).emit('user-left-voice', socket.id);
            
            console.log(`${user.username} left voice chat`);
        }
    });

    socket.on('offer', (data) => {
        socket.to(data.to).emit('offer', {
            offer: data.offer,
            from: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.to).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });
    
    // Handle detailed sync from admin
    socket.on('detailed sync', (data) => {
        const user = users[socket.id];
        if (!user) return;
        
        // Only admin can send detailed sync
        if (roomAdmins.get(user.roomId) === socket.id) {
            // Broadcast to all other users in the same room
            socket.to(user.roomId).emit('detailed sync', data);
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
        const user = users[socket.id];
        if (user) {
            const systemMessage = `${user.username} has left the room`;
            
            // Notify others in the same room using the configuration
            const messageSent = sendSystemMessage(user.roomId, systemMessage, 'join-leave');
            
            // Save system message to database (only if it was sent to users)
            if (isDatabaseConnected && user.roomId && messageSent) {
                try {
                    const message = new Message({
                        roomId: user.roomId,
                        username: 'System',
                        content: systemMessage,
                        isSystemMessage: true
                    });
                    await message.save();
                } catch (error) {
                    console.error('Database error saving disconnect message:', error.message);
                }
            }
            
            // If admin disconnects, assign a new admin
            const currentAdmin = roomAdmins.get(user.roomId);
            if (socket.id === currentAdmin) {
                // Find a new admin from remaining users in the same room
                const remainingRoomUsers = Object.entries(users)
                    .filter(([socketId, u]) => socketId !== socket.id && u.roomId === user.roomId)
                    .map(([socketId]) => socketId);
                    
                if (remainingRoomUsers.length > 0) {
                    const newAdminSocketId = remainingRoomUsers[0];
                    roomAdmins.set(user.roomId, newAdminSocketId);
                    users[newAdminSocketId].isAdmin = true;
                    
                    // Notify new admin and all users in the room
                    io.to(newAdminSocketId).emit('admin status', true);
                    io.to(user.roomId).emit('admin user', users[newAdminSocketId].username);
                    
                    const adminMessage = `${users[newAdminSocketId].username} is now the admin controller`;
                    const adminMessageSent = sendSystemMessage(user.roomId, adminMessage, 'admin-change');
                    
                    // Save admin change to database (only if it was sent to users)
                    if (isDatabaseConnected && adminMessageSent) {
                        try {
                            const message = new Message({
                                roomId: user.roomId,
                                username: 'System',
                                content: adminMessage,
                                isSystemMessage: true
                            });
                            await message.save();
                        } catch (error) {
                            console.error('Database error saving admin change message:', error.message);
                        }
                    }
                } else {
                    // No one left in the room, remove admin
                    roomAdmins.delete(user.roomId);
                }
            }
            
            // Clean up user data
            delete users[socket.id];
            socketRooms.delete(socket.id);
        }
        
        // Clean up voice chat if user was in it
        if (voiceChatUsers[socket.id]) {
            const roomId = voiceChatUsers[socket.id].roomId;
            delete voiceChatUsers[socket.id];
            if (roomId) {
                socket.to(roomId).emit('user-left-voice', socket.id);
            }
        }
        
        console.log('A user disconnected');
    });
    
    // Admin socket handlers
    socket.on('admin join', () => {
        console.log('Admin connected to admin panel');
        socket.join('admin-room');
        
        // Send initial admin stats
        const stats = {
            totalUsers: Object.keys(users).length,
            activeRooms: roomAdmins.size,
            onlineUsers: Object.keys(users).length,
            videosShared: 100 // Mock data
        };
        socket.emit('admin stats update', stats);
    });
});

// Serve static files from public directory
app.use(express.static('public'));

// Root route - serve the home page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home.html');
});

// Join room page
app.get('/join', (req, res) => {
    res.sendFile(__dirname + '/public/join.html');
});

// Admin page
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

// Room page - serve the main app for room access
app.get('/room/:code', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Health check endpoint for Docker
app.get('/health', (req, res) => {
    const mongoose = require('mongoose');
    const connectionStates = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    const healthCheck = {
        uptime: process.uptime(),
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: {
            connected: isDatabaseConnected,
            readyState: connectionStates[mongoose.connection.readyState] || 'unknown',
            readyStateCode: mongoose.connection.readyState,
            hasMongoUri: !!process.env.MONGO_URI
        },
        features: {
            googleOAuth: !!(process.env.GOOGLE_CLIENT_ID && 
                           process.env.GOOGLE_CLIENT_SECRET && 
                           process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id'),
            email: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS)
        },
        memory: process.memoryUsage(),
        version: require('./package.json').version
    };
    
    try {
        const status = isDatabaseConnected && mongoose.connection.readyState === 1 ? 200 : 503;
        res.status(status).json(healthCheck);
    } catch (error) {
        healthCheck.message = 'Server error';
        res.status(503).json(healthCheck);
    }
});

// Initialize and start server
const PORT = process.env.PORT || 3000;

initializeServer().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize server:', err);
    process.exit(1);
});
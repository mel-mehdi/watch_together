const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const path = require('path');

// Load environment variables
dotenv.config();

// Online, refuse to start without real secrets: the code's fallback values are
// public, so anyone could forge login tokens with them
if (process.env.NODE_ENV === 'production') {
    const missing = ['JWT_SECRET', 'SESSION_SECRET'].filter(name => !process.env[name]);
    if (missing.length) {
        console.error(`Missing required environment variable(s): ${missing.join(', ')}. Set them on your host and restart.`);
        process.exit(1);
    }
}

// The app is built to keep serving pages when the database is unreachable or
// rejects its login. Database drivers (the session store in particular) can
// report such failures as promise rejections nobody awaits, which would crash
// the whole server; log them instead and keep running.
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (server keeps running):', reason && reason.message ? reason.message : reason);
});

// Flag for database availability
let isDatabaseConnected = false;
let dbConnectionPromise = null;

// Initialize database connection (for serverless, we'll reconnect on each request if needed)
const initDB = async () => {
  if (mongoose.connection.readyState === 1) {
    // Already connected
    return true;
  }
  
  if (mongoose.connection.readyState === 2) {
    // Currently connecting, wait for existing connection
    if (dbConnectionPromise) {
      await dbConnectionPromise;
      return true;
    }
  }
  
  // Not connected, create new connection
  try {
    dbConnectionPromise = connectDB();
    await dbConnectionPromise;
    isDatabaseConnected = true;
    console.log("Database connected successfully");
    return true;
  } catch (err) {
    console.error("Database connection failed:", err.message);
    isDatabaseConnected = false;
    return false;
  }
};

// Initialize connection on startup (for non-serverless)
initDB().catch(err => {
  console.error("Initial database connection failed, will retry on requests");
});

// Import models
const User = require('./models/User');
const Room = require('./models/Room');
const Message = require('./models/Message');
const VideoHistory = require('./models/VideoHistory');

// Import routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const adminRoutes = require('./routes/admin')(io);

app.use(express.json());

// Enable CORS for all routes
app.use(cors({
    origin: true, // Allow all origins in development
    credentials: true
}));

// Middleware to ensure database connection for API routes
app.use('/api', async (req, res, next) => {
    try {
        await initDB();
        next();
    } catch (error) {
        console.error('Database connection middleware error:', error);
        next(); // Continue even if DB fails (fallback to memory mode)
    }
});

// Debug middleware to log all requests
app.use((req, res, next) => {
    // Never write login tokens or OAuth codes into the logs
    const safeUrl = req.url.replace(/([?&#](token|code|state)=)[^&#]*/gi, '$1[hidden]');
    console.log(`🔍 Request: ${req.method} ${safeUrl}`);
    next();
});

const mongoUrlForStore = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL;

// Behind a host's proxy (Render, Docker + nginx), trust its HTTPS headers
app.set('trust proxy', 1);

// Session configuration. Sessions are kept in MongoDB whenever a database
// address is configured (the old check ran before the database had connected,
// so sessions always ended up in memory and were lost on every restart)
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-session-secret',
    resave: false,
    saveUninitialized: false,
    store: mongoUrlForStore ? MongoStore.create({
        mongoUrl: mongoUrlForStore
    }) : undefined, // Memory store only when no database is configured
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy - only configure if credentials are properly set
if (process.env.GOOGLE_CLIENT_ID && 
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
          const emailEntry = profile.emails && profile.emails[0];
          const email = emailEntry && emailEntry.value ? emailEntry.value.trim().toLowerCase() : null;
          const emailVerified = Boolean(emailEntry && emailEntry.verified !== false && profile._json?.email_verified !== false);
          console.log('Google OAuth profile received:', profile.id);

          // Check if user already exists with this Google ID
          let user = await User.findOne({ googleId: profile.id });

          if (user) {
            console.log('Existing Google user found:', user.username);
            return done(null, user);
          }

          if (!email) {
            return done(null, false, { message: 'Google did not share an email address' });
          }

          // Link to an existing account with the same email, but only when Google
          // has verified that address (otherwise anyone could take over the account)
          user = await User.findOne({ email });

          if (user) {
            if (!emailVerified) {
              return done(null, false, { message: 'Google email not verified' });
            }
            console.log('Linking Google account to existing user:', user.username);
            user.googleId = profile.id;
            user.provider = 'google';
            await user.save();
            return done(null, user);
          }

          // New user: a clean username (letters, digits, _), within the 3-20
          // character limit, not already taken. Long or non-Latin Google names
          // used to break sign-up.
          const base = (profile.displayName || email.split('@')[0] || 'user')
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'user';
          let username = null;
          for (let attempt = 0; attempt < 10 && !username; attempt++) {
            const candidate = `${base.length >= 3 ? base : 'user'}${Math.floor(1000 + Math.random() * 9000)}`;
            if (!(await User.exists({ username: candidate }))) username = candidate;
          }
          if (!username) username = `user${Date.now().toString(36)}`.slice(0, 20);
          console.log('Creating new user from Google OAuth:', username);

          user = new User({
            username: username,
            email,
            googleId: profile.id,
            provider: 'google',
            avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : undefined
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
        const user = await User.findById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });
} else {
    console.log('Google OAuth strategy not configured - using placeholder credentials or missing configuration');
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

// Real title, channel and thumbnail of a video, from the provider's public
// oEmbed lookup (no API key). Returns null for direct files or on any failure.
const OEMBED_ENDPOINTS = {
    youtube: 'https://www.youtube.com/oembed?format=json&url=',
    vimeo: 'https://vimeo.com/api/oembed.json?url=',
    dailymotion: 'https://www.dailymotion.com/services/oembed?format=json&url='
};
const videoInfoCache = new Map(); // url -> info, so repeat lookups are free

async function fetchVideoInfo(url, type = detectVideoType(url)) {
    const endpoint = OEMBED_ENDPOINTS[type];
    if (!endpoint) return null;
    if (videoInfoCache.has(url)) return videoInfoCache.get(url);

    try {
        const response = await fetch(endpoint + encodeURIComponent(url), { signal: AbortSignal.timeout(4000) });
        if (!response.ok) return null;
        const data = await response.json();
        const httpsOnly = (value) => (typeof value === 'string' && value.startsWith('https://') ? value : undefined);
        const info = {
            title: typeof data.title === 'string' ? data.title.slice(0, 200) : undefined,
            author: typeof data.author_name === 'string' ? data.author_name.slice(0, 100) : undefined,
            thumbnail: httpsOnly(data.thumbnail_url)
        };
        if (videoInfoCache.size > 500) videoInfoCache.clear();
        videoInfoCache.set(url, info);
        return info;
    } catch (error) {
        console.log(`Video title lookup failed for ${type}: ${error.message}`);
        return null;
    }
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
    
    // Get user info from auth token if available. Kept as a promise (not awaited
    // here) so the event handlers below are registered synchronously: awaiting
    // first made a 'join room' sent right after connecting get silently dropped.
    const authenticatedUserPromise = (async () => {
        if (!socket.handshake.auth?.token) return null;
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET || 'fallback-secret-key');
            return decoded.userId ? await User.findById(decoded.userId) : null;
        } catch (error) {
            console.log('Invalid or expired token for socket connection');
            return null;
        }
    })();

    // Handle joining a specific room
    socket.on('join room', async ({ roomId, username }) => {
        try {
            const authenticatedUser = await authenticatedUserPromise;
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
            // While playing, the saved time is from the last play/seek: add the time since
            const savedTime = room.videoState?.currentTime || 0;
            const isPlaying = room.videoState?.playing || false;
            const lastUpdated = room.videoState?.lastUpdated ? new Date(room.videoState.lastUpdated).getTime() : Date.now();
            socket.emit('video state', {
                url: room.currentVideo?.url || '',
                playing: isPlaying,
                currentTime: isPlaying ? savedTime + Math.max(0, (Date.now() - lastUpdated) / 1000) : savedTime,
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
        // Id known before saving, so viewers can react to the message right away
        const messageId = new mongoose.Types.ObjectId();
        const messageData = {
            id: messageId.toString(),
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
                    _id: messageId,
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

    // Reactions: toggle this user's emoji on a message and share the result
    const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];
    socket.on('message reaction', async (data) => {
        const user = users[socket.id];
        if (!user || !isDatabaseConnected) return;
        const { messageId, emoji } = data || {};
        if (!ALLOWED_REACTIONS.includes(emoji) || !mongoose.Types.ObjectId.isValid(messageId)) return;

        try {
            // Atomic toggle (safe when several people react at once):
            // remove it if this user already reacted with it, otherwise add it
            const filter = { _id: messageId, roomId: user.roomId };
            const entry = { emoji, username: user.username };
            const removed = await Message.updateOne(filter, { $pull: { reactions: entry } });
            if (removed.matchedCount === 0) return; // not a message of this room
            if (removed.modifiedCount === 0) {
                await Message.updateOne(filter, { $addToSet: { reactions: entry } });
            }
            const message = await Message.findById(messageId, 'reactions').lean();

            io.to(user.roomId).emit('message reaction', {
                messageId: message._id.toString(),
                reactions: (message?.reactions || []).map(r => ({ emoji: r.emoji, username: r.username }))
            });
        } catch (error) {
            console.error('Error saving reaction:', error.message);
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
    
    // Play / pause / seek: anyone in the room controls playback for everyone
    // (changing the video itself stays admin-only, see 'change video').
    const handlePlayback = (kind) => async (time) => {
        const user = users[socket.id];
        if (!user) {
            socket.emit('system message', 'Please join a room first');
            return;
        }
        time = Number(time);
        if (!Number.isFinite(time) || time < 0) return;

        // Broadcast first so other viewers react without waiting for the database
        if (kind === 'seek') {
            socket.to(user.roomId).emit('video seek', time);
        } else {
            socket.to(user.roomId).emit(`video ${kind}`, { time, serverTime: Date.now(), by: user.username });
        }

        try {
            const room = await Room.findById(user.roomId);
            if (room) {
                if (kind === 'play') room.videoState.playing = true;
                if (kind === 'pause') room.videoState.playing = false;
                room.videoState.currentTime = time;
                room.videoState.lastUpdated = new Date();
                await room.save();
            }
        } catch (error) {
            console.error(`Error saving video ${kind} state:`, error);
        }
    };
    socket.on('video play', handlePlayback('play'));
    socket.on('video pause', handlePlayback('pause'));
    socket.on('video seek', handlePlayback('seek'));
    
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
        
        // Anyone in the room can load a video for everyone. Only plain web links
        // are accepted: the URL ends up in a frame on every viewer's page, so a
        // "javascript:" or "data:" address would run code in their browsers.
        if (typeof url !== 'string' || url.trim().length === 0 || url.length > 2000) {
            socket.emit('error message', 'Please paste a valid video link');
            return;
        }
        url = url.trim();
        let parsed;
        try { parsed = new URL(url); } catch { parsed = null; }
        if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
            socket.emit('error message', 'Only http:// or https:// video links can be loaded');
            return;
        }

        {
            try {
                const videoType = detectVideoType(url);
                const infoPromise = fetchVideoInfo(url, videoType); // runs while we save
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
                }

                // Broadcast to all users in the room (not waiting for the title lookup)
                io.to(user.roomId).emit('change video', url);

                // Save to video history, with the real title when the provider has one
                if (room && isDatabaseConnected) {
                    const info = await infoPromise;
                    const videoHistory = new VideoHistory({
                        roomId: user.roomId,
                        url: url,
                        type: videoType,
                        title: info?.title,
                        author: info?.author,
                        thumbnail: info?.thumbnail,
                        addedBy: user.userId,
                        addedByUsername: user.username
                    });
                    await videoHistory.save();
                }
                
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
                    .select('url type title author thumbnail addedByUsername watchedAt');

                // Entries saved before titles existed get theirs now (once; saved back)
                await Promise.all(history.filter(item => !item.title).map(async item => {
                    const info = await fetchVideoInfo(item.url, item.type);
                    if (!info?.title) return;
                    item.title = info.title;
                    item.author = info.author;
                    item.thumbnail = info.thumbnail;
                    await VideoHistory.updateOne({ _id: item._id }, { $set: info }).catch(() => {});
                }));

                const formattedHistory = history.map(item => ({
                    url: item.url,
                    type: item.type,
                    title: item.title || null,
                    author: item.author || null,
                    thumbnail: item.thumbnail || null,
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
// Absolute path, so files are found whatever folder the host starts the app from
app.use(express.static(path.join(__dirname, 'public')));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/admin', adminRoutes);

// Root route - serve landing page that checks auth and redirects
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
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
    const healthCheck = {
        uptime: process.uptime(),
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: isDatabaseConnected ? 'connected' : 'disconnected',
        memory: process.memoryUsage(),
        version: require('./package.json').version
    };
    
    try {
        res.status(200).json(healthCheck);
    } catch (error) {
        healthCheck.message = 'Server error';
        res.status(503).json(healthCheck);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
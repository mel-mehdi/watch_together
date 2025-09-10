const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const { authenticateSocket } = require('./middleware/auth');

// Load environment variables
dotenv.config();

// Flag for database availability
let isDatabaseConnected = false;

// Connect to database with fallback
try {
  connectDB()
    .then(() => {
      console.log("Database connected successfully");
      isDatabaseConnected = true;
      initializeDefaultRoom();
    })
    .catch(err => {
      console.error("Database connection failed, running in memory-only mode:", err.message);
      isDatabaseConnected = false;
    });
} catch (error) {
  console.error("Database connection failed, running in memory-only mode:", error.message);
  isDatabaseConnected = false;
}

// Import models
const User = require('./models/User');
const Room = require('./models/Room');
const Message = require('./models/Message');
const VideoHistory = require('./models/VideoHistory');

// Import routes
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const dbRoutes = require('./routes/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Session configuration
if (isDatabaseConnected) {
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
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/db', dbRoutes);
app.use('/admin', adminRoutes);

// Serve join page for invite links
app.get('/join', (req, res) => {
    res.sendFile(__dirname + '/public/join.html');
});

// Store connected users with enhanced user data
const users = {};
// Store current video state
let videoState = {
    url: '', // Default video
    playing: false,
    currentTime: 0,
    videoType: 'unknown'
};
// Store admin user
let adminUser = null;

// Voice chat users
const voiceChatUsers = {};

// Save queue to prevent parallel saves
const saveQueue = new Map();
let saveTimeout = null;

// Debounced save function for defaultRoom
async function saveDefaultRoom() {
    if (!defaultRoom || !isDatabaseConnected) return;
    
    // Clear any existing timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    // Set a new timeout to save after a short delay
    saveTimeout = setTimeout(async () => {
        try {
            if (defaultRoom && defaultRoom.isModified()) {
                defaultRoom.videoState.lastUpdated = new Date();
                await defaultRoom.save();
                console.log('Default room saved successfully');
            }
        } catch (error) {
            console.error('Error saving default room:', error);
            // If it's a parallel save error, retry after a short delay
            if (error.name === 'ParallelSaveError') {
                setTimeout(saveDefaultRoom, 100);
            }
        }
        saveTimeout = null;
    }, 50); // Save after 50ms delay to batch multiple updates
}

// Create or get default room
let defaultRoom;

async function initializeDefaultRoom() {
    try {
        defaultRoom = await Room.findOne({ name: 'Default Room' });
        
        if (!defaultRoom) {
            defaultRoom = new Room({
                name: 'Default Room',
                currentVideo: { url: '', type: 'unknown' },
                videoState: { playing: false, currentTime: 0 }
            });
            await defaultRoom.save();
        }
        
        // Update application state from database
        videoState.url = defaultRoom.currentVideo.url;
        videoState.videoType = defaultRoom.currentVideo.type;
        videoState.playing = defaultRoom.videoState.playing;
        videoState.currentTime = defaultRoom.videoState.currentTime;
        
        console.log('Default room initialized:', defaultRoom.name);
    } catch (error) {
        console.error('Error initializing default room:', error);
    }
}

// Initialize the default room when server starts
initializeDefaultRoom();

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
    
    // Send current video state to new user
    socket.emit('video state', {
        url: videoState.url,
        playing: videoState.playing,
        currentTime: videoState.currentTime,
        videoType: videoState.videoType
    });
    
    // Modify the user join handler to work without database
    socket.on('user join', async (username) => {
        // Handle user join with or without database
        let userId = null;
        
        // Only attempt database operations if connected
        if (isDatabaseConnected) {
            try {
                // Check if username exists in database
                let user = await User.findOne({ username });
                
                // If user doesn't exist, create a new one as guest
                if (!user) {
                    // Generate a unique email for guest users to avoid duplicate key errors
                    // Use .com domain to match the email validation regex
                    const guestEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@guest.com`;
                    
                    user = new User({ 
                        username, 
                        email: guestEmail,
                        isGuest: true 
                    });
                    await user.save();
                }
                userId = user._id;
                
                // Save system message to database
                if (defaultRoom) {
                    const systemMessage = `${username} has joined the chat`;
                    const message = new Message({
                        roomId: defaultRoom._id,
                        username: 'System',
                        content: systemMessage,
                        isSystemMessage: true
                    });
                    await message.save();
                }
            } catch (error) {
                console.error('Database error during user join:', error.message);
            }
        }
        
        // Store user in memory regardless of database connection
        users[socket.id] = {
            userId: userId,
            username: username,
            isAdmin: adminUser === null // First user becomes admin
        };
        
        // If this is the first user, make them admin
        if (adminUser === null) {
            adminUser = socket.id;
            socket.emit('admin status', true);
            
            // Update room with admin info if database is connected
            if (isDatabaseConnected && defaultRoom) {
                try {
                    defaultRoom.adminUser = userId;
                    saveDefaultRoom();
                } catch (error) {
                    console.error('Database error updating admin in room:', error.message);
                }
            }
        }
        
        // Send current admin to new user
        if (adminUser) {
            socket.emit('admin user', users[adminUser].username);
        }
        
        // Load recent chat messages if database is connected
        if (isDatabaseConnected && defaultRoom) {
            try {
                const recentMessages = await loadRecentMessages(defaultRoom._id);
                socket.emit('recent messages', recentMessages.reverse());
            } catch (error) {
                console.error('Database error loading recent messages:', error.message);
            }
        }
        
        // Notify others that user has joined
        const systemMessage = `${username} has joined the chat`;
        socket.broadcast.emit('system message', systemMessage);
        
        // Let everyone know who is admin
        if (adminUser === socket.id) {
            const adminMessage = `${username} is now the admin controller`;
            io.emit('system message', adminMessage);
            
            // Save admin announcement to database if connected
            if (isDatabaseConnected && defaultRoom) {
                try {
                    const message = new Message({
                        roomId: defaultRoom._id,
                        username: 'System',
                        content: adminMessage,
                        isSystemMessage: true
                    });
                    await message.save();
                } catch (error) {
                    console.error('Database error saving admin message:', error.message);
                }
            }
        }
    });
    
    // Handle chat messages with username
    socket.on('chat message', async (msg) => {
        // Check if the user exists before trying to access their properties
        if (!users[socket.id]) {
            console.log('Received message from unauthenticated user:', socket.id);
            socket.emit('error message', 'Please set your username first');
            return;
        }

        // Validate message content
        if (!msg || typeof msg !== 'string' || msg.trim().length === 0) {
            socket.emit('error message', 'Message cannot be empty');
            return;
        }

        // Sanitize message (basic)
        const sanitizedMessage = msg.trim().substring(0, 500); // Limit message length
        
        const messageData = {
            username: users[socket.id].username,
            message: sanitizedMessage,
            timestamp: new Date().toLocaleTimeString(),
            isAdmin: users[socket.id].isAdmin
        };
        
        // Emit message to all connected clients
        io.emit('chat message', messageData);
        
        // Save message to database if connected
        if (isDatabaseConnected && defaultRoom && users[socket.id]) {
            try {
                const message = new Message({
                    roomId: defaultRoom._id,
                    user: users[socket.id].userId,
                    username: users[socket.id].username,
                    content: sanitizedMessage,
                    isSystemMessage: false
                });
                await message.save();
                console.log('Message saved to database:', sanitizedMessage);
            } catch (error) {
                console.error('Database error saving chat message:', error.message);
            }
        } else {
            console.log('Message sent but not saved to database (not connected or no room)');
        }
    });
    
    // Handle video play event
    socket.on('video play', async (time) => {
        // Make sure user exists
        if (!users[socket.id]) {
            socket.emit('system message', 'Please set your username first');
            return;
        }
        
        // Only admin can control video for everyone
        if (socket.id === adminUser) {
            videoState.playing = true;
            videoState.currentTime = time; // Update the stored time
            
            // Update database
            if (defaultRoom) {
                defaultRoom.videoState.playing = true;
                defaultRoom.videoState.currentTime = time;
                saveDefaultRoom();
            }
            
            // Include server timestamp to help with synchronization
            socket.broadcast.emit('video play', {
                time: time,
                serverTime: Date.now()
            });
        }
    });
    
    // Handle video pause event
    socket.on('video pause', async (time) => {
        // Make sure user exists
        if (!users[socket.id]) {
            socket.emit('system message', 'Please set your username first');
            return;
        }
        
        // Only admin can control video for everyone
        if (socket.id === adminUser) {
            videoState.playing = false;
            videoState.currentTime = time; // Update the stored time
            
            // Update database
            if (defaultRoom) {
                defaultRoom.videoState.playing = false;
                defaultRoom.videoState.currentTime = time;
                saveDefaultRoom();
            }
            
            // Include server timestamp to help with synchronization
            socket.broadcast.emit('video pause', {
                time: time,
                serverTime: Date.now()
            });
        }
    });
    
    // Handle video seek event
    socket.on('video seek', async (time) => {
        // Make sure user exists
        if (!users[socket.id]) {
            socket.emit('system message', 'Please set your username first');
            return;
        }
        
        // Only admin can control video for everyone
        if (socket.id === adminUser) {
            videoState.currentTime = time;
            
            // Update database
            if (defaultRoom) {
                defaultRoom.videoState.currentTime = time;
                saveDefaultRoom();
            }
            
            socket.broadcast.emit('video seek', time);
        }
    });
    
    // Handle time synchronization
    socket.on('sync time', async (time) => {
        // Only admin can sync time for everyone
        if (socket.id === adminUser) {
            videoState.currentTime = time;
            
            // Update database
            if (defaultRoom) {
                defaultRoom.videoState.currentTime = time;
                saveDefaultRoom();
            }
            
            socket.broadcast.emit('sync time', time);
        }
    });
    
    // Handle changing video URL
    socket.on('change video', async (url) => {
        // Make sure user exists
        if (!users[socket.id]) {
            socket.emit('system message', 'Please set your username first');
            return;
        }
        
        // Only admin can change video for everyone
        if (socket.id === adminUser) {
            const videoType = detectVideoType(url);
            
            videoState.url = url;
            videoState.currentTime = 0;
            videoState.playing = false;
            videoState.videoType = videoType;
            
            // Update database
            if (defaultRoom) {
                defaultRoom.currentVideo = {
                    url: url,
                    type: videoType
                };
                defaultRoom.videoState = {
                    playing: false,
                    currentTime: 0,
                    lastUpdated: new Date()
                };
                saveDefaultRoom();
                
                // Save to video history
                const videoHistory = new VideoHistory({
                    roomId: defaultRoom._id,
                    url: url,
                    type: videoType,
                    addedBy: users[socket.id].userId,
                    addedByUsername: users[socket.id].username
                });
                await videoHistory.save();
            }
            
            io.emit('change video', url);
            
            const systemMessage = `${users[socket.id].username} changed the video`;
            io.emit('system message', systemMessage);
            
            // Save system message to database
            if (defaultRoom) {
                const message = new Message({
                    roomId: defaultRoom._id,
                    username: 'System',
                    content: systemMessage,
                    isSystemMessage: true
                });
                await message.save();
            }
        }
    });

    // Handle request to become admin
    socket.on('request admin', () => {
        // Make sure user exists
        if (!users[socket.id]) {
            socket.emit('system message', 'Please set your username first');
            return;
        }
        
        if (adminUser && socket.id !== adminUser) {
            io.to(adminUser).emit('admin request', users[socket.id].username, socket.id);
        }
    });
    
    // Handle admin transfer
    socket.on('transfer admin', (userId) => {
        if (socket.id === adminUser && users[userId]) {
            // Transfer admin status
            users[adminUser].isAdmin = false;
            adminUser = userId;
            users[adminUser].isAdmin = true;
            
            // Notify all users about admin change
            io.emit('admin user', users[adminUser].username);
            io.emit('system message', `${users[adminUser].username} is now the admin controller`);
            
            // Notify the new admin
            io.to(adminUser).emit('admin status', true);
        }
    });
    
    // Handle admin actions for visual cues
    socket.on('admin action', (action) => {
        if (socket.id === adminUser) {
            socket.broadcast.emit('admin action', action);
        }
    });
    
    // Simple Voice Chat System
    socket.on('join-voice-chat', () => {
        if (!users[socket.id]) return;
        
        const username = users[socket.id].username;
        voiceChatUsers[socket.id] = { username };
        
        // Notify others that this user joined voice chat
        socket.broadcast.emit('user-joined-voice', socket.id);
        
        console.log(`${username} joined voice chat`);
    });

    socket.on('leave-voice-chat', () => {
        if (voiceChatUsers[socket.id]) {
            const username = voiceChatUsers[socket.id].username;
            delete voiceChatUsers[socket.id];
            
            // Notify others that this user left voice chat
            socket.broadcast.emit('user-left-voice', socket.id);
            
            console.log(`${username} left voice chat`);
        }
    });

    socket.on('offer', (data) => {
        socket.to(data.to).emit('offer', {
            offer: data.offer,
            from: socket.id
        });
        console.log(`Offer sent from ${socket.id} to ${data.to}`);
    });

    socket.on('answer', (data) => {
        socket.to(data.to).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
        console.log(`Answer sent from ${socket.id} to ${data.to}`);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });
    
    // Handle detailed sync from admin
    socket.on('detailed sync', (data) => {
        // Only admin can send detailed sync
        if (socket.id === adminUser) {
            // Update stored video state
            videoState.playing = data.state === 1;
            videoState.currentTime = data.time;
            
            // Broadcast to all other users
            socket.broadcast.emit('detailed sync', data);
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
        if (users[socket.id]) {
            const systemMessage = `${users[socket.id].username} has left the chat`;
            io.emit('system message', systemMessage);
            
            // Save system message to database
            if (defaultRoom) {
                const message = new Message({
                    roomId: defaultRoom._id,
                    username: 'System',
                    content: systemMessage,
                    isSystemMessage: true
                });
                await message.save();
            }
            
            // If admin disconnects, assign a new admin
            if (socket.id === adminUser) {
                adminUser = null;
                
                // Find a new admin from remaining users
                const remainingUsers = Object.keys(users).filter(id => id !== socket.id);
                if (remainingUsers.length > 0) {
                    adminUser = remainingUsers[0];
                    users[adminUser].isAdmin = true;
                    
                    // Update database with new admin
                    if (defaultRoom && users[adminUser]) {
                        defaultRoom.adminUser = users[adminUser].userId;
                        saveDefaultRoom();
                    }
                    
                    // Notify new admin and all users
                    io.to(adminUser).emit('admin status', true);
                    io.emit('admin user', users[adminUser].username);
                    
                    const adminMessage = `${users[adminUser].username} is now the admin controller`;
                    io.emit('system message', adminMessage);
                    
                    // Save admin change to database
                    if (defaultRoom) {
                        const message = new Message({
                            roomId: defaultRoom._id,
                            username: 'System',
                            content: adminMessage,
                            isSystemMessage: true
                        });
                        await message.save();
                    }
                }
            }
            
            delete users[socket.id];
        }
        
        // Clean up voice chat if user was in it
        if (voiceChatUsers[socket.id]) {
            delete voiceChatUsers[socket.id];
            io.emit('user left voice', socket.id);
        }
        
        console.log('A user disconnected');
    });
});

// Simple database viewer page
app.get('/db', async (req, res) => {
    if (!isDatabaseConnected) {
        return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Database Viewer</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 20px;
                    text-align: center;
                    padding-top: 50px;
                }
                .error-message {
                    background-color: #f8d7da;
                    color: #721c24;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px auto;
                    max-width: 500px;
                }
                h1 {
                    color: #6c757d;
                }
            </style>
        </head>
        <body>
            <h1>Watch Together Database Viewer</h1>
            <div class="error-message">
                <h2>Database Not Connected</h2>
                <p>The application is currently running in memory-only mode. Database features are not available.</p>
                <p>Please check your MongoDB connection and restart the server.</p>
            </div>
        </body>
        </html>
        `);
    }
    
    try {
        const userCount = await User.countDocuments();
        const roomCount = await Room.countDocuments();
        const messageCount = await Message.countDocuments();
        const videoHistoryCount = await VideoHistory.countDocuments();
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Database Viewer</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 20px;
                    background-color: #f7f7f7;
                }
                h1 {
                    color: #128c7e;
                }
                .card {
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .counts {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .count-box {
                    background-color: #128c7e;
                    color: white;
                    padding: 15px;
                    border-radius: 8px;
                    width: 150px;
                    text-align: center;
                }
                .count-box h3 {
                    margin: 0;
                    font-size: 16px;
                }
                .count-box p {
                    font-size: 28px;
                    font-weight: bold;
                    margin: 10px 0 0 0;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }
                table th, table td {
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }
                table th {
                    background-color: #f2f2f2;
                    color: #333;
                }
                table tr:nth-child(even) {
                    background-color: #f9f9f9;
                }
                .loading {
                    color: #666;
                    font-style: italic;
                }
                .tab-buttons {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .tab-button {
                    padding: 10px 20px;
                    background-color: #e0e0e0;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                }
                .tab-button.active {
                    background-color: #128c7e;
                    color: white;
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }
                .json {
                    font-family: monospace;
                    white-space: pre-wrap;
                    background-color: #f5f5f5;
                    padding: 15px;
                    border-radius: 5px;
                    max-height: 400px;
                    overflow-y: auto;
                }
            </style>
        </head>
        <body>
            <h1>Watch Together Database Viewer</h1>
            
            <div class="counts">
                <div class="count-box">
                    <h3>Users</h3>
                    <p>${userCount}</p>
                </div>
                <div class="count-box">
                    <h3>Rooms</h3>
                    <p>${roomCount}</p>
                </div>
                <div class="count-box">
                    <h3>Messages</h3>
                    <p>${messageCount}</p>
                </div>
                <div class="count-box">
                    <h3>Video History</h3>
                    <p>${videoHistoryCount}</p>
                </div>
            </div>
            
            <div class="tab-buttons">
                <button class="tab-button active" data-tab="users">Users</button>
                <button class="tab-button" data-tab="rooms">Rooms</button>
                <button class="tab-button" data-tab="messages">Messages</button>
                <button class="tab-button" data-tab="videos">Video History</button>
            </div>
            
            <div class="card tab-content active" id="users-tab">
                <h2>Users</h2>
                <div id="users-content">
                    <p class="loading">Loading users...</p>
                </div>
            </div>
            
            <div class="card tab-content" id="rooms-tab">
                <h2>Rooms</h2>
                <div id="rooms-content">
                    <p class="loading">Loading rooms...</p>
                </div>
            </div>
            
            <div class="card tab-content" id="messages-tab">
                <h2>Messages</h2>
                <div id="messages-content">
                    <p class="loading">Loading messages...</p>
                </div>
            </div>
            
            <div class="card tab-content" id="videos-tab">
                <h2>Video History</h2>
                <div id="videos-content">
                    <p class="loading">Loading video history...</p>
                </div>
            </div>
            
            <script>
                // Tab switching functionality
                document.querySelectorAll('.tab-button').forEach(button => {
                    button.addEventListener('click', () => {
                        // Update active tab button
                        document.querySelectorAll('.tab-button').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        button.classList.add('active');
                        
                        // Update active tab content
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });
                        document.getElementById(button.dataset.tab + '-tab').classList.add('active');
                    });
                });
                
                // Helper function to create tables from data
                function createTable(data, columns) {
                    if (!data || data.length === 0) {
                        return '<p>No data available</p>';
                    }
                    
                    let table = '<table><thead><tr>';
                    
                    // Create table headers
                    columns.forEach(col => {
                        table += \`<th>\${col.label}</th>\`;
                    });
                    table += '</tr></thead><tbody>';
                    
                    // Create table rows
                    data.forEach(item => {
                        table += '<tr>';
                        columns.forEach(col => {
                            let value = item[col.key];
                            
                            // Format dates
                            if (col.type === 'date' && value) {
                                value = new Date(value).toLocaleString();
                            }
                            
                            // Format booleans
                            if (col.type === 'boolean') {
                                value = value ? 'Yes' : 'No';
                            }
                            
                            // Handle nested objects
                            if (col.type === 'object' && value) {
                                value = JSON.stringify(value).substring(0, 50) + '...';
                            }
                            
                            // Handle undefined or null
                            if (value === undefined || value === null) {
                                value = '-';
                            }
                            
                            table += \`<td>\${value}</td>\`;
                        });
                        table += '</tr>';
                    });
                    
                    table += '</tbody></table>';
                    return table;
                }
                
                // Load data for all tabs
                async function loadData() {
                    try {
                        // Load users
                        const usersResponse = await fetch('/api/users');
                        const users = await usersResponse.json();
                        document.getElementById('users-content').innerHTML = createTable(users, [
                            { key: 'username', label: 'Username' },
                            { key: 'email', label: 'Email' },
                            { key: 'isAdmin', label: 'Admin', type: 'boolean' },
                            { key: 'createdAt', label: 'Created At', type: 'date' }
                        ]);
                        
                        // Load rooms
                        const roomsResponse = await fetch('/api/rooms');
                        const rooms = await roomsResponse.json();
                        document.getElementById('rooms-content').innerHTML = createTable(rooms, [
                            { key: 'name', label: 'Room Name' },
                            { key: 'currentVideo.url', label: 'Current Video' },
                            { key: 'currentVideo.type', label: 'Video Type' },
                            { key: 'videoState.playing', label: 'Playing', type: 'boolean' },
                            { key: 'videoState.currentTime', label: 'Current Time' },
                            { key: 'createdAt', label: 'Created At', type: 'date' }
                        ]);
                        
                        // Load messages
                        const messagesResponse = await fetch('/api/messages');
                        const messages = await messagesResponse.json();
                        document.getElementById('messages-content').innerHTML = createTable(messages, [
                            { key: 'username', label: 'Username' },
                            { key: 'content', label: 'Message' },
                            { key: 'isSystemMessage', label: 'System Message', type: 'boolean' },
                            { key: 'timestamp', label: 'Timestamp', type: 'date' }
                        ]);
                        
                        // Load video history
                        const videosResponse = await fetch('/api/videos');
                        const videos = await videosResponse.json();
                        document.getElementById('videos-content').innerHTML = createTable(videos, [
                            { key: 'url', label: 'Video URL' },
                            { key: 'type', label: 'Video Type' },
                            { key: 'addedByUsername', label: 'Added By' },
                            { key: 'watchedAt', label: 'Watched At', type: 'date' }
                        ]);
                    } catch (error) {
                        console.error('Error loading data:', error);
                    }
                }
                
                // Load data when page loads
                window.addEventListener('load', loadData);
            </script>
        </body>
        </html>
        `;
        
        res.send(html);
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
});

// API Routes for database access
app.get('/api/videos/history', async (req, res) => {
    if (!isDatabaseConnected) {
        return res.status(503).json({ message: 'Database not available' });
    }
    
    try {
        if (defaultRoom) {
            const history = await VideoHistory.find({ roomId: defaultRoom._id })
                .sort({ watchedAt: -1 })
                .limit(20)
                .lean();
            
            res.json(history);
        } else {
            res.status(404).json({ message: 'Room not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/messages', async (req, res) => {
    if (!isDatabaseConnected) {
        return res.status(503).json({ message: 'Database not available' });
    }
    
    try {
        if (defaultRoom) {
            const messages = await Message.find({ roomId: defaultRoom._id })
                .sort({ timestamp: -1 })
                .limit(100)
                .lean();
            
            res.json(messages);
        } else {
            res.status(404).json({ message: 'Room not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/users', async (req, res) => {
    if (!isDatabaseConnected) {
        return res.status(503).json({ message: 'Database not available' });
    }
    
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rooms', async (req, res) => {
    if (!isDatabaseConnected) {
        return res.status(503).json({ message: 'Database not available' });
    }
    
    try {
        const rooms = await Room.find().sort({ createdAt: -1 });
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/videos', async (req, res) => {
    if (!isDatabaseConnected) {
        return res.status(503).json({ message: 'Database not available' });
    }
    
    try {
        const videos = await VideoHistory.find()
            .sort({ watchedAt: -1 })
            .limit(100);
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
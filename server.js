const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Store connected users
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

io.on('connection', (socket) => {
    console.log('A user connected');
    
    // Send current video state to new user
    socket.emit('video state', {
        url: videoState.url,
        playing: videoState.playing,
        currentTime: videoState.currentTime,
        videoType: videoState.videoType
    });
    
    // Handle user joining with username
    socket.on('user join', (username) => {
        users[socket.id] = {
            username: username,
            isAdmin: adminUser === null // First user becomes admin
        };
        
        // If this is the first user, make them admin
        if (adminUser === null) {
            adminUser = socket.id;
            socket.emit('admin status', true);
        }
        
        // Send current admin to new user
        if (adminUser) {
            socket.emit('admin user', users[adminUser].username);
        }
        
        // Notify others that user has joined
        socket.broadcast.emit('system message', `${username} has joined the chat`);
        
        // Let everyone know who is admin
        if (adminUser === socket.id) {
            io.emit('system message', `${username} is now the admin controller`);
        }
    });
    
    // Handle chat messages with username
    socket.on('chat message', (msg) => {
        io.emit('chat message', {
            username: users[socket.id].username,
            message: msg,
            timestamp: new Date().toLocaleTimeString(),
            isAdmin: users[socket.id].isAdmin
        });
    });
    
    // Handle video play event
    socket.on('video play', (time) => {
        // Only admin can control video for everyone
        if (socket.id === adminUser) {
            videoState.playing = true;
            videoState.currentTime = time; // Update the stored time
            
            // Include server timestamp to help with synchronization
            socket.broadcast.emit('video play', {
                time: time,
                serverTime: Date.now()
            });
        }
    });
    
    // Handle video pause event
    socket.on('video pause', (time) => {
        // Only admin can control video for everyone
        if (socket.id === adminUser) {
            videoState.playing = false;
            videoState.currentTime = time; // Update the stored time
            
            // Include server timestamp to help with synchronization
            socket.broadcast.emit('video pause', {
                time: time,
                serverTime: Date.now()
            });
        }
    });
    
    // Handle video seek event
    socket.on('video seek', (time) => {
        // Only admin can control video for everyone
        if (socket.id === adminUser) {
            videoState.currentTime = time;
            socket.broadcast.emit('video seek', time);
        }
    });
    
    // Handle time synchronization
    socket.on('sync time', (time) => {
        // Only admin can sync time for everyone
        if (socket.id === adminUser) {
            videoState.currentTime = time;
            socket.broadcast.emit('sync time', time);
        }
    });
    
    // Handle changing video URL
    socket.on('change video', (url) => {
        // Only admin can change video for everyone
        if (socket.id === adminUser) {
            videoState.url = url;
            videoState.currentTime = 0;
            videoState.playing = false;
            videoState.videoType = detectVideoType(url);
            
            io.emit('change video', url);
            io.emit('system message', `${users[socket.id].username} changed the video`);
        }
    });
    
    // Handle request to become admin
    socket.on('request admin', () => {
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
    
    // Handle voice chat
    socket.on('join voice chat', (username) => {
        voiceChatUsers[socket.id] = username;
        
        // Notify all users that this user joined voice chat
        io.emit('user joined voice', {
            userId: socket.id,
            username: username
        });
    });

    socket.on('leave voice chat', () => {
        delete voiceChatUsers[socket.id];
        
        // Notify all users that this user left voice chat
        io.emit('user left voice', socket.id);
    });

    socket.on('voice offer', (data) => {
        socket.to(data.to).emit('voice offer', {
            offer: data.offer,
            from: socket.id
        });
    });

    socket.on('voice answer', (data) => {
        socket.to(data.to).emit('voice answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    socket.on('ice candidate', (data) => {
        socket.to(data.to).emit('ice candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });

    socket.on('speaking', (speaking) => {
        // Broadcast to all other users if this user is speaking
        socket.broadcast.emit('user speaking', {
            userId: socket.id,
            speaking: speaking
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
    socket.on('disconnect', () => {
        if (users[socket.id]) {
            io.emit('system message', `${users[socket.id].username} has left the chat`);
            
            // If admin disconnects, assign a new admin
            if (socket.id === adminUser) {
                adminUser = null;
                
                // Find a new admin from remaining users
                const remainingUsers = Object.keys(users).filter(id => id !== socket.id);
                if (remainingUsers.length > 0) {
                    adminUser = remainingUsers[0];
                    users[adminUser].isAdmin = true;
                    
                    // Notify new admin and all users
                    io.to(adminUser).emit('admin status', true);
                    io.emit('admin user', users[adminUser].username);
                    io.emit('system message', `${users[adminUser].username} is now the admin controller`);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
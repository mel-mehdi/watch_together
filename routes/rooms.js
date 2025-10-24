const express = require('express');
const crypto = require('crypto');
const Room = require('../models/Room');
const User = require('../models/User');
const Message = require('../models/Message');
const VideoHistory = require('../models/VideoHistory');
const router = express.Router();

// Middleware to check database connection
const checkDatabaseConnection = (req, res, next) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            success: false,
            message: 'Database is not available. Please try again later.'
        });
    }
    next();
};

// Apply database check to all routes
router.use(checkDatabaseConnection);

// Create a new room
router.post('/create', async (req, res) => {
    try {
        const { roomName, description, isPrivate, maxUsers, creatorUsername } = req.body;

        // Validation
        if (!roomName || !creatorUsername) {
            return res.status(400).json({ 
                success: false, 
                message: 'Room name and creator username are required' 
            });
        }

        if (roomName.length < 3 || roomName.length > 50) {
            return res.status(400).json({ 
                success: false, 
                message: 'Room name must be between 3 and 50 characters' 
            });
        }

        // Generate unique room code (8 characters for easy sharing)
        let roomCode;
        let isUnique = false;
        while (!isUnique) {
            roomCode = crypto.randomBytes(4).toString('hex').toUpperCase();
            const existingRoom = await Room.findOne({ roomCode });
            if (!existingRoom) {
                isUnique = true;
            }
        }

        // Find or create creator user
        let creator = await User.findOne({ username: creatorUsername });
        if (!creator) {
            // Create guest user for creator
            const guestEmail = `${creatorUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@guest.com`;
            creator = new User({
                username: creatorUsername,
                email: guestEmail,
                isGuest: true
            });
            await creator.save();
        }

        // Create room
        const room = new Room({
            name: roomName,
            description: description || '',
            roomCode: roomCode,
            adminUser: creator._id,
            users: [creator._id],
            isPrivate: isPrivate !== false, // Default to private
            maxUsers: maxUsers || 50,
            currentVideo: { url: '', type: 'unknown' },
            videoState: { playing: false, currentTime: 0 }
        });

        await room.save();

        // Generate invite link if room is private
        let inviteCode = null;
        if (room.isPrivate) {
            inviteCode = crypto.randomBytes(16).toString('hex');
            room.inviteCode = inviteCode;
            room.inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            await room.save();
        }

        const roomUrl = `${req.protocol}://${req.get('host')}/room/${room.roomCode}`;
        const joinUrl = `${req.protocol}://${req.get('host')}/join?code=${room.roomCode}`;

        res.json({
            success: true,
            message: 'Room created successfully',
            room: {
                id: room._id,
                name: room.name,
                description: room.description,
                roomCode: room.roomCode,
                isPrivate: room.isPrivate,
                maxUsers: room.maxUsers,
                userCount: 1,
                roomUrl: roomUrl,
                joinUrl: joinUrl,
                inviteCode: inviteCode,
                createdAt: room.createdAt
            },
            creator: {
                id: creator._id,
                username: creator.username,
                isGuest: creator.isGuest
            }
        });

    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error creating room' 
        });
    }
});

// Join room by code
router.post('/join', async (req, res) => {
    try {
        const { roomCode, username } = req.body;

        if (!roomCode || !username) {
            return res.status(400).json({ 
                success: false, 
                message: 'Room code and username are required' 
            });
        }

        // Find room by code
        const room = await Room.findOne({ roomCode: roomCode.toUpperCase() })
            .populate('users', 'username');

        if (!room) {
            return res.status(404).json({ 
                success: false, 
                message: 'Room not found with this code' 
            });
        }

        // Check if room is full
        if (room.users.length >= room.maxUsers) {
            return res.status(400).json({ 
                success: false, 
                message: 'Room is full' 
            });
        }

        // Find or create user
        let user = await User.findOne({ username });
        if (!user) {
            // Create guest user
            const guestEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@guest.com`;
            user = new User({
                username,
                email: guestEmail,
                isGuest: true
            });
            await user.save();
        }

        // Check if user is already in room
        if (!room.users.some(u => u._id.toString() === user._id.toString())) {
            room.users.push(user._id);
            await room.save();
        }

        // Update user status
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        const roomUrl = `${req.protocol}://${req.get('host')}/room/${room.roomCode}`;

        res.json({
            success: true,
            message: 'Successfully joined room',
            room: {
                id: room._id,
                name: room.name,
                description: room.description,
                roomCode: room.roomCode,
                currentVideo: room.currentVideo,
                videoState: room.videoState,
                userCount: room.users.length,
                maxUsers: room.maxUsers,
                roomUrl: roomUrl
            },
            user: {
                id: user._id,
                username: user.username,
                isGuest: user.isGuest
            }
        });

    } catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error joining room' 
        });
    }
});

// Get room info by code (for preview)
router.get('/info/:roomCode', async (req, res) => {
    try {
        const { roomCode } = req.params;

        const room = await Room.findOne({ roomCode: roomCode.toUpperCase() })
            .populate('adminUser', 'username avatar')
            .populate('users', 'username avatar isOnline');

        if (!room) {
            return res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }

        res.json({
            success: true,
            room: {
                name: room.name,
                description: room.description,
                adminUser: room.adminUser,
                userCount: room.users.length,
                maxUsers: room.maxUsers,
                currentVideo: room.currentVideo.url ? 'Video playing' : 'No video',
                isPrivate: room.isPrivate,
                createdAt: room.createdAt
            }
        });

    } catch (error) {
        console.error('Get room info error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error getting room info' 
        });
    }
});

// Get room details by ID
router.get('/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        let room;

        // Try to find by room code first (8 characters), then by ObjectId
        if (roomId.length === 8) {
            room = await Room.findOne({ roomCode: roomId.toUpperCase() })
                .populate('adminUser', 'username avatar')
                .populate('users', 'username avatar isOnline');
        } else {
            // Try to find by ObjectId
            room = await Room.findById(roomId)
                .populate('adminUser', 'username avatar')
                .populate('users', 'username avatar isOnline');
        }

        if (!room) {
            return res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }

        res.json({
            success: true,
            room: {
                id: room._id,
                name: room.name,
                description: room.description,
                roomCode: room.roomCode,
                currentVideo: room.currentVideo,
                videoState: room.videoState,
                adminUser: room.adminUser,
                users: room.users,
                userCount: room.users.length,
                maxUsers: room.maxUsers,
                isPrivate: room.isPrivate,
                createdAt: room.createdAt
            }
        });

    } catch (error) {
        console.error('Get room error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error getting room info' 
        });
    }
});

// Join room via invite code
router.post('/join/:inviteCode', async (req, res) => {
    try {
        const { inviteCode } = req.params;
        const { username } = req.body;

        // Find room by invite code
        const room = await Room.findOne({
            inviteCode,
            inviteExpires: { $gt: new Date() }
        }).populate('users', 'username');

        if (!room) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired invite link' 
            });
        }

        // Check if room is full
        if (room.users.length >= room.maxUsers) {
            return res.status(400).json({ 
                success: false, 
                message: 'Room is full' 
            });
        }

        let user;
        
        // Check if user is authenticated
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
                user = await User.findById(decoded.userId);
            } catch (jwtError) {
                // Invalid token, continue as guest
            }
        }

        if (!user) {
            // Create guest user or use provided username
            const guestUsername = username || `Guest_${Math.random().toString(36).substr(2, 9)}`;
            
            // Check if guest username already exists in room
            const existingGuestInRoom = room.users.find(u => u.username === guestUsername);
            if (existingGuestInRoom) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Username already taken in this room' 
                });
            }

            // Generate a unique email for guest users to avoid duplicate key errors
            const guestEmail = `${guestUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@guest.com`;
            
            user = new User({
                username: guestUsername,
                email: guestEmail,
                isGuest: true
            });
            await user.save();
        }

        // Check if user is already in room
        if (!room.users.includes(user._id)) {
            room.users.push(user._id);
            await room.save();
        }

        // Update user status
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'Successfully joined room',
            room: {
                id: room._id,
                name: room.name,
                currentVideo: room.currentVideo,
                videoState: room.videoState
            },
            user: {
                id: user._id,
                username: user.username,
                isGuest: user.isGuest,
                avatar: user.avatar || ''
            }
        });

    } catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error joining room' 
        });
    }
});

// Get invite info (for preview before joining)
router.get('/invite/:inviteCode', async (req, res) => {
    try {
        const { inviteCode } = req.params;

        const room = await Room.findOne({
            inviteCode,
            inviteExpires: { $gt: new Date() }
        }).populate('adminUser', 'username avatar');

        if (!room) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired invite link' 
            });
        }

        res.json({
            success: true,
            room: {
                name: room.name,
                adminUser: room.adminUser,
                userCount: room.users.length,
                maxUsers: room.maxUsers,
                currentVideo: room.currentVideo.title || 'No video playing',
                createdAt: room.createdAt
            }
        });

    } catch (error) {
        console.error('Get invite info error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error getting invite info' 
        });
    }
});

// Generate invite link for existing room
router.post('/:roomId/invite', async (req, res) => {
    try {
        const { roomId } = req.params;
        
        // Find the room by ID or room code
        let room;
        if (roomId.length === 8) {
            // It's a room code
            room = await Room.findOne({ roomCode: roomId.toUpperCase() });
        } else {
            // It's an ObjectId
            room = await Room.findById(roomId);
        }

        if (!room) {
            return res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }

        // Generate new invite code
        const inviteCode = crypto.randomBytes(16).toString('hex');
        room.inviteCode = inviteCode;
        room.inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await room.save();

        const inviteUrl = `${req.protocol}://${req.get('host')}/join?code=${inviteCode}`;

        res.json({
            success: true,
            inviteCode: inviteCode,
            inviteUrl: inviteUrl,
            expiresAt: room.inviteExpires
        });

    } catch (error) {
        console.error('Generate invite error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error generating invite' 
        });
    }
});

// Revoke invite link
router.delete('/:roomId/invite', async (req, res) => {
    try {
        const { roomId } = req.params;
        
        // Find the room by ID or room code
        let room;
        if (roomId.length === 8) {
            // It's a room code
            room = await Room.findOne({ roomCode: roomId.toUpperCase() });
        } else {
            // It's an ObjectId
            room = await Room.findById(roomId);
        }

        if (!room) {
            return res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }

        // Remove invite code
        room.inviteCode = null;
        room.inviteExpires = null;
        await room.save();

        res.json({
            success: true,
            message: 'Invite link revoked successfully'
        });

    } catch (error) {
        console.error('Revoke invite error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error revoking invite' 
        });
    }
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const Room = require('../models/Room');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get room info
router.get('/:roomId', async (req, res) => {
    try {
        let room;
        
        // Handle special case for "default" room
        if (req.params.roomId === 'default') {
            room = await Room.findOne({ name: 'Default Room' })
                .populate('adminUser', 'username avatar')
                .populate('users', 'username avatar isOnline');
        } else {
            room = await Room.findById(req.params.roomId)
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

// Generate invite link for room
router.post('/:roomId/invite', authenticateToken, async (req, res) => {
    try {
        let room;
        
        // Handle special case for "default" room
        if (req.params.roomId === 'default') {
            room = await Room.findOne({ name: 'Default Room' });
        } else {
            room = await Room.findById(req.params.roomId);
        }

        if (!room) {
            return res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }

        // Check if user is admin of the room
        if (room.adminUser.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Only room admin can generate invite links' 
            });
        }

        // Generate unique invite code
        const inviteCode = crypto.randomBytes(16).toString('hex');
        const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        room.inviteCode = inviteCode;
        room.inviteExpires = inviteExpires;
        await room.save();

        const inviteUrl = `${req.protocol}://${req.get('host')}/join?code=${inviteCode}`;

        res.json({
            success: true,
            message: 'Invite link generated successfully',
            inviteCode,
            inviteUrl,
            expiresAt: inviteExpires
        });

    } catch (error) {
        console.error('Generate invite error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error generating invite link' 
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
            // Use .com domain to match the email validation regex
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
                avatar: user.getAvatarInitials()
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

// Revoke invite link
router.delete('/:roomId/invite', authenticateToken, async (req, res) => {
    try {
        let room;
        
        // Handle special case for "default" room
        if (req.params.roomId === 'default') {
            room = await Room.findOne({ name: 'Default Room' });
        } else {
            room = await Room.findById(req.params.roomId);
        }

        if (!room) {
            return res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }

        // Check if user is admin of the room
        if (room.adminUser.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Only room admin can revoke invite links' 
            });
        }

        room.inviteCode = undefined;
        room.inviteExpires = undefined;
        await room.save();

        res.json({
            success: true,
            message: 'Invite link revoked successfully'
        });

    } catch (error) {
        console.error('Revoke invite error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error revoking invite link' 
        });
    }
});

module.exports = router;

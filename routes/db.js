const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const VideoHistory = require('../models/VideoHistory');

// Database viewer page
router.get('/', async (req, res) => {
    try {
        // Get collection stats
        const userCount = await User.countDocuments();
        const roomCount = await Room.countDocuments();
        const messageCount = await Message.countDocuments();
        const videoHistoryCount = await VideoHistory.countDocuments();

        // Get recent data
        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10);
        const recentMessages = await Message.find().populate('user', 'username').sort({ timestamp: -1 }).limit(20);
        const recentVideos = await VideoHistory.find().sort({ timestamp: -1 }).limit(10);
        const rooms = await Room.find();

        res.json({
            stats: {
                users: userCount,
                rooms: roomCount,
                messages: messageCount,
                videoHistory: videoHistoryCount
            },
            collections: {
                users: recentUsers,
                messages: recentMessages,
                videos: recentVideos,
                rooms: rooms
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all messages
router.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find().populate('user', 'username').sort({ timestamp: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all rooms
router.get('/rooms', async (req, res) => {
    try {
        const rooms = await Room.find();
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get video history
router.get('/videos', async (req, res) => {
    try {
        const videos = await VideoHistory.find().sort({ timestamp: -1 });
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

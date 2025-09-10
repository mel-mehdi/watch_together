const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const VideoHistory = require('../models/VideoHistory');

// Authentication middleware - very basic for demo purposes
const isAuthenticated = (req, res, next) => {
    // In a real app, you'd use proper authentication
    const adminKey = req.query.key;
    if (adminKey === process.env.ADMIN_KEY) {
        return next();
    }
    return res.status(401).send('Authentication required');
};

// Admin dashboard
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Count objects in each collection
        const userCount = await User.countDocuments();
        const roomCount = await Room.countDocuments();
        const messageCount = await Message.countDocuments();
        const videoHistoryCount = await VideoHistory.countDocuments();

        res.render('admin/dashboard', {
            userCount,
            roomCount,
            messageCount,
            videoHistoryCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Users list
router.get('/users', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.render('admin/users', { users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rooms list
router.get('/rooms', isAuthenticated, async (req, res) => {
    try {
        const rooms = await Room.find().sort({ createdAt: -1 });
        res.render('admin/rooms', { rooms });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Messages list
router.get('/messages', isAuthenticated, async (req, res) => {
    try {
        const messages = await Message.find()
            .sort({ timestamp: -1 })
            .limit(100);
        res.render('admin/messages', { messages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Video history list
router.get('/videos', isAuthenticated, async (req, res) => {
    try {
        const videos = await VideoHistory.find()
            .sort({ watchedAt: -1 })
            .limit(100);
        res.render('admin/videos', { videos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API endpoints for JSON data
router.get('/api/users', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/rooms', isAuthenticated, async (req, res) => {
    try {
        const rooms = await Room.find().sort({ createdAt: -1 });
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/messages', isAuthenticated, async (req, res) => {
    try {
        const messages = await Message.find()
            .sort({ timestamp: -1 })
            .limit(100);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/videos', isAuthenticated, async (req, res) => {
    try {
        const videos = await VideoHistory.find()
            .sort({ watchedAt: -1 })
            .limit(100);
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
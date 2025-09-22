const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Room = require('../models/Room');
const VideoHistory = require('../models/VideoHistory');

module.exports = (io) => {
    const router = express.Router();

    // Middleware to verify admin access
    const verifyAdmin = async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).json({ message: 'Access token required' });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
            const user = await User.findById(decoded.userId);
            
            if (!user || !user.isAdmin) {
                return res.status(403).json({ message: 'Admin access required' });
            }

            req.user = user;
            next();
        } catch (error) {
            return res.status(401).json({ message: 'Invalid token' });
        }
    };

    // Get admin dashboard stats
    router.get('/stats', verifyAdmin, async (req, res) => {
        try {
            // Get basic stats from database
            const totalUsers = await User.countDocuments();
            const activeUsers = await User.countDocuments({ 
                lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
            });
            const totalRooms = await Room.countDocuments();
            const activeRooms = await Room.countDocuments({
                'participants.0': { $exists: true }
            });
            const videosShared = await VideoHistory.countDocuments();

            const stats = {
                totalUsers: totalUsers || 0,
                activeRooms: activeRooms || 0,
                onlineUsers: activeUsers || 0,
                videosShared: videosShared || 0
            };

            res.json(stats);
        } catch (error) {
            console.error('Error fetching admin stats:', error);
            res.status(500).json({ message: 'Failed to fetch stats' });
        }
    });

    // Get users list
    router.get('/users', verifyAdmin, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const search = req.query.search || '';

            let query = {};
            if (search) {
                query = {
                    $or: [
                        { username: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } }
                    ]
                };
            }

            const users = await User.find(query)
                .select('-password')
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit);

            const total = await User.countDocuments(query);

            res.json({
                users,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                total
            });
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ message: 'Failed to fetch users' });
        }
    });

    // Update user
    router.put('/users/:id', verifyAdmin, async (req, res) => {
        try {
            const { username, email, isAdmin, status } = req.body;
            
            const user = await User.findByIdAndUpdate(
                req.params.id,
                { username, email, isAdmin, status },
                { new: true, select: '-password' }
            );

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            res.json(user);
        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({ message: 'Failed to update user' });
        }
    });

    // Delete user
    router.delete('/users/:id', verifyAdmin, async (req, res) => {
        try {
            const user = await User.findByIdAndDelete(req.params.id);
            
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            res.json({ message: 'User deleted successfully' });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ message: 'Failed to delete user' });
        }
    });

    // Get rooms list
    router.get('/rooms', verifyAdmin, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const search = req.query.search || '';

            let query = {};
            if (search) {
                query = {
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { roomCode: { $regex: search, $options: 'i' } }
                    ]
                };
            }

            const rooms = await Room.find(query)
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit);

            const total = await Room.countDocuments(query);

            res.json({
                rooms,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                total
            });
        } catch (error) {
            console.error('Error fetching rooms:', error);
            res.status(500).json({ message: 'Failed to fetch rooms' });
        }
    });

    // Update room
    router.put('/rooms/:id', verifyAdmin, async (req, res) => {
        try {
            const { name, description, password } = req.body;
            
            const room = await Room.findByIdAndUpdate(
                req.params.id,
                { name, description, password },
                { new: true }
            );

            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }

            res.json(room);
        } catch (error) {
            console.error('Error updating room:', error);
            res.status(500).json({ message: 'Failed to update room' });
        }
    });

    // Delete room
    router.delete('/rooms/:id', verifyAdmin, async (req, res) => {
        try {
            const room = await Room.findByIdAndDelete(req.params.id);
            
            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }

            // Notify all connected clients that the room was deleted
            io.emit('room deleted', { roomId: req.params.id, roomCode: room.roomCode });

            res.json({ message: 'Room deleted successfully' });
        } catch (error) {
            console.error('Error deleting room:', error);
            res.status(500).json({ message: 'Failed to delete room' });
        }
    });

    // Get system logs (basic implementation)
    router.get('/logs', verifyAdmin, (req, res) => {
        try {
            // This is a simple implementation
            // In production, you'd want to read from actual log files
            const logs = [
                `[${new Date().toISOString()}] INFO: Admin panel accessed by ${req.user.username}`,
                `[${new Date(Date.now() - 60000).toISOString()}] INFO: Server running normally`,
                `[${new Date(Date.now() - 120000).toISOString()}] INFO: Database connection healthy`
            ];

            res.json({ logs: logs.join('\n') });
        } catch (error) {
            console.error('Error fetching logs:', error);
            res.status(500).json({ message: 'Failed to fetch logs' });
        }
    });

    return router;
};

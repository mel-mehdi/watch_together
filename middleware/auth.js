const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access token required' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token - user not found' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid or expired token' 
        });
    }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ 
            success: false, 
            message: 'Admin access required' 
        });
    }
    next();
};

// Socket.io authentication middleware
const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        
        // Allow connection without token (for guest users)
        if (!token) {
            console.log('Guest user connecting without token');
            socket.user = null; // Mark as guest user
            return next();
        }

        // Verify token for authenticated users
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            console.log('Token provided but user not found, allowing as guest');
            socket.user = null;
            return next();
        }

        // Update user online status for authenticated users
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        socket.user = user;
        console.log('Authenticated user connected:', user.username);
        next();
    } catch (error) {
        console.error('Socket authentication error:', error);
        // Don't reject connection, allow as guest
        socket.user = null;
        next();
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    authenticateSocket
};

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const router = express.Router();

// Configure nodemailer (you'll need to set up email credentials)
const transporter = nodemailer.createTransport({
    // For development, you can use services like Ethereal Email for testing
    // In production, use a real email service like Gmail, SendGrid, etc.
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'test@ethereal.email',
        pass: process.env.EMAIL_PASS || 'test123'
    }
});

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'Please provide username, email, and password' 
            });
        }

        if (username.length < 3) {
            return res.status(400).json({ 
                error: 'Username must be at least 3 characters long' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'Password must be at least 6 characters long' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingUser) {
            return res.status(400).json({ 
                error: 'User with this email or username already exists' 
            });
        }

        // Create new user
        const user = new User({ username, email, password });
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET || 'fallback-secret-key',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                avatar: user.getAvatarInitials()
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Server error during registration' 
        });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Please provide username and password' 
            });
        }

        // Find user by username
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ 
                error: 'Invalid credentials' 
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ 
                error: 'Invalid credentials' 
            });
        }

        // Update last seen and online status
        user.lastSeen = new Date();
        user.isOnline = true;
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET || 'fallback-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                avatar: user.getAvatarInitials(),
                preferences: user.preferences
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Server error during login' 
        });
    }
});

// Logout user
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
            const user = await User.findById(decoded.userId);
            
            if (user) {
                user.isOnline = false;
                user.lastSeen = new Date();
                await user.save();
            }
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.json({ success: true, message: 'Logged out successfully' });
    }
});

// Get current user profile
router.get('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                avatar: user.getAvatarInitials(),
                preferences: user.preferences,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Invalid token' 
        });
    }
});

// Update user preferences
router.put('/preferences', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const { theme, notifications } = req.body;
        
        if (theme) user.preferences.theme = theme;
        if (typeof notifications === 'boolean') user.preferences.notifications = notifications;

        await user.save();

        res.json({
            success: true,
            message: 'Preferences updated successfully',
            preferences: user.preferences
        });

    } catch (error) {
        console.error('Preferences update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating preferences' 
        });
    }
});

// Request password reset
router.post('/request-reset', async (req, res) => {
    try {
        const { usernameOrEmail } = req.body;

        if (!usernameOrEmail) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide username or email' 
            });
        }

        // Find user by username or email
        const user = await User.findOne({
            $or: [
                { username: usernameOrEmail },
                { email: usernameOrEmail }
            ]
        });

        if (!user) {
            // Don't reveal if user exists or not for security
            return res.json({
                success: true,
                message: 'If an account with that username or email exists, you will receive a password reset link.'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetTokenExpiry;
        await user.save();

        // Send email (in production, you'd want proper email templates)
        const resetURL = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
        
        const mailOptions = {
            to: user.email,
            from: process.env.FROM_EMAIL || 'noreply@watchtogether.com',
            subject: 'Password Reset - Watch Together',
            html: `
                <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #7c3aed; font-size: 28px; margin: 0;">🎬 Watch Together</h1>
                        <p style="color: #64748b; margin: 10px 0 0 0;">Password Reset Request</p>
                    </div>
                    
                    <div style="background: #f8fafc; border-radius: 12px; padding: 30px; margin: 20px 0;">
                        <h2 style="color: #1e293b; margin: 0 0 15px 0;">Reset Your Password</h2>
                        <p style="color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
                            Hello <strong>${user.username}</strong>,<br><br>
                            You requested a password reset for your Watch Together account. 
                            Click the button below to reset your password:
                        </p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetURL}" style="background: linear-gradient(135deg, #7c3aed, #06b6d4); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Reset Password</a>
                        </div>
                        
                        <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0;">
                            This link will expire in 1 hour. If you didn't request this reset, you can safely ignore this email.
                        </p>
                    </div>
                    
                    <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 20px;">
                        <p>Watch Together - Share videos and chat with friends</p>
                    </div>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('Email send error:', emailError);
            // Don't fail the request if email fails
        }

        res.json({
            success: true,
            message: 'If an account with that username or email exists, you will receive a password reset link.'
        });

    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error processing password reset request' 
        });
    }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token and new password are required' 
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters long' 
            });
        }

        // Find user with valid reset token
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired reset token' 
            });
        }

        // Update password and clear reset token
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error resetting password' 
        });
    }
});

module.exports = router;

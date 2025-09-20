const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const router = express.Router();

// Configure nodemailer (email credentials are optional for development)
let transporter = null;

// Only create transporter if email credentials are properly configured
if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    console.log('Email configuration found. Password reset via email is enabled.');
} else {
    console.log('Email configuration not found. Password reset via email will be disabled.');
}

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
            $or: [
                { username: username },
                { email: email }
            ]
        });

        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ 
                    error: 'Username already exists' 
                });
            } else {
                return res.status(400).json({ 
                    error: 'Email already registered' 
                });
            }
        }

        // Create new user
        const user = new User({
            username,
            email,
            password // Will be hashed by the pre-save middleware
        });

        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
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
        const { usernameOrEmail, password } = req.body;

        if (!usernameOrEmail || !password) {
            return res.status(400).json({ 
                error: 'Please provide username/email and password' 
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
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }

        // Check password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '7d' }
        );

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Server error during login' 
        });
    }
});

// Get current user profile
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Verify token endpoint
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token is required' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        res.json({
            success: true,
            valid: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        res.status(401).json({ 
            success: false, 
            valid: false, 
            message: 'Invalid token' 
        });
    }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Generate new token
        const newToken = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token: newToken,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Logout (optional - mainly for clearing session data)
router.post('/logout', (req, res) => {
    // Since we're using JWT, logout is mainly handled client-side
    // But we can clear any session data here if needed
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
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
        const resetURL = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;
        
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
            if (transporter) {
                await transporter.sendMail(mailOptions);
                console.log(`Password reset email sent to ${user.email}`);
            } else {
                console.log(`Password reset requested for ${user.username}, but email is not configured. Reset URL: ${resetURL}`);
            }
        } catch (emailError) {
            console.error('Email send error:', emailError);
            // Don't fail the request if email fails
        }

        res.json({
            success: true,
            message: !transporter 
                ? 'Password reset requested. Since email is not configured, check the server console for the reset link.'
                : 'If an account with that username or email exists, you will receive a password reset link.'
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

        // Update password
        user.password = newPassword; // Will be hashed by pre-save middleware
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({
            success: true,
            message: 'Password has been successfully reset. You can now login with your new password.'
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

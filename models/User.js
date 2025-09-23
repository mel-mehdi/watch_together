const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  email: {
    type: String,
    unique: true,
    sparse: true, // Allow null values but enforce uniqueness when present
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    minlength: 6
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  provider: {
    type: String,
    default: 'local',
    enum: ['local', 'google']
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  avatar: {
    type: String,
    default: ''
  },
  recentRooms: [{
    roomCode: String,
    name: String,
    description: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  preferences: {
    theme: {
      type: String,
      default: 'dark',
      enum: ['dark', 'light']
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save validation: email and password required only for non-guest users
userSchema.pre('validate', function(next) {
  if (!this.isGuest && this.provider === 'local' && !this.email) {
    this.invalidate('email', 'Email is required for registered users');
  }
  if (!this.isGuest && this.provider === 'local' && !this.password) {
    this.invalidate('password', 'Password is required for registered users');
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate avatar initials
userSchema.methods.getAvatarInitials = function() {
  return this.username.substring(0, 2).toUpperCase();
};

module.exports = mongoose.model('User', userSchema);
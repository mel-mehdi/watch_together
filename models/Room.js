const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    length: 8
  },
  password: {
    type: String,
    default: null
  },
  currentVideo: {
    url: {
      type: String,
      default: ''
    },
    title: {
      type: String,
      default: ''
    },
    type: {
      type: String,
      default: 'unknown'
    }
  },
  videoState: {
    playing: {
      type: Boolean,
      default: false
    },
    currentTime: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  adminUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  inviteCode: {
    type: String,
    unique: true,
    sparse: true // Allow null values but enforce uniqueness when present
  },
  inviteExpires: {
    type: Date
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  maxUsers: {
    type: Number,
    default: 50
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Room', roomSchema);
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  username: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  isSystemMessage: {
    type: Boolean,
    default: false
  },
  // One entry per person per emoji; reacting again with the same emoji removes it
  reactions: [{
    _id: false,
    emoji: { type: String, required: true },
    username: { type: String, required: true }
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);
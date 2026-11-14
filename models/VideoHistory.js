const mongoose = require('mongoose');

const videoHistorySchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  url: {
    type: String,
    required: true
  },
  // Filled from the provider's public oEmbed lookup (YouTube, Vimeo, Dailymotion)
  title: String,
  author: String,
  thumbnail: String,
  type: String,
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  addedByUsername: String,
  watchedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('VideoHistory', videoHistorySchema);
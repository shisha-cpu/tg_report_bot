const mongoose = require('mongoose');

// Report schema
const reportSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  cleaners: {
    type: String,
    required: true
  },
  helpers: {
    type: String,
    required: true
  },
  payments: {
    type: String,
    required: true
  },
  malfunctions: {
    type: String,
    required: true
  },
  readyForRent: {
    type: Boolean,
    required: true
  },
  objectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Object'
  }
});

module.exports = mongoose.model('Report', reportSchema);
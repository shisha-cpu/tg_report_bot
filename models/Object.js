const mongoose = require('mongoose');

// Object schema
const objectSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: false
  }
});

module.exports = mongoose.model('Object', objectSchema);
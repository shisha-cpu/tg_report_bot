const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Using the connection string you provided
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://admin:wwwwww@cluster0.weppimj.mongodb.net/tgOtchet?retryWrites=true&w=majority&appName=Cluster0');
    console.log('DB connected');
  } catch (err) {
    console.log('DB connection error', err);
  }
};

module.exports = connectDB;
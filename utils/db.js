const mongoose = require('mongoose');
const connection = {};

async function connect() {
  if (connection.isConnected) {
    console.log('Already connected to MongoDB.');
    return;
  }

  try {
    const opts = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };
    const mongoConnect = await mongoose.connect(process.env.MONGODB_URI, opts);
    console.log('Successfully connected to MongoDB!');
    connection.isConnected = mongoConnect.connections[0].readyState;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    throw error; // Re-throw error for proper handling
  }
}

async function disconnect() {
  if (connection.isConnected) {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    connection.isConnected = 0;
  }
}

const Connection = mongoose.connection;
const db = { connect, disconnect, Connection };
module.exports = db;


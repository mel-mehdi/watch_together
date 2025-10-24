const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // Timeout after 10s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            bufferCommands: false, // Disable mongoose buffering
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Wait for the connection to be fully ready
        if (mongoose.connection.readyState !== 1) {
            await new Promise((resolve, reject) => {
                mongoose.connection.once('open', resolve);
                mongoose.connection.once('error', reject);
            });
        }
        
        console.log(`MongoDB connection state: ${mongoose.connection.readyState} (1 = connected)`);
        return conn;
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        throw error; // Re-throw to handle in the calling function
    }
};

module.exports = connectDB;
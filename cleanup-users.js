const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function cleanupUsers() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find all users with null or undefined email
        const usersWithNullEmail = await User.find({ 
            $or: [
                { email: null }, 
                { email: { $exists: false } }
            ]
        });

        console.log(`Found ${usersWithNullEmail.length} users with null/missing email`);

        // Delete users with null emails (they're likely duplicates from the error)
        const deleteResult = await User.deleteMany({ 
            $or: [
                { email: null }, 
                { email: { $exists: false } }
            ]
        });

        console.log(`Deleted ${deleteResult.deletedCount} users with null/missing email`);

        // Check remaining users
        const remainingUsers = await User.find();
        console.log(`Remaining users: ${remainingUsers.length}`);
        
        remainingUsers.forEach(user => {
            console.log(`- ${user.username} (${user.email || 'no email'}) - Guest: ${user.isGuest}`);
        });

        await mongoose.disconnect();
        console.log('Cleanup completed');
    } catch (error) {
        console.error('Cleanup error:', error);
        process.exit(1);
    }
}

cleanupUsers();

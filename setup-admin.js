// Admin Setup Script
// Run this script to create an admin user or promote existing user to admin

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

// Connect to database
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://172.21.103.111:27017/watch-together');
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
};

// Create admin user
const createAdminUser = async () => {
    try {
        console.log('🛠️ Setting up admin user...');
        
        // Admin user details
        const adminData = {
            username: 'admin',
            email: 'admin@watchtogether.com',
            password: 'admin123', // Change this to a secure password
            isAdmin: true,
            isGuest: false
        };
        
        // Check if admin user already exists
        const existingAdmin = await User.findOne({ 
            $or: [
                { username: adminData.username },
                { email: adminData.email },
                { isAdmin: true }
            ]
        });
        
        if (existingAdmin) {
            if (existingAdmin.isAdmin) {
                console.log('✅ Admin user already exists:');
                console.log(`   Username: ${existingAdmin.username}`);
                console.log(`   Email: ${existingAdmin.email}`);
                console.log('');
                console.log('🔑 Login credentials:');
                console.log(`   Username: ${existingAdmin.username}`);
                console.log(`   Password: [Use existing password]`);
                return;
            } else {
                // Promote existing user to admin
                existingAdmin.isAdmin = true;
                await existingAdmin.save();
                console.log(`✅ User '${existingAdmin.username}' promoted to admin!`);
                console.log('');
                console.log('🔑 Login credentials:');
                console.log(`   Username: ${existingAdmin.username}`);
                console.log(`   Password: [Use existing password]`);
                return;
            }
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminData.password, salt);
        
        // Create new admin user
        const adminUser = new User({
            ...adminData,
            password: hashedPassword
        });
        
        await adminUser.save();
        
        console.log('✅ Admin user created successfully!');
        console.log('');
        console.log('🔑 Login credentials:');
        console.log(`   Username: ${adminData.username}`);
        console.log(`   Email: ${adminData.email}`);
        console.log(`   Password: ${adminData.password}`);
        console.log('');
        console.log('🌐 Access URLs:');
        console.log('   Login: http://172.21.103.111:3000/login.html');
        console.log('   Admin Panel: http://172.21.103.111:3000/admin');
        console.log('');
        console.log('⚠️  IMPORTANT: Change the default password after first login!');
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
    }
};

// Main function
const main = async () => {
    await connectDB();
    await createAdminUser();
    
    console.log('');
    console.log('🚀 Setup complete! You can now:');
    console.log('   1. Login at: http://172.21.103.111:3000/login.html');
    console.log('   2. Access admin panel at: http://172.21.103.111:3000/admin');
    console.log('');
    
    process.exit(0);
};

// Run the script
main().catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
});

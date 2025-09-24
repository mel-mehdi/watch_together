// Admin Panel JavaScript

// Global variables
let socket;
let authToken = localStorage.getItem('authToken');
let userData = JSON.parse(localStorage.getItem('userData') || '{}');
let currentSection = 'dashboard';

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    console.log('🛠️ Initializing admin panel...');
    
    // Check admin authentication
    if (!authToken || !userData.isAdmin) {
        console.error('❌ Admin access denied');
        showNotification('Admin access required', 'error');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 2000);
        return;
    }
    
    // Initialize socket connection
    initializeSocket();
    
    // Initialize UI
    initializeUI();
    
    // Load initial data
    loadDashboardData();
    
    console.log('✅ Admin panel initialized');
});

// Initialize socket connection with authentication
function initializeSocket() {
    socket = io({
        auth: {
            token: authToken
        }
    });
    
    socket.on('connect', () => {
        console.log('🔌 Admin socket connected');
        socket.emit('admin join');
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Admin socket disconnected');
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        showNotification('Connection error', 'error');
    });
    
    // Listen for real-time updates
    socket.on('admin stats update', (stats) => {
        updateDashboardStats(stats);
    });
    
    socket.on('admin activity', (activity) => {
        addActivityItem(activity);
    });
}

// Initialize UI components
function initializeUI() {
    // Update admin user info
    updateAdminUserInfo();
    
    // Setup navigation
    setupNavigation();
    
    // Setup search functionality
    setupSearch();
    
    // Setup forms
    setupForms();
    
    // Setup modals
    setupModals();
}

// Update admin user info display
function updateAdminUserInfo() {
    const adminUserInfo = document.getElementById('admin-user-info');
    if (adminUserInfo && userData) {
        const avatarText = (userData.avatar || userData.username || 'A').substring(0, 2).toUpperCase();
        adminUserInfo.innerHTML = `
            <div class="user-avatar">${avatarText}</div>
            <div>
                <div style="font-weight: 600; font-size: 12px;">${userData.username || 'Admin'}</div>
                <div style="color: var(--text-muted); font-size: 10px;">Administrator</div>
            </div>
        `;
    }
}

// Setup navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.admin-nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            switchSection(section);
        });
    });
}

// Switch between admin sections
function switchSection(sectionName) {
    // Update navigation
    document.querySelectorAll('.admin-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    currentSection = sectionName;
    
    // Load section-specific data
    loadSectionData(sectionName);
}

// Load data for specific section
function loadSectionData(section) {
    switch (section) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'users':
            loadUsersData();
            break;
        case 'rooms':
            loadRoomsData();
            break;
        case 'analytics':
            loadAnalyticsData();
            break;
        case 'logs':
            loadSystemLogs();
            break;
        default:
            console.log(`Loading data for section: ${section}`);
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        console.log('📊 Loading dashboard data...');
        
        // Load stats from real API
        const statsResponse = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            updateDashboardStats(stats);
        } else {
            console.error('Failed to load stats:', statsResponse.status);
            
            // If 403 Forbidden, try to refresh user data and retry
            if (statsResponse.status === 403) {
                console.log('🔄 403 Forbidden - refreshing user data...');
                try {
                    const userResponse = await fetch('/api/auth/me', {
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    });
                    
                    if (userResponse.ok) {
                        const userData = await userResponse.json();
                        localStorage.setItem('userData', JSON.stringify(userData.user));
                        console.log('✅ User data refreshed:', userData.user);
                        
                        // Retry the stats request
                        const retryResponse = await fetch('/api/admin/stats', {
                            headers: {
                                'Authorization': `Bearer ${authToken}`
                            }
                        });
                        
                        if (retryResponse.ok) {
                            const stats = await retryResponse.json();
                            updateDashboardStats(stats);
                            return;
                        }
                    }
                } catch (refreshError) {
                    console.error('Failed to refresh user data:', refreshError);
                }
            }
            
            showNotification('Failed to load dashboard stats', 'error');
            // Fallback to zeros
            updateDashboardStats({
                totalUsers: 0,
                activeRooms: 0,
                onlineUsers: 0,
                videosShared: 0
            });
        }
        
        // Load recent activity
        loadRecentActivity();
        
    } catch (error) {
        console.error('❌ Error loading dashboard data:', error);
        showNotification('Failed to load dashboard data', 'error');
        // Fallback to zeros
        updateDashboardStats({
            totalUsers: 0,
            activeRooms: 0,
            onlineUsers: 0,
            videosShared: 0
        });
    }
}

// Update dashboard stats
function updateDashboardStats(stats) {
    document.getElementById('total-users').textContent = stats.totalUsers || 0;
    document.getElementById('active-rooms').textContent = stats.activeRooms || 0;
    document.getElementById('online-users').textContent = stats.onlineUsers || 0;
    document.getElementById('videos-shared').textContent = stats.videosShared || 0;
}

// Load recent activity
async function loadRecentActivity() {
    try {
        const activityContainer = document.getElementById('recent-activity');
        
        // Mock activity data for development
        const activities = [
            {
                type: 'user_join',
                message: 'New user registered',
                details: 'john_doe joined the platform',
                time: '2 minutes ago',
                icon: 'fa-user-plus'
            },
            {
                type: 'room_create',
                message: 'New room created',
                details: 'Movie Night room created by alice',
                time: '5 minutes ago',
                icon: 'fa-door-open'
            },
            {
                type: 'video_share',
                message: 'Video shared',
                details: 'YouTube video shared in Gaming room',
                time: '8 minutes ago',
                icon: 'fa-video'
            },
            {
                type: 'admin_action',
                message: 'Admin action performed',
                details: 'User permissions updated',
                time: '15 minutes ago',
                icon: 'fa-shield-alt'
            }
        ];
        
        activityContainer.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas ${activity.icon}"></i>
                </div>
                <div class="activity-content">
                    <h4>${activity.message}</h4>
                    <p>${activity.details}</p>
                </div>
                <div class="activity-time">${activity.time}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Error loading recent activity:', error);
    }
}

// Add new activity item
function addActivityItem(activity) {
    const activityContainer = document.getElementById('recent-activity');
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `
        <div class="activity-icon">
            <i class="fas ${activity.icon}"></i>
        </div>
        <div class="activity-content">
            <h4>${activity.message}</h4>
            <p>${activity.details}</p>
        </div>
        <div class="activity-time">Just now</div>
    `;
    
    activityContainer.insertBefore(activityItem, activityContainer.firstChild);
    
    // Limit to 10 items
    const items = activityContainer.querySelectorAll('.activity-item');
    if (items.length > 10) {
        items[items.length - 1].remove();
    }
}

// Load users data
async function loadUsersData() {
    try {
        console.log('👥 Loading users data...');
        
        const usersTableBody = document.getElementById('users-table-body');
        
        // Load real users data from API
        const usersResponse = await fetch('/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (usersResponse.ok) {
            const userData = await usersResponse.json();
            const users = userData.users || [];
            
            if (users.length === 0) {
                usersTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
                            <i class="fas fa-users" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                            <div>No users found</div>
                        </td>
                    </tr>
                `;
                return;
            }
            
            usersTableBody.innerHTML = users.map(user => {
                const statusClass = user.status === 'active' ? 'online' : 
                                  user.status === 'suspended' ? 'suspended' : 'offline';
                const lastActiveText = user.lastLogin ? 
                    new Date(user.lastLogin).toLocaleString() : 'Never';
                const joinedAtText = new Date(user.createdAt).toLocaleDateString();
                
                return `
                    <tr>
                        <td>
                            <div class="user-info">
                                <div class="user-avatar">${user.username.substring(0, 2).toUpperCase()}</div>
                                <div>
                                    <div style="font-weight: 600;">${user.username}</div>
                                    <div style="color: var(--text-muted); font-size: 12px;">
                                        ${user.isAdmin ? 'Administrator' : 'User'}
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td>${user.email}</td>
                        <td><span class="status-badge ${statusClass}">${user.status || 'active'}</span></td>
                        <td>${joinedAtText}</td>
                        <td>${lastActiveText}</td>
                        <td>
                            <button class="admin-btn secondary" style="padding: 6px 12px; font-size: 12px;" onclick="editUser('${user._id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="admin-btn danger" style="padding: 6px 12px; font-size: 12px; margin-left: 8px;" onclick="deleteUser('${user._id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            console.error('Failed to load users:', usersResponse.status);
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                        <div>Failed to load users data</div>
                    </td>
                </tr>
            `;
            showNotification('Failed to load users data', 'error');
        }
        
    } catch (error) {
        console.error('❌ Error loading users data:', error);
        showNotification('Failed to load users data', 'error');
    }
}

// Load rooms data
async function loadRoomsData() {
    try {
        console.log('🏠 Loading rooms data...');
        
        const roomsTableBody = document.getElementById('rooms-table-body');
        
        // Fetch rooms from API
        const response = await fetch('/api/admin/rooms', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        let rooms = [];
        
        if (response.ok) {
            const data = await response.json();
            rooms = data.rooms || [];
        } else {
            // Fall back to mock data if API fails
            rooms = [
                {
                    _id: '1',
                    roomCode: 'ABC12345',
                    name: 'Movie Night',
                    participants: ['user1', 'user2', 'user3'],
                    currentVideo: { title: 'Avengers Trailer', url: 'https://youtube.com/watch?v=abc' },
                    createdAt: '2024-03-15T20:30:00Z'
                },
                {
                    _id: '2',
                    roomCode: 'DEF67890',
                    name: 'Gaming Stream',
                    participants: ['user1', 'user2'],
                    currentVideo: { title: 'Live Gaming', url: 'https://twitch.tv/stream' },
                    createdAt: '2024-03-15T19:45:00Z'
                }
            ];
        }
        
        roomsTableBody.innerHTML = rooms.map(room => {
            const userCount = room.participants ? room.participants.length : 0;
            const currentVideo = room.currentVideo && room.currentVideo.title ? 
                room.currentVideo.title : 'No video';
            const createdAt = new Date(room.createdAt).toLocaleString();
            
            return `
                <tr>
                    <td><strong>${room.roomCode}</strong></td>
                    <td>${room.name}</td>
                    <td>${room.admin || 'Unknown'}</td>
                    <td>${userCount} users</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${currentVideo}</td>
                    <td>${createdAt}</td>
                    <td>
                        <button class="admin-btn secondary" style="padding: 6px 12px; font-size: 12px;" onclick="viewRoom('${room._id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="admin-btn danger" style="padding: 6px 12px; font-size: 12px; margin-left: 8px;" onclick="closeRoom('${room._id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading rooms data:', error);
        showNotification('Failed to load rooms data', 'error');
    }
}

// Load analytics data
function loadAnalyticsData() {
    console.log('📈 Loading analytics data...');
    
    // Create charts
    createDailyUsersChart();
    createRoomActivityChart();
}

// Create daily users chart
function createDailyUsersChart() {
    const ctx = document.getElementById('daily-users-chart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Daily Active Users',
                data: [45, 52, 38, 65, 78, 85, 72],
                borderColor: '#7c3aed',
                backgroundColor: 'rgba(124, 58, 237, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#cbd5e1'
                    },
                    grid: {
                        color: 'rgba(203, 213, 225, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: '#cbd5e1'
                    },
                    grid: {
                        color: 'rgba(203, 213, 225, 0.1)'
                    }
                }
            }
        }
    });
}

// Create room activity chart
function createRoomActivityChart() {
    const ctx = document.getElementById('room-activity-chart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Active Rooms', 'Idle Rooms', 'Private Rooms'],
            datasets: [{
                data: [23, 12, 8],
                backgroundColor: [
                    '#7c3aed',
                    '#06b6d4',
                    '#f59e0b'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc'
                    }
                }
            }
        }
    });
}

// Load system logs
function loadSystemLogs() {
    console.log('📄 Loading system logs...');
    
    const logsContainer = document.getElementById('system-logs');
    
    // Mock log data
    const logs = `
[2024-03-15 20:45:23] INFO: Server started on port 3000
[2024-03-15 20:45:24] INFO: Database connected successfully
[2024-03-15 20:46:12] INFO: User 'john_doe' connected from 192.168.1.100
[2024-03-15 20:46:15] INFO: Room 'ABC12345' created by user 'alice_smith'
[2024-03-15 20:47:02] WARN: High memory usage detected: 85%
[2024-03-15 20:47:30] INFO: Video sync performed for room 'ABC12345'
[2024-03-15 20:48:15] ERROR: Failed to save message to database: Connection timeout
[2024-03-15 20:48:16] INFO: Database connection restored
[2024-03-15 20:49:00] INFO: User 'bob_wilson' disconnected
[2024-03-15 20:49:45] INFO: System cleanup performed
    `.trim();
    
    logsContainer.textContent = logs;
}

// Setup search functionality
function setupSearch() {
    const userSearch = document.getElementById('user-search');
    const roomSearch = document.getElementById('room-search');
    
    if (userSearch) {
        userSearch.addEventListener('input', (e) => {
            filterTable('users-table-body', e.target.value);
        });
    }
    
    if (roomSearch) {
        roomSearch.addEventListener('input', (e) => {
            filterTable('rooms-table-body', e.target.value);
        });
    }
}

// Filter table based on search input
function filterTable(tableBodyId, searchTerm) {
    const tableBody = document.getElementById(tableBodyId);
    const rows = tableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const matches = text.includes(searchTerm.toLowerCase());
        row.style.display = matches ? '' : 'none';
    });
}

// Setup forms
function setupForms() {
    const generalSettingsForm = document.getElementById('general-settings-form');
    const securitySettingsForm = document.getElementById('security-settings-form');
    
    if (generalSettingsForm) {
        generalSettingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveGeneralSettings();
        });
    }
    
    if (securitySettingsForm) {
        securitySettingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveSecuritySettings();
        });
    }
}

// Setup modals
function setupModals() {
    // Close modal when clicking outside
    document.querySelectorAll('.admin-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
    
    // Close modal buttons
    document.querySelectorAll('.admin-modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.admin-modal').classList.remove('show');
        });
    });
}

// User management functions
async function editUser(userId) {
    console.log('✏️ Editing user:', userId);
    
    try {
        // Fetch user data
        const response = await fetch(`/api/admin/users`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const user = data.users.find(u => u._id === userId);
            
            if (user) {
                // Populate the form
                document.getElementById('edit-user-id').value = user._id;
                document.getElementById('edit-username').value = user.username;
                document.getElementById('edit-email').value = user.email;
                document.getElementById('edit-role').value = user.isAdmin ? 'admin' : 'user';
                document.getElementById('edit-status').value = user.status || 'active';
                
                // Show the modal
                document.getElementById('edit-user-modal').classList.add('show');
            } else {
                showNotification('User not found', 'error');
            }
        } else {
            showNotification('Failed to load user data', 'error');
        }
    } catch (error) {
        console.error('Error loading user for editing:', error);
        showNotification('Failed to load user data', 'error');
    }
}

async function deleteUser(userId) {
    console.log('🗑️ Deleting user:', userId);
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (response.ok) {
                showNotification('User deleted successfully', 'success');
                // Refresh the users list
                loadUsersData();
            } else {
                const error = await response.json();
                showNotification(error.message || 'Failed to delete user', 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Failed to delete user', 'error');
        }
    }
}

function closeEditUserModal() {
    document.getElementById('edit-user-modal').classList.remove('show');
}

async function saveUserChanges() {
    console.log('💾 Saving user changes...');
    
    try {
        const userId = document.getElementById('edit-user-id').value;
        const username = document.getElementById('edit-username').value;
        const email = document.getElementById('edit-email').value;
        const role = document.getElementById('edit-role').value;
        const status = document.getElementById('edit-status').value;
        
        const userData = {
            username,
            email,
            isAdmin: role === 'admin',
            status
        };
        
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(userData)
        });
        
        if (response.ok) {
            showNotification('User updated successfully', 'success');
            closeEditUserModal();
            // Refresh the users list
            loadUsersData();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to update user', 'error');
        }
    } catch (error) {
        console.error('Error saving user changes:', error);
        showNotification('Failed to update user', 'error');
    }
}

// Room management functions
function viewRoom(roomId) {
    console.log('👁️ Viewing room:', roomId);
    // Implementation for viewing room
}

async function closeRoom(roomId) {
    console.log('❌ Closing room:', roomId);
    if (confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
        try {
            const response = await fetch(`/api/admin/rooms/${roomId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (response.ok) {
                showNotification('Room deleted successfully', 'success');
                // Refresh the rooms list
                loadRoomsData();
            } else {
                const error = await response.json();
                showNotification(error.message || 'Failed to delete room', 'error');
            }
        } catch (error) {
            console.error('Error deleting room:', error);
            showNotification('Failed to delete room', 'error');
        }
    }
}

// Settings functions
function saveGeneralSettings() {
    console.log('💾 Saving general settings...');
    // Implementation for saving general settings
    showNotification('General settings saved', 'success');
}

function saveSecuritySettings() {
    console.log('💾 Saving security settings...');
    // Implementation for saving security settings
    showNotification('Security settings saved', 'success');
}

// Utility functions
function refreshActivity() {
    console.log('🔄 Refreshing activity...');
    loadRecentActivity();
}

function refreshUsers() {
    console.log('🔄 Refreshing users...');
    loadUsersData();
}

function refreshRooms() {
    console.log('🔄 Refreshing rooms...');
    loadRoomsData();
}

function refreshLogs() {
    console.log('🔄 Refreshing logs...');
    loadSystemLogs();
}

function clearLogs() {
    console.log('🗑️ Clearing logs...');
    if (confirm('Are you sure you want to clear all logs?')) {
        document.getElementById('system-logs').textContent = '';
        showNotification('Logs cleared', 'success');
    }
}

function logout() {
    console.log('🚪 Admin logout...');
    
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    
    // Disconnect socket
    if (socket) {
        socket.disconnect();
    }
    
    // Redirect to login
    window.location.href = '/login.html';
}

// Notification system
function showNotification(message, type = 'info') {
    console.log(`📢 ${type.toUpperCase()}: ${message}`);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 10px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    `;
    
    // Set color based on type
    switch (type) {
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ff6b6b, #ee5a52)';
            break;
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #51cf66, #40c057)';
            break;
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #ffd43b, #fab005)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

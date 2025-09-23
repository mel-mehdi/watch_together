// Simple authentication handler for home page
(function() {
    // Check for OAuth token in URL first (from Google OAuth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    
    if (urlToken) {
        console.log('🔑 Found OAuth token in URL, storing it...');
        localStorage.setItem('authToken', urlToken);
        
        // Fetch user data with the new token
        fetchUserDataFromToken(urlToken).then(() => {
            // Remove token from URL for security/cleanliness
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
            
            // Continue with normal auth flow
            initializeUserInterface();
        }).catch(error => {
            console.error('Failed to fetch user data from OAuth token:', error);
            // Clear invalid token and continue
            localStorage.removeItem('authToken');
            initializeUserInterface();
        });
    } else {
        // Continue with normal auth flow
        initializeUserInterface();
    }
    
    async function fetchUserDataFromToken(token) {
        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('userData', JSON.stringify(data.user));
                console.log('✅ User data fetched and stored:', data.user.username);
            } else {
                throw new Error('Failed to fetch user data');
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            throw error;
        }
    }
    
    function updateHeaderForAuthenticatedUser(user) {
        // Find the login button and replace it with user info
        const loginBtn = document.querySelector('.login-btn');
        const navLinks = document.querySelector('.nav-links');
        
        if (loginBtn && navLinks) {
            // Remove the login button
            loginBtn.remove();
            
            // Create user info container
            const userInfo = document.createElement('div');
            userInfo.className = 'user-info';
            userInfo.innerHTML = `
                <div class="user-menu">
                    <span class="username">
                        <i class="fas fa-user-circle"></i>
                        ${user.username}
                    </span>
                    <button class="logout-btn" id="logout-btn">
                        <i class="fas fa-sign-out-alt"></i>
                        Logout
                    </button>
                </div>
            `;
            
            // Add styles for the user info
            const style = document.createElement('style');
            style.textContent = `
                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .user-menu {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 8px 16px;
                    border-radius: 25px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                
                .username {
                    color: white;
                    font-weight: 500;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .username i {
                    font-size: 16px;
                    color: #06b6d4;
                }
                
                .logout-btn {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 15px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .logout-btn:hover {
                    background: linear-gradient(135deg, #dc2626, #b91c1c);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
                }
                
                .logout-btn i {
                    font-size: 12px;
                }
                
                @media (max-width: 768px) {
                    .user-menu {
                        padding: 6px 12px;
                        gap: 8px;
                    }
                    
                    .username {
                        font-size: 13px;
                    }
                    
                    .logout-btn {
                        padding: 5px 10px;
                        font-size: 12px;
                    }
                }
            `;
            document.head.appendChild(style);
            
            // Add the user info to the nav
            navLinks.appendChild(userInfo);
            
            // Add logout functionality
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', handleLogout);
            }
        }
    }

    function handleLogout() {
        // Clear local storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('guestMode');
        
        // Show a brief loading message
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
            logoutBtn.disabled = true;
        }
        
        // Redirect to login page after a short delay
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1000);
    }
    
    function initializeUserInterface() {
        // Check if user is authenticated when page loads
        const authToken = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');
        
        if (authToken && userData) {
            try {
                const currentUser = JSON.parse(userData);
                console.log('User is authenticated:', currentUser.username);
                
                // Replace login button with user info
                updateHeaderForAuthenticatedUser(currentUser);
                
                // Function to auto-fill username fields
                function autoFillUsername() {
                const usernameFields = [
                    document.getElementById('username-create'),
                    document.getElementById('username-join')
                ];
                
                usernameFields.forEach(field => {
                    if (field) {
                        field.value = currentUser.username;
                        field.readOnly = true;
                        field.style.backgroundColor = '#f5f5f5';
                        field.style.cursor = 'not-allowed';
                        field.style.opacity = '0.8';
                        
                        // Add a note that the field is auto-filled
                        if (!field.parentNode.querySelector('.auth-note')) {
                            const note = document.createElement('small');
                            note.className = 'auth-note';
                            note.style.color = '#10b981';
                            note.style.fontSize = '12px';
                            note.style.marginTop = '4px';
                            note.style.display = 'block';
                            note.textContent = '✓ Using your logged-in username';
                            field.parentNode.appendChild(note);
                        }
                    }
                });
            }
            
            // Auto-fill when create room modal is shown
            const createRoomBtn = document.getElementById('create-room-btn');
            if (createRoomBtn) {
                createRoomBtn.addEventListener('click', () => {
                    setTimeout(autoFillUsername, 100); // Small delay to ensure modal is rendered
                });
            }
            
            // Auto-fill when join room modal is shown
            const joinRoomBtn = document.getElementById('join-room-btn');
            if (joinRoomBtn) {
                joinRoomBtn.addEventListener('click', () => {
                    setTimeout(autoFillUsername, 100);
                });
            }                // Also auto-fill if fields are already present
                document.addEventListener('DOMContentLoaded', autoFillUsername);
                
            } catch (error) {
                console.error('Error parsing user data:', error);
            }
        }
    }
    
    // This function is already defined above with better styling
    // Remove this duplicate
})();

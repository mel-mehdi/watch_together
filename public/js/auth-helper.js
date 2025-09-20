// Simple authentication handler for home page
(function() {
    // Check if user is authenticated when page loads
    const authToken = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    
    if (authToken && userData) {
        try {
            const currentUser = JSON.parse(userData);
            console.log('User is authenticated:', currentUser.username);
            
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
            }
            
            // Also auto-fill if fields are already present
            document.addEventListener('DOMContentLoaded', autoFillUsername);
            
            // Show user status in header
            const navLinks = document.querySelector('.nav-links');
            if (navLinks && !navLinks.querySelector('.user-status')) {
                const userStatus = document.createElement('span');
                userStatus.className = 'user-status';
                userStatus.style.cssText = 'color: #10b981; font-weight: 600; font-size: 14px; margin-left: 20px;';
                userStatus.innerHTML = `👤 ${currentUser.username}`;
                navLinks.appendChild(userStatus);
            }
            
        } catch (error) {
            console.error('Error parsing user data:', error);
        }
    }
})();

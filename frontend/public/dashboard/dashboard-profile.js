/**
 * Dashboard Profile Module
 * Handles user profile, username updates, and password changes
 */

// Note: closeModal function is defined in dashboard-core.js

/**
 * Show profile modal
 */
async function showProfileModal() {
    try {
        const response = await fetch(`${API_BASE_URL}/users/profile/by-username/${currentUser.username}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load profile');
        }

        const user = data.user;

        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Profile</h2>
                    <button class="modal-close" onclick="closeModal()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- Unique ID Section -->
                    <div class="modal-form-group">
                        <label>Your Unique ID</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" id="profileUniqueId" value="${user.unique_id || 'N/A'}" readonly 
                                style="background: var(--bg-tertiary); color: var(--text-secondary); cursor: default; flex: 1; font-family: monospace; font-size: 1rem;">
                            <button class="btn btn-secondary" onclick="copyUniqueId()" title="Copy ID" style="padding: 0.5rem 0.75rem;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                                    <path d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5" stroke="currentColor" stroke-width="2"/>
                                </svg>
                            </button>
                        </div>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">This is your permanent identifier and cannot be changed.</p>
                    </div>

                    <!-- Username Section -->
                    <div class="modal-form-group">
                        <label for="profileUsername">Username</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" id="profileUsername" value="${user.username}" style="flex: 1;">
                            <button class="btn btn-primary" onclick="updateUsername()" style="padding: 0.5rem 0.75rem;">Save</button>
                        </div>
                    </div>

                    <div id="profileMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;"></div>

                    <hr style="border: none; border-top: 1px solid var(--border-color); margin: 1.5rem 0;">

                    <!-- Change Password Section -->
                    <h3 style="margin-bottom: 1rem; font-size: 1rem;">Change Password</h3>
                    <div class="modal-form-group">
                        <label for="currentPassword">Current Password</label>
                        <input type="password" id="currentPassword" placeholder="Enter current password">
                    </div>
                    <div class="modal-form-group">
                        <label for="newPassword">New Password</label>
                        <input type="password" id="newPassword" placeholder="Enter new password">
                    </div>
                    <div class="modal-form-group">
                        <label for="confirmNewPassword">Confirm New Password</label>
                        <input type="password" id="confirmNewPassword" placeholder="Confirm new password">
                    </div>
                    <div id="passwordMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;"></div>
                    <button class="btn btn-primary" onclick="changePassword()" style="width: 100%;">Change Password</button>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Failed to load profile: ' + error.message);
    }
}

/**
 * Copy unique ID to clipboard
 */
function copyUniqueId() {
    const uniqueId = document.getElementById('profileUniqueId').value;
    navigator.clipboard.writeText(uniqueId).then(() => {
        const btn = event.target.closest('button');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        setTimeout(() => {
            btn.innerHTML = originalHTML;
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

/**
 * Update username
 */
async function updateUsername() {
    const newUsername = document.getElementById('profileUsername').value.trim();
    const messageDiv = document.getElementById('profileMessage');

    if (!newUsername) {
        messageDiv.textContent = 'Username cannot be empty.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    if (newUsername === currentUser.username) {
        messageDiv.textContent = 'Username is the same as current.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/profile/${currentUser.username}/username`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update username');
        }

        currentUser.username = newUsername;
        localStorage.setItem('user', JSON.stringify(currentUser));
        sessionStorage.setItem('username', newUsername);

        // Update displayed username in header
        const userSpan = document.getElementById('currentUser');
        if (userSpan) userSpan.textContent = newUsername;

        messageDiv.textContent = 'Username updated successfully!';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        messageDiv.style.color = 'var(--success)';

    } catch (error) {
        console.error('Error updating username:', error);
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
    }
}

/**
 * Change password
 */
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const messageDiv = document.getElementById('passwordMessage');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        messageDiv.textContent = 'All password fields are required.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    if (newPassword !== confirmNewPassword) {
        messageDiv.textContent = 'New passwords do not match.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    if (newPassword.length < 6) {
        messageDiv.textContent = 'New password must be at least 6 characters.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/profile/${currentUser.username}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword: currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to change password');
        }

        messageDiv.textContent = 'Password changed successfully!';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        messageDiv.style.color = 'var(--success)';

        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';

    } catch (error) {
        console.error('Error changing password:', error);
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
    }
}

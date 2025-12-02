// API Configuration
const API_BASE_URL = 'http://localhost:3001/api';

// DOM Elements
const signupUsername = document.getElementById('signupUsername');
const signupEmail = document.getElementById('signupEmail');
const signupPassword = document.getElementById('signupPassword');
const signupPasswordConfirm = document.getElementById('signupPasswordConfirm');
const signupBtn = document.getElementById('signupBtn');

// Event Listeners
signupBtn.addEventListener('click', handleSignup);

// Handle Enter key on inputs
[signupUsername, signupEmail, signupPassword, signupPasswordConfirm].forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSignup();
    });
});

/**
 * Handle signup process
 */
async function handleSignup() {
    const username = signupUsername.value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    const passwordConfirm = signupPasswordConfirm.value;
    const errorDiv = document.getElementById('signupError');

    // Clear previous error
    errorDiv.style.display = 'none';

    // Validation
    if (!username || !email || !password || !passwordConfirm) {
        showError('Please fill in all fields');
        return;
    }

    if (username.length < 3) {
        showError('Username must be at least 3 characters long');
        return;
    }

    if (!isValidEmail(email)) {
        showError('Please enter a valid email address');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }

    if (password !== passwordConfirm) {
        showError('Passwords do not match');
        return;
    }

    signupBtn.disabled = true;
    signupBtn.textContent = 'Creating Account...';

    try {
        const response = await fetch(`${API_BASE_URL}/users/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                username,
                email,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Signup failed');
        }

        if (data.success) {
            // Store session
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('username', data.user.username);
            sessionStorage.setItem('sessionToken', data.session);
            sessionStorage.setItem('currentTab', 'about'); // Set default tab to About
            
            // Clear form
            signupUsername.value = '';
            signupEmail.value = '';
            signupPassword.value = '';
            signupPasswordConfirm.value = '';
            
            // Redirect to dashboard with About tab
            window.location.href = '/dashboard?tab=about';
        } else {
            throw new Error('Signup failed');
        }
    } catch (error) {
        showError('Signup failed: ' + error.message);
        signupBtn.disabled = false;
        signupBtn.textContent = 'Create Account';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('signupError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

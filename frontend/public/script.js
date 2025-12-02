// API Configuration
const API_BASE_URL = 'http://localhost:3001/api';

// State management
let currentUser = null;
let allProposals = [];
let currentFilter = 'home';

// DOM Elements - Login
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');

// DOM Elements - Main App
const currentUserSpan = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');
const proposalsList = document.getElementById('proposalsList');
const petitionSection = document.getElementById('petitionSection');
const petitionList = document.getElementById('petitionList');

// Event Listeners - Login
loginBtn.addEventListener('click', handleLogin);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// Event Listeners - Main App
logoutBtn.addEventListener('click', logout);

// Event Listeners - Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        const filter = e.target.dataset.filter;
        filterProposals(filter);
    });
});

// Initialize collapsible sections
document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
        header.classList.toggle('active');
        const content = document.getElementById(header.dataset.target);
        content.classList.toggle('active');
    });
});

// Check if user is already logged in on page load
window.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const username = sessionStorage.getItem('username');
    
    if (isLoggedIn === 'true' && username) {
        currentUser = { username: username };
        showMainApp();
        loadProposals();
    }
});

// Initialize collapsible sections

/**
 * Login function
 */
async function handleLogin() {
    const identifier = usernameInput.value.trim();
    const password = passwordInput.value;
    const errorDiv = document.getElementById('loginError');

    // Clear previous error
    errorDiv.style.display = 'none';

    if (!identifier || !password) {
        showError('Please enter both username/email and password');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                identifier,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(data.error || 'Login failed. Please check your credentials.');
            return;
        }

        if (data.success) {
            currentUser = data.user;
            // Store session
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('username', data.user.username);
            sessionStorage.setItem('sessionToken', data.session);
            sessionStorage.setItem('currentTab', 'about'); // Set default tab to About
            
            // Clear form
            usernameInput.value = '';
            passwordInput.value = '';
            
            // Redirect to dashboard page with About tab
            window.location.href = '/dashboard?tab=about';
        } else {
            showError('Login failed. Please check your credentials.');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Unable to connect to server. Please try again.');
    }
}

/**
 * Show error message on login page
 */
function showError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * Logout function
 */
function logout() {
    currentUser = null;
    allProposals = [];
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('sessionToken');
    loginScreen.style.display = 'flex';
    mainApp.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
}

/**
 * Show main app after login
 */
function showMainApp() {
    loginScreen.style.display = 'none';
    mainApp.style.display = 'block';
    currentUserSpan.textContent = currentUser.username;
    
    // Store logged-in state
    sessionStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('username', currentUser.username);
}

/**
 * Set login loading state
/**
 * Load proposals list
 */
async function loadProposals() {
    proposalsList.innerHTML = `
        <div class="loader-container">
            <div class="loader"></div>
            <p>Loading proposals...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/proposals`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load proposals');
        }

        if (data.success) {
            displayProposals(data.proposals);
            allProposals = data.proposals;
            filterProposals(currentFilter);
        } else {
            throw new Error('No proposals found');
        }
    } catch (error) {
        proposalsList.innerHTML = `
            <div class="result-card">
                <h3>Error</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

/**
 * Filter proposals by current tab
 */
function filterProposals(filter) {
    currentFilter = filter;
    
    if (filter === 'petition') {
        // Show petition section, hide proposals list
        proposalsList.parentElement.style.display = 'none';
        petitionSection.style.display = 'block';
        displayPetitionProposals();
    } else {
        // Show proposals list, hide petition section
        proposalsList.parentElement.style.display = 'block';
        petitionSection.style.display = 'none';
        
        const today = new Date();
        const filtered = allProposals.filter(p => {
            const decisionDate = p.decision_date ? new Date(p.decision_date) : null;
            if (filter === 'home') {
                return !decisionDate || decisionDate >= today;
            } else if (filter === 'past') {
                return decisionDate && decisionDate < today;
            }
            return false;
        });
        displayProposals(filtered);
    }
}

/**
 * Display petition proposals (pending proposals only)
 */
function displayPetitionProposals() {
    const today = new Date();
    const pendingProposals = allProposals.filter(p => {
        const decisionDate = p.decision_date ? new Date(p.decision_date) : null;
        return !decisionDate || decisionDate >= today;
    });
    
    if (!pendingProposals || pendingProposals.length === 0) {
        petitionList.innerHTML = `
            <div class="result-card">
                <p>No pending proposals available for petition</p>
            </div>
        `;
        return;
    }

    petitionList.innerHTML = '';

    pendingProposals.forEach(proposal => {
        const card = document.createElement('div');
        card.className = 'proposal-card';
        card.onclick = () => window.location.href = `/proposal/${proposal.id}?mode=petition`;

        card.innerHTML = `
            <h3>${proposal.title}</h3>
            <div class="proposal-meta">
                <span class="status-badge pending">PETITION</span>
                ${proposal.decision_date ? `<span>Decision: ${proposal.decision_date}</span>` : ''}
            </div>
        `;

        petitionList.appendChild(card);
    });
}

/**
 * Display proposals list
 */
function displayProposals(proposals) {
    if (!proposals || proposals.length === 0) {
        proposalsList.innerHTML = `
            <div class="result-card">
                <p>No proposals available</p>
            </div>
        `;
        return;
    }

    proposalsList.innerHTML = '';

    proposals.forEach(proposal => {
        const card = document.createElement('div');
        card.className = 'proposal-card';
        card.onclick = () => window.location.href = `/proposal/${proposal.id}`;

        card.innerHTML = `
            <h3>${proposal.title}</h3>
            <div class="proposal-meta">
                <span class="status-badge ${proposal.status || 'pending'}">${(proposal.status || 'pending').toUpperCase()}</span>
                ${proposal.decision_date ? `<span>Decision: ${proposal.decision_date}</span>` : ''}
            </div>
        `;

        proposalsList.appendChild(card);
    });
}

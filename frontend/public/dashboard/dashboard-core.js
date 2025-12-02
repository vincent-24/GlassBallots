/**
 * Dashboard Core Module
 * Handles initialization, state management, event listeners, theme, and URL routing
 */

// API Configuration
const API_BASE_URL = 'http://localhost:3001/api';

// State management
let currentUser = null;
let allProposals = [];
let currentFilter = 'home';
let searchQuery = '';
let sortOrder = 'recent';
const CACHE_KEY = 'proposalAnalysisCache';

// User proposals state (for voted/bookmarked/petitioned views)
let currentUserProposalView = null;
let currentUserProposals = [];

// Debounce timer for search
let searchDebounceTimer = null;

// Routing - flag to prevent duplicate navigation
let isNavigating = false;

// DOM Elements - Will be initialized after DOM loads
let currentUserSpan;
let logoutBtn;
let proposalsList;
let petitionSection;
let petitionList;
let aboutSection;
let searchInput;
let clearSearchBtn;
let menuBtn;
let filterMenu;
let closeMenuBtn;
let profileBtn;
let profileMenu;
let themeToggle;

/**
 * URL Router - updates browser URL and handles navigation
 */
function navigateTo(path, state = {}, replace = false) {
    const fullPath = path.startsWith('/dashboard') ? path : `/dashboard${path ? '/' + path : ''}`;
    
    if (replace) {
        window.history.replaceState(state, '', fullPath);
    } else {
        window.history.pushState(state, '', fullPath);
    }
    
    // Scroll to top on navigation
    window.scrollTo(0, 0);
}

/**
 * Parse current URL and return route info
 */
function parseRoute() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    
    // /dashboard or /dashboard/
    if (parts.length === 1 && parts[0] === 'dashboard') {
        return { type: 'tab', tab: 'home' };
    }
    
    // /dashboard/:tab
    if (parts.length === 2 && parts[0] === 'dashboard') {
        const tab = parts[1];
        // Check if it's a valid tab
        if (['home', 'past', 'petition', 'about', 'search', 'organizations', 'profile'].includes(tab)) {
            return { type: 'tab', tab };
        }
        // Check for user views
        if (['voted', 'bookmarked', 'petitioned'].includes(tab)) {
            return { type: 'userView', view: tab };
        }
    }
    
    // /dashboard/organization/:orgId
    if (parts.length === 3 && parts[0] === 'dashboard' && parts[1] === 'organization') {
        const orgId = parseInt(parts[2]);
        if (!isNaN(orgId)) {
            return { type: 'organization', orgId };
        }
    }
    
    // Default to home
    return { type: 'tab', tab: 'home' };
}

/**
 * Handle route based on current URL
 */
function handleRoute(isPopState = false) {
    if (isNavigating) return;
    isNavigating = true;
    
    const route = parseRoute();
    console.log('Handling route:', route);
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    // Clear active tabs first
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    switch (route.type) {
        case 'tab':
            // Activate the correct tab
            document.querySelectorAll('.tab').forEach(t => {
                if (t.dataset.filter === route.tab) {
                    t.classList.add('active');
                }
            });
            
            currentFilter = route.tab;
            sessionStorage.setItem('currentTab', route.tab);
            sessionStorage.removeItem('currentOrgContext');
            
            if (route.tab === 'about' || route.tab === 'search') {
                filterProposals(route.tab);
            } else if (route.tab === 'organizations') {
                if (typeof showMyOrganizations === 'function') {
                    showMyOrganizations(true); // skipUrlUpdate = true for popstate
                }
            } else if (route.tab === 'profile') {
                if (typeof showProfileSettings === 'function') {
                    showProfileSettings();
                }
            } else {
                loadProposals();
            }
            break;
            
        case 'userView':
            if (typeof showUserProposals === 'function') {
                loadProposals().then(() => {
                    showUserProposals(route.view);
                });
            }
            break;
            
        case 'organization':
            if (typeof showOrganizationDetails === 'function') {
                showOrganizationDetails(route.orgId, true); // skipUrlUpdate = true for popstate
            }
            break;
    }
    
    setTimeout(() => { isNavigating = false; }, 100);
}

// Initialize immediately or when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}

function initializeDashboard() {
    console.log('Initializing dashboard...');
    
    // Get DOM elements
    currentUserSpan = document.getElementById('currentUser');
    logoutBtn = document.getElementById('logoutBtn');
    proposalsList = document.getElementById('proposalsList');
    petitionSection = document.getElementById('petitionSection');
    petitionList = document.getElementById('petitionList');
    aboutSection = document.getElementById('aboutSection');
    searchInput = document.getElementById('searchInput');
    clearSearchBtn = document.getElementById('clearSearch');
    menuBtn = document.getElementById('menuBtn');
    filterMenu = document.getElementById('filterMenu');
    closeMenuBtn = document.getElementById('closeMenu');
    profileBtn = document.getElementById('profileBtn');
    profileMenu = document.getElementById('profileMenu');
    themeToggle = document.getElementById('themeToggle');

    if (!searchInput) {
        console.error('Search input not found! Retrying...');
        setTimeout(initializeDashboard, 100);
        return;
    }

    // Check if user is logged in
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const username = sessionStorage.getItem('username');

    if (!isLoggedIn || !username) {
        window.location.href = '/';
        return;
    }

    currentUser = { username: username };
    currentUserSpan.textContent = username;
    
    // Initialize theme from localStorage
    initializeTheme();
    
    // Setup event listeners first
    setupEventListeners();
    computePrincipleOffsets();
    
    // Setup browser back/forward button handler
    window.addEventListener('popstate', (event) => {
        handleRoute(true);
    });
    
    // Handle initial route based on URL
    handleRoute();
}

/**
 * Compute principle card offsets for About layout
 */
function computePrincipleOffsets() {
    try {
        const firstImageContainer = document.querySelector('.about-principles .principle-card:nth-child(1) .principle-image-container');
        if (!firstImageContainer) return;

        const rect = firstImageContainer.getBoundingClientRect();
        const height = Math.round(rect.height);
        const overlap = Math.round(height / 2);

        document.documentElement.style.setProperty('--principle-overlap', `${overlap}px`);
    } catch (err) {
        console.warn('computePrincipleOffsets failed:', err);
    }
}

// Recompute offsets when images load or window resizes
window.addEventListener('resize', () => computePrincipleOffsets());
window.addEventListener('load', () => computePrincipleOffsets());

const aboutObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
        if (m.type === 'childList' || m.type === 'attributes') {
            computePrincipleOffsets();
            break;
        }
    }
});
const aboutRoot = document.getElementById('aboutSection');
if (aboutRoot) {
    aboutObserver.observe(aboutRoot, { childList: true, subtree: true, attributes: true });
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Logout
    logoutBtn.addEventListener('click', logout);

    // Profile dropdown toggle
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = profileMenu.classList.contains('active');
        profileMenu.classList.toggle('active');
        profileBtn.classList.toggle('active');
        
        if (!isActive) {
            filterMenu.style.display = 'none';
            menuBtn.classList.remove('active');
        }
    });

    // Profile menu item handlers
    document.getElementById('viewVotedProposals').addEventListener('click', () => {
        closeProfileMenu();
        navigateTo('voted');
        showUserProposals('voted');
    });

    document.getElementById('viewBookmarkedProposals').addEventListener('click', () => {
        closeProfileMenu();
        navigateTo('bookmarked');
        showUserProposals('bookmarked');
    });

    document.getElementById('viewPetitionedProposals').addEventListener('click', () => {
        closeProfileMenu();
        navigateTo('petitioned');
        showUserProposals('petitioned');
    });

    document.getElementById('viewProfile').addEventListener('click', () => {
        closeProfileMenu();
        showProfileModal();
    });

    document.getElementById('viewMyOrganizations').addEventListener('click', () => {
        closeProfileMenu();
        navigateTo('organizations');
        showMyOrganizations();
    });

    document.getElementById('createNewOrganization').addEventListener('click', () => {
        closeProfileMenu();
        showCreateOrganizationModal();
    });

    // Theme toggle
    themeToggle.addEventListener('change', () => {
        toggleTheme();
    });

    // Header title click - go to About
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        headerTitle.addEventListener('click', () => {
            navigateTo('about');
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            sessionStorage.setItem('currentTab', 'about');
            filterProposals('about');
        });
    }

    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const filter = e.target.dataset.filter;
            
            // Update URL
            navigateTo(filter === 'home' ? '' : filter);
            
            sessionStorage.setItem('currentTab', filter);
            // Clear org context when switching to main tabs
            sessionStorage.removeItem('orgContext');
            
            // Special handling for non-proposal tabs
            if (filter === 'about' || filter === 'search') {
                filterProposals(filter);
            } else {
                // Reload proposals when switching between home/past/petition tabs
                // since the server filters by date
                currentFilter = filter;
                loadProposals();
            }
        });
    });

    // Real-time search
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
        // Use debounced server-side search
        debounceSearch();
    });

    // Clear search button
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
        loadProposals(); // Reload without search query
    });

    // Organization filter dropdown
    const orgFilter = document.getElementById('orgFilter');
    if (orgFilter) {
        orgFilter.addEventListener('change', () => {
            if (typeof handleOrgFilterChange === 'function') {
                handleOrgFilterChange();
            }
        });
    }

    // Menu button
    menuBtn.addEventListener('click', () => {
        const isVisible = filterMenu.style.display !== 'none';
        filterMenu.style.display = isVisible ? 'none' : 'block';
        menuBtn.classList.toggle('active', !isVisible);
        
        if (!isVisible) {
            closeProfileMenu();
        }
    });

    // Close menu button
    closeMenuBtn.addEventListener('click', () => {
        filterMenu.style.display = 'none';
        menuBtn.classList.remove('active');
    });

    // Sort order radio buttons
    document.querySelectorAll('input[name="sortOrder"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            sortOrder = e.target.value;
            filterProposals(currentFilter);
        });
    });

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!filterMenu.contains(e.target) && !menuBtn.contains(e.target)) {
            if (filterMenu.style.display !== 'none') {
                filterMenu.style.display = 'none';
                menuBtn.classList.remove('active');
            }
        }
        
        if (!profileMenu.contains(e.target) && !profileBtn.contains(e.target)) {
            closeProfileMenu();
        }
    });

    // Sticky nav-tabs with scroll effect
    const navTabs = document.querySelector('.nav-tabs');
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > 50) {
            navTabs.classList.add('scrolled');
        } else {
            navTabs.classList.remove('scrolled');
        }
    });
}

/**
 * Debounce search to avoid too many API calls
 */
function debounceSearch() {
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
        loadProposals();
    }, 300);
}

/**
 * Close profile menu helper
 */
function closeProfileMenu() {
    profileMenu.classList.remove('active');
    profileBtn.classList.remove('active');
}

/**
 * Initialize theme from localStorage
 */
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.checked = savedTheme === 'light';
    updateThemeIcon(savedTheme);
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

/**
 * Update theme icon based on current theme
 */
function updateThemeIcon(theme) {
    const themeIcon = document.getElementById('themeIcon');
    const themeLabel = themeIcon.parentElement.querySelector('span');
    
    if (theme === 'light') {
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        themeLabel.textContent = 'Dark Mode';
    } else {
        themeIcon.innerHTML = '<path d="M12 3V4M12 20V21M4 12H3M6.31412 6.31412L5.5 5.5M17.6859 6.31412L18.5 5.5M6.31412 17.69L5.5 18.5M17.6859 17.69L18.5 18.5M21 12H20M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        themeLabel.textContent = 'Light Mode';
    }
}

/**
 * Logout function
 */
function logout() {
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('username');
    window.location.href = '/';
}

/**
 * Return to home view
 */
function returnToHome() {
    currentUserProposalView = null;
    currentUserProposals = [];
    sessionStorage.removeItem('proposalViewSource');
    
    // Update URL
    navigateTo('');
    
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        if (t.dataset.filter === 'home') {
            t.classList.add('active');
        }
    });
    sessionStorage.setItem('currentTab', 'home');
    currentFilter = 'home';
    
    // Hide other sections and show proposals
    petitionSection.style.display = 'none';
    aboutSection.style.display = 'none';
    const searchSection = document.getElementById('searchSection');
    if (searchSection) searchSection.style.display = 'none';
    proposalsList.parentElement.style.display = 'block';
    
    const navRight = document.querySelector('.nav-right');
    if (navRight) navRight.style.display = 'flex';
    
    // Reload proposals from API
    loadProposals();
}

/**
 * Close modal helper
 */
function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show brief success indication
        const tooltip = document.createElement('div');
        tooltip.className = 'copy-tooltip';
        tooltip.textContent = 'Copied!';
        tooltip.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--success); color: white; padding: 0.5rem 1rem; border-radius: 8px; z-index: 10000; animation: fadeInUp 0.3s ease;';
        document.body.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

/**
 * Chain Visualization Animation
 * Creates an animated blockchain visualization that builds blocks until full, then resets
 */
let chainAnimationInterval = null;
let chainBlocks = [];
const BLOCK_WIDTH = 60;
const LINK_WIDTH = 30;
const BLOCK_DELAY = 1500; // Time between blocks in ms
const MAX_BLOCKS = 5; // Fixed max blocks to prevent clipping

function initChainVisualization() {
    const container = document.getElementById('chainVisualization');
    if (!container) return;
    
    // Clear any existing animation
    if (chainAnimationInterval) {
        clearInterval(chainAnimationInterval);
    }
    
    // Reset container
    container.innerHTML = '';
    chainBlocks = [];
    
    // Add first block immediately
    addBlock(container, true);
    
    // Start animation interval
    chainAnimationInterval = setInterval(() => {
        if (chainBlocks.length >= MAX_BLOCKS) {
            // Reset the chain
            resetChainVisualization(container);
        } else {
            addBlock(container, true);
        }
    }, BLOCK_DELAY);
}

function addBlock(container, isNew = false) {
    // If not the first block, add a link first
    if (chainBlocks.length > 0) {
        const link = document.createElement('div');
        link.className = 'chain-link';
        link.style.opacity = '0';
        link.style.transform = 'scaleX(0)';
        container.appendChild(link);
        
        // Animate link appearing
        requestAnimationFrame(() => {
            link.style.transition = 'all 0.3s ease';
            link.style.opacity = '1';
            link.style.transform = 'scaleX(1)';
        });
        
        // Remove active/generating state from previous block
        const prevBlock = chainBlocks[chainBlocks.length - 1];
        if (prevBlock) {
            prevBlock.classList.remove('generating');
            prevBlock.classList.add('confirmed');
        }
    }
    
    // Create new block
    const block = document.createElement('div');
    block.className = 'chain-block' + (isNew ? ' generating' : '');
    block.style.opacity = '0';
    block.style.transform = 'scale(0.5)';
    container.appendChild(block);
    chainBlocks.push(block);
    
    // Animate block appearing
    requestAnimationFrame(() => {
        block.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        block.style.opacity = '1';
        block.style.transform = 'scale(1)';
    });
}

function resetChainVisualization(container) {
    // Fade out all elements
    const elements = container.children;
    for (let el of elements) {
        el.style.transition = 'opacity 0.5s ease';
        el.style.opacity = '0';
    }
    
    // Clear and restart after fade out
    setTimeout(() => {
        container.innerHTML = '';
        chainBlocks = [];
        addBlock(container, true);
    }, 500);
}

/**
 * AI Typing Visualization
 * Creates a typewriter effect that simulates LLM text generation
 */
let aiTypingInterval = null;
let aiTypingTimeout = null;
const AI_PROMPTS = [
    "This proposal aims to improve community engagement through transparent voting mechanisms...",
    "Based on analysis, the key points include: increased participation, reduced costs, and enhanced security...",
    "The proposal addresses concerns about accessibility while maintaining robust verification standards..."
];
let currentPromptIndex = 0;
let currentCharIndex = 0;

function initAiTypingVisualization() {
    const container = document.getElementById('aiTypingVisualization');
    if (!container) return;
    
    const textSpan = container.querySelector('.ai-typing-text');
    if (!textSpan) return;
    
    // Clear any existing animation
    if (aiTypingInterval) clearInterval(aiTypingInterval);
    if (aiTypingTimeout) clearTimeout(aiTypingTimeout);
    
    // Reset
    textSpan.textContent = '';
    currentCharIndex = 0;
    
    // Start typing after a brief pause (cursor blinks first)
    aiTypingTimeout = setTimeout(() => {
        startTyping(textSpan);
    }, 1500);
}

function startTyping(textSpan) {
    const currentPrompt = AI_PROMPTS[currentPromptIndex];
    
    aiTypingInterval = setInterval(() => {
        if (currentCharIndex < currentPrompt.length) {
            textSpan.textContent += currentPrompt[currentCharIndex];
            currentCharIndex++;
        } else {
            // Done typing, wait then reset
            clearInterval(aiTypingInterval);
            aiTypingTimeout = setTimeout(() => {
                // Fade out effect
                textSpan.style.transition = 'opacity 0.5s ease';
                textSpan.style.opacity = '0';
                
                setTimeout(() => {
                    textSpan.textContent = '';
                    textSpan.style.opacity = '1';
                    currentCharIndex = 0;
                    currentPromptIndex = (currentPromptIndex + 1) % AI_PROMPTS.length;
                    
                    // Start next prompt after cursor blink
                    aiTypingTimeout = setTimeout(() => {
                        startTyping(textSpan);
                    }, 1500);
                }, 500);
            }, 2000);
        }
    }, 35); // Typing speed - 35ms per character
}

// Start chain visualization when About section is shown
function startVisualizationsIfVisible() {
    const aboutSection = document.getElementById('aboutSection');
    if (aboutSection && aboutSection.style.display !== 'none') {
        initChainVisualization();
        initAiTypingVisualization();
    }
}

// Hook into the showAbout function if it exists, otherwise observe
const originalShowAbout = window.showAbout;
window.showAbout = function() {
    if (originalShowAbout) originalShowAbout();
    setTimeout(() => {
        initChainVisualization();
        initAiTypingVisualization();
    }, 100);
};

// Also start when page loads if About is visible
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(startVisualizationsIfVisible, 500);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (chainAnimationInterval) {
        clearInterval(chainAnimationInterval);
    }
    if (aiTypingInterval) {
        clearInterval(aiTypingInterval);
    }
    if (aiTypingTimeout) {
        clearTimeout(aiTypingTimeout);
    }
});

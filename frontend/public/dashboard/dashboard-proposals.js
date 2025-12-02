/**
 * Dashboard Proposals Module
 * Handles proposal loading, filtering, and display
 */

// Note: currentUserProposalView and currentUserProposals are declared in dashboard-core.js

// Pagination state
const PROPOSALS_PER_PAGE = 10;
let currentOffset = 0;
let hasMoreProposals = false;
let totalProposals = 0;
let userOrganizations = [];
let selectedOrgFilter = 'all';
let isLoadingMore = false;

/**
 * Load proposals list for current user's organizations
 */
async function loadProposals() {
    console.log('loadProposals() called');
    currentOffset = 0;
    allProposals = [];
    Templates.clearAndLoad(proposalsList, 'Loading proposals...');

    try {
        const username = currentUser?.username || sessionStorage.getItem('username');
        if (!username) {
            throw new Error('Please log in to view proposals');
        }
        
        // Determine filter type based on currentFilter
        let filterType = 'all';
        if (currentFilter === 'home') {
            filterType = 'upcoming';
        } else if (currentFilter === 'past') {
            filterType = 'past';
        } else if (currentFilter === 'petition') {
            filterType = 'upcoming'; // Petitions only for upcoming proposals
        }
        
        const params = new URLSearchParams({
            limit: PROPOSALS_PER_PAGE,
            offset: 0,
            filter: filterType,
            organization_id: selectedOrgFilter
        });
        
        if (searchQuery) {
            params.append('search', searchQuery);
        }
        
        const response = await fetch(`${API_BASE_URL}/proposals/user/${username}?${params}`);
        
        // Handle 404 specifically - likely means user has no organizations
        if (response.status === 404) {
            const data = await response.json();
            if (data.error === 'User not found') {
                throw new Error('User not found. Please log in again.');
            }
            // Treat as no organizations
            allProposals = [];
            hasMoreProposals = false;
            totalProposals = 0;
            userOrganizations = [];
            populateOrgFilterDropdown();
            filterProposals(currentFilter);
            return;
        }
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load proposals');
        }

        if (data.success) {
            allProposals = data.proposals || [];
            hasMoreProposals = data.hasMore || false;
            totalProposals = data.total || 0;
            currentOffset = (data.proposals || []).length;
            
            // Store user organizations for filter dropdown
            if (data.userOrganizations) {
                userOrganizations = data.userOrganizations;
                populateOrgFilterDropdown();
            }
            
            filterProposals(currentFilter);
        } else {
            // No proposals is not an error
            allProposals = [];
            hasMoreProposals = false;
            totalProposals = 0;
            filterProposals(currentFilter);
        }
    } catch (error) {
        console.error('Error loading proposals:', error);
        // Show a user-friendly message
        proposalsList.innerHTML = '';
        const emptyState = Templates.createEmptyState(
            'Join an organization to see proposals',
            'Use the Search tab to find and join organizations.'
        );
        if (emptyState) {
            proposalsList.appendChild(emptyState);
        }
    }
}

/**
 * Load more proposals (pagination)
 */
async function loadMoreProposals() {
    if (isLoadingMore || !hasMoreProposals) return;
    
    isLoadingMore = true;
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
    }
    
    try {
        const username = currentUser?.username || sessionStorage.getItem('username');
        if (!username) {
            throw new Error('Please log in to view proposals');
        }
        
        let filterType = 'all';
        if (currentFilter === 'home') {
            filterType = 'upcoming';
        } else if (currentFilter === 'past') {
            filterType = 'past';
        } else if (currentFilter === 'petition') {
            filterType = 'upcoming';
        }
        
        const params = new URLSearchParams({
            limit: PROPOSALS_PER_PAGE,
            offset: currentOffset,
            filter: filterType,
            organization_id: selectedOrgFilter
        });
        
        if (searchQuery) {
            params.append('search', searchQuery);
        }
        
        const response = await fetch(`${API_BASE_URL}/proposals/user/${username}?${params}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load more proposals');
        }
        
        if (data.success && data.proposals.length > 0) {
            allProposals = [...allProposals, ...data.proposals];
            hasMoreProposals = data.hasMore;
            currentOffset += data.proposals.length;
            
            // Re-render the current view
            if (currentFilter === 'petition') {
                displayPetitionProposals();
            } else {
                displayProposals(allProposals);
            }
        }
        
    } catch (error) {
        console.error('Error loading more proposals:', error);
    } finally {
        isLoadingMore = false;
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Load More';
        }
    }
}

/**
 * Populate organization filter dropdown
 */
function populateOrgFilterDropdown() {
    const orgFilterSelect = document.getElementById('orgFilter');
    if (!orgFilterSelect) return;
    
    // Clear existing options except "All Organizations"
    orgFilterSelect.innerHTML = '<option value="all">All Organizations</option>';
    
    // Add user's organizations
    userOrganizations.forEach(org => {
        const option = document.createElement('option');
        option.value = org.id;
        option.textContent = org.name;
        if (org.role === 'owner') {
            option.textContent += ' (Owner)';
        }
        orgFilterSelect.appendChild(option);
    });
    
    // Set current selection
    orgFilterSelect.value = selectedOrgFilter;
}

/**
 * Filter proposals by current tab
 */
function filterProposals(filter) {
    currentFilter = filter;
    
    // Scroll to top when switching tabs/pages (instant)
    window.scrollTo(0, 0);
    
    const navRight = document.querySelector('.nav-right');
    
    if (filter === 'about') {
        proposalsList.parentElement.style.display = 'none';
        petitionSection.style.display = 'none';
        aboutSection.style.display = 'none';
        const searchSection = document.getElementById('searchSection');
        if (searchSection) searchSection.style.display = 'none';
        aboutSection.style.display = 'block';
        if (navRight) navRight.style.display = 'none';
        // Start visualizations when About section is shown
        if (typeof initChainVisualization === 'function') initChainVisualization();
        if (typeof initAiTypingVisualization === 'function') initAiTypingVisualization();
        return;
    } else if (filter === 'search') {
        proposalsList.parentElement.style.display = 'none';
        petitionSection.style.display = 'none';
        aboutSection.style.display = 'none';
        const searchSection = document.getElementById('searchSection');
        if (searchSection) searchSection.style.display = 'block';
        if (navRight) navRight.style.display = 'none';
        setupOrganizationSearch();
        return;
    } else if (filter === 'petition') {
        proposalsList.parentElement.style.display = 'none';
        petitionSection.style.display = 'block';
        aboutSection.style.display = 'none';
        const searchSection = document.getElementById('searchSection');
        if (searchSection) searchSection.style.display = 'none';
        if (navRight) navRight.style.display = 'flex';
        displayPetitionProposals();
    } else {
        proposalsList.parentElement.style.display = 'block';
        petitionSection.style.display = 'none';
        aboutSection.style.display = 'none';
        const searchSection = document.getElementById('searchSection');
        if (searchSection) searchSection.style.display = 'none';
        if (navRight) navRight.style.display = 'flex';
        
        // Since we already filtered on the server side, just apply local sorting
        let filtered = [...allProposals];
        
        // Apply sort
        filtered.sort((a, b) => {
            const dateA = new Date(a.decision_date || '9999-12-31');
            const dateB = new Date(b.decision_date || '9999-12-31');
            
            if (sortOrder === 'recent') {
                return dateB - dateA;
            } else {
                return dateA - dateB;
            }
        });
        
        displayProposals(filtered);
    }
}

/**
 * Handle organization filter change
 */
function handleOrgFilterChange() {
    const orgFilterSelect = document.getElementById('orgFilter');
    if (orgFilterSelect) {
        selectedOrgFilter = orgFilterSelect.value;
        loadProposals(); // Reload with new filter
    }
}

/**
 * Handle search with server-side filtering
 */
function handleSearchChange() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchQuery = searchInput.value.toLowerCase().trim();
        loadProposals(); // Reload with search query
    }
}

/**
 * Display petition proposals (pending proposals only)
 */
function displayPetitionProposals() {
    // Server already filters for upcoming proposals, just apply local sorting
    let pendingProposals = [...allProposals];
    
    // Apply sort
    pendingProposals.sort((a, b) => {
        const dateA = new Date(a.decision_date || '9999-12-31');
        const dateB = new Date(b.decision_date || '9999-12-31');
        
        if (sortOrder === 'recent') {
            return dateB - dateA;
        } else {
            return dateA - dateB;
        }
    });
    
    if (!pendingProposals || pendingProposals.length === 0) {
        petitionList.innerHTML = '';
        const empty = Templates.createEmptyState(
            userOrganizations.length === 0 
                ? 'Join an organization to see proposals' 
                : 'No pending proposals available for petition'
        );
        if (empty) petitionList.appendChild(empty);
        return;
    }

    petitionList.innerHTML = '';
    
    Templates.renderList(
        petitionList,
        'tpl-petition-card',
        pendingProposals,
        (proposal) => ({
            'title': proposal.title,
            'organization': proposal.organization_name || proposal.creator || '',
            'decision-date': proposal.decision_date ? `Decision: ${proposal.decision_date}` : ''
        }),
        null,
        {
            animationDelay: 0.05,
            onClick: (proposal) => {
                sessionStorage.setItem('currentTab', 'petition');
                window.location.href = `/proposal/${proposal.id}?mode=petition&source=petition`;
            }
        }
    );
    
    // Add Load More button if there are more proposals
    renderLoadMoreButton(petitionList);
}

/**
 * Display proposals list
 */
function displayProposals(proposals, source = null) {
    // Use provided source or derive from currentFilter
    const navigationSource = source || currentFilter || 'home';
    
    if (!proposals || proposals.length === 0) {
        proposalsList.innerHTML = '';
        const emptyMessage = userOrganizations.length === 0 
            ? 'Join an organization to see proposals' 
            : 'No proposals available';
        const empty = Templates.createEmptyState(emptyMessage);
        if (empty) proposalsList.appendChild(empty);
        return;
    }

    proposalsList.innerHTML = '';

    // Render proposal cards directly into the grid container
    Templates.renderList(
        proposalsList,
        'tpl-proposal-card',
        proposals,
        (proposal) => {
            let statusClass = 'pending';
            let statusText = 'PENDING';
            
            if (currentFilter === 'past' && proposal.vote_status) {
                statusClass = proposal.vote_status;
                if (proposal.vote_status === 'approved') {
                    statusText = 'APPROVED';
                } else if (proposal.vote_status === 'denied') {
                    statusText = 'DENIED';
                } else if (proposal.vote_status === 'recast') {
                    statusText = 'RECAST';
                }
            } else {
                statusClass = proposal.status || 'pending';
                statusText = (proposal.status || 'pending').toUpperCase();
            }
            
            return {
                'title': proposal.title,
                'organization': proposal.organization_name || proposal.creator || '',
                'status': { text: statusText, class: `status-badge ${statusClass}` },
                'decision-date': proposal.decision_date ? `Decision: ${proposal.decision_date}` : ''
            };
        },
        null,
        {
            animationDelay: 0.05,
            onClick: (proposal) => {
                sessionStorage.setItem('currentTab', currentFilter);
                sessionStorage.removeItem('orgContext');
                window.location.href = `/proposal/${proposal.id}?source=${navigationSource}`;
            }
        }
    );
    
    // Add Load More button if there are more proposals
    renderLoadMoreButton(proposalsList);
}

/**
 * Render Load More button
 */
function renderLoadMoreButton(container) {
    // Remove existing load more button if any
    const existingBtn = document.getElementById('loadMoreBtn');
    if (existingBtn) existingBtn.remove();
    
    if (!hasMoreProposals) return;
    
    // Create a full-width container for the button that spans across all grid columns
    const loadMoreContainer = document.createElement('div');
    loadMoreContainer.id = 'loadMoreContainer';
    loadMoreContainer.style.cssText = 'grid-column: 1 / -1; display: flex; justify-content: center; padding: 2rem 0; margin-top: 1rem;';
    
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'loadMoreBtn';
    loadMoreBtn.className = 'btn btn-secondary';
    loadMoreBtn.style.cssText = 'padding: 0.875rem 2rem; font-size: 0.95rem;';
    loadMoreBtn.textContent = `Load More (${totalProposals - allProposals.length} remaining)`;
    loadMoreBtn.addEventListener('click', loadMoreProposals);
    
    loadMoreContainer.appendChild(loadMoreBtn);
    container.appendChild(loadMoreContainer);
}

/**
 * Show user's proposals (voted, bookmarked, or petitioned)
 */
async function showUserProposals(type) {
    sessionStorage.setItem('proposalViewSource', type);
    currentUserProposalView = type;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    petitionSection.style.display = 'none';
    aboutSection.style.display = 'none';
    const searchSection = document.getElementById('searchSection');
    if (searchSection) searchSection.style.display = 'none';
    proposalsList.parentElement.style.display = 'block';
    
    Templates.clearAndLoad(proposalsList, `Loading ${type} proposals...`);
    
    try {
        const response = await fetch(`${API_BASE_URL}/users/by-username/${currentUser.username}/${type}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `Failed to load ${type} proposals`);
        }
        
        if (data.success && data.proposals && data.proposals.length > 0) {
            currentUserProposals = data.proposals;
            displayUserProposals(data.proposals, type);
        } else {
            currentUserProposals = [];
            const emptyMessages = {
                voted: 'You haven\'t voted on any proposals yet.',
                bookmarked: 'You haven\'t bookmarked any proposals yet.',
                petitioned: 'You haven\'t submitted any petitions yet.'
            };
            
            proposalsList.innerHTML = '';
            const emptyCard = Templates.render('tpl-empty-state-with-back', {
                'message': emptyMessages[type]
            });
            
            if (emptyCard) {
                Templates.bindActions(emptyCard, { 'return-home': () => returnToHome() });
                proposalsList.appendChild(emptyCard);
            } else {
                // Fallback if template not found
                const empty = Templates.createEmptyState(emptyMessages[type]);
                if (empty) proposalsList.appendChild(empty);
            }
        }
    } catch (error) {
        console.error(`Error loading ${type} proposals:`, error);
        proposalsList.innerHTML = '';
        const errorCard = Templates.render('tpl-error-card', { 'message': error.message });
        if (errorCard) {
            Templates.bindActions(errorCard, { 'back': () => returnToHome() });
            proposalsList.appendChild(errorCard);
        }
    }
}

/**
 * Display user's proposals (voted, bookmarked, petitioned)
 */
function displayUserProposals(proposals, type) {
    const titles = {
        voted: 'Voted Proposals',
        bookmarked: 'Bookmarked Proposals',
        petitioned: 'My Petitions'
    };
    
    proposalsList.innerHTML = '';
    
    // Create header from template
    const header = Templates.render('tpl-user-proposals-header', {
        'title': titles[type],
        'count': `${proposals.length} proposal${proposals.length !== 1 ? 's' : ''}`
    });
    
    if (header) {
        // Set up the search input placeholder
        const searchInput = header.querySelector('#userProposalSearch');
        if (searchInput) {
            searchInput.placeholder = `Search ${type} proposals...`;
            searchInput.addEventListener('input', filterUserProposals);
        }
        
        // Set up sort change handler
        const sortSelect = header.querySelector('#userProposalSort');
        if (sortSelect) {
            sortSelect.addEventListener('change', filterUserProposals);
        }
        
        // Bind the back button action
        Templates.bindActions(header, {
            'return-home': () => returnToHome()
        });
        
        proposalsList.appendChild(header);
    }

    renderUserProposalCards(proposals, type);
}

/**
 * Render user proposal cards into the grid
 */
function renderUserProposalCards(proposals, type) {
    const grid = document.getElementById('userProposalsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';

    if (proposals.length === 0) {
        const noResults = document.createElement('p');
        noResults.style.cssText = 'color: var(--text-secondary); padding: 1rem;';
        noResults.textContent = 'No proposals match your search.';
        grid.appendChild(noResults);
        return;
    }

    Templates.renderList(
        grid,
        'tpl-user-proposal-card',
        proposals,
        (proposal) => {
            let statusText = '';
            let statusClass = '';
            
            if (type === 'voted' && proposal.user_vote !== undefined) {
                statusClass = proposal.user_vote ? 'approved' : 'denied';
                statusText = proposal.user_vote ? 'VOTED YES' : 'VOTED NO';
            } else if (type === 'bookmarked') {
                statusClass = 'bookmarked';
                statusText = 'BOOKMARKED';
            } else if (type === 'petitioned') {
                const isEdited = proposal.is_edited === 1;
                statusClass = 'petition';
                statusText = `PETITIONED${isEdited ? ' (edited)' : ''}`;
            }
            
            return {
                'title': proposal.title,
                'status': { text: statusText, class: `status-badge ${statusClass}` },
                'decision-date': proposal.decision_date ? `Decision: ${proposal.decision_date}` : ''
            };
        },
        null,
        {
            animationDelay: 0.05,
            onClick: (proposal) => {
                // Use currentUserProposalView to ensure we have the correct view context
                // This is more reliable than the closure-captured type parameter
                if (currentUserProposalView === 'petitioned') {
                    window.location.href = `/proposal/${proposal.id}?mode=view_petition`;
                } else {
                    // Pass the view source so back button works
                    window.location.href = `/proposal/${proposal.id}?source=${currentUserProposalView}`;
                }
            }
        }
    );
}

/**
 * Show full petition text in a modal
 */
function showFullPetitionModal(proposalId, petitionText) {
    // Remove any existing modal
    const existingModal = document.getElementById('petitionModal');
    if (existingModal) existingModal.remove();
    
    const modal = Templates.render('tpl-full-petition-modal', {
        'petition-text': petitionText || ''
    });
    
    if (!modal) {
        console.error('Could not create petition modal from template');
        return;
    }
    
    modal.id = 'petitionModal';
    
    // Bind close actions
    Templates.bindActions(modal, {
        'close': () => modal.remove()
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    document.body.appendChild(modal);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    return Templates.escapeHtml(text);
}

/**
 * Filter user proposals within current view (scoped filtering)
 */
function filterUserProposals() {
    if (!currentUserProposalView || currentUserProposals.length === 0) return;
    
    const searchInput = document.getElementById('userProposalSearch');
    const sortSelect = document.getElementById('userProposalSort');
    
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const order = sortSelect ? sortSelect.value : 'newest';
    
    let filtered = currentUserProposals.filter(proposal => {
        if (!query) return true;
        return proposal.title.toLowerCase().includes(query) ||
               (proposal.original_text && proposal.original_text.toLowerCase().includes(query));
    });
    
    filtered = [...filtered].sort((a, b) => {
        switch (order) {
            case 'oldest':
                return new Date(a.decision_date || 0) - new Date(b.decision_date || 0);
            case 'alpha':
                return a.title.localeCompare(b.title);
            case 'newest':
            default:
                return new Date(b.decision_date || 0) - new Date(a.decision_date || 0);
        }
    });
    
    renderUserProposalCards(filtered, currentUserProposalView);
}

/**
 * Navigate to petition mode for a proposal
 */
function goToPetition(proposalId) {
    window.location.href = `/proposal/${proposalId}?mode=petition`;
}

/**
 * Toggle bookmark status for a proposal
 */
async function toggleBookmark(proposalId, buttonElement) {
    const username = currentUser?.username || sessionStorage.getItem('username');
    if (!username) {
        alert('Please log in to bookmark proposals');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/by-username/${username}/bookmarks/${proposalId}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Failed to toggle bookmark');
        }

        const result = await response.json();
        
        if (buttonElement) {
            const svg = buttonElement.querySelector('svg path');
            if (result.bookmarked) {
                buttonElement.classList.add('bookmarked');
                svg.setAttribute('fill', 'currentColor');
            } else {
                buttonElement.classList.remove('bookmarked');
                svg.setAttribute('fill', 'none');
            }
        }
    } catch (error) {
        console.error('Error toggling bookmark:', error);
        alert('Failed to update bookmark');
    }
}

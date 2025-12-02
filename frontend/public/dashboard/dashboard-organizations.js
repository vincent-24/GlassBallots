/**
 * Dashboard Organizations Module
 * Handles organization search, join, create, and management
 */

let orgSearchSetup = false;
let currentOrgContext = null;

/**
 * Setup organization search event listeners
 */
function setupOrganizationSearch() {
    if (orgSearchSetup) return;
    orgSearchSetup = true;

    const searchInput = document.getElementById('orgSearchInput');
    const searchBtn = document.getElementById('orgSearchBtn');
    const joinCodeInput = document.getElementById('orgJoinCode');
    const joinBtn = document.getElementById('orgJoinBtn');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            searchOrganizations(searchInput.value);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchOrganizations(searchInput.value);
            }
        });
    }

    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            joinOrganizationByCode(joinCodeInput.value);
        });
    }

    if (joinCodeInput) {
        joinCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinOrganizationByCode(joinCodeInput.value);
            }
        });
    }
}

/**
 * Search for organizations
 */
async function searchOrganizations(query) {
    const resultsContainer = document.getElementById('orgSearchResults');
    const myUsername = currentUser?.username || sessionStorage.getItem('username');
    
    if (!query || query.trim().length < 2) {
        resultsContainer.innerHTML = '';
        const msg = document.createElement('p');
        msg.style.cssText = 'color: var(--text-secondary); text-align: center;';
        msg.textContent = 'Enter at least 2 characters to search.';
        resultsContainer.appendChild(msg);
        return;
    }

    Templates.clearAndLoad(resultsContainer, 'Searching...');

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/search?q=${encodeURIComponent(query)}&username=${encodeURIComponent(myUsername || '')}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Search failed');
        }

        if (!data.organizations || data.organizations.length === 0) {
            resultsContainer.innerHTML = '';
            const msg = document.createElement('p');
            msg.style.cssText = 'color: var(--text-secondary); text-align: center;';
            msg.textContent = 'No organizations found matching your search.';
            resultsContainer.appendChild(msg);
            return;
        }

        resultsContainer.innerHTML = '';
        data.organizations.forEach(org => {
            const card = Templates.render('tpl-org-search-result', {
                'name': org.name,
                'code': org.unique_code,
                'member-count': `${org.member_count || 0} members`,
                'owner': org.owner_username ? `Owner: ${org.owner_username}` : ''
            });
            
            if (card) {
                const actionsSlot = card.querySelector('[data-slot="actions"]');
                if (actionsSlot) {
                    actionsSlot.innerHTML = '';
                    
                    if (org.owner_username === myUsername) {
                        const badge = document.createElement('span');
                        badge.className = 'org-role-badge owner';
                        badge.textContent = 'Owner';
                        actionsSlot.appendChild(badge);
                    } else if (org.membership_status === 'approved') {
                        const badge = document.createElement('span');
                        badge.className = 'org-role-badge member';
                        badge.textContent = 'Member';
                        actionsSlot.appendChild(badge);
                    } else if (org.membership_status === 'pending') {
                        const badge = document.createElement('span');
                        badge.className = 'org-role-badge pending';
                        badge.textContent = 'Pending';
                        actionsSlot.appendChild(badge);
                    } else {
                        const joinBtn = document.createElement('button');
                        joinBtn.className = 'btn btn-primary btn-sm';
                        joinBtn.textContent = 'Request to Join';
                        joinBtn.addEventListener('click', () => joinOrganizationByCode(org.unique_code));
                        actionsSlot.appendChild(joinBtn);
                    }
                }
                
                resultsContainer.appendChild(card);
            }
        });
    } catch (error) {
        console.error('Error searching organizations:', error);
        resultsContainer.innerHTML = '';
        const msg = document.createElement('p');
        msg.style.cssText = 'color: var(--danger); text-align: center;';
        msg.textContent = `Error: ${error.message}`;
        resultsContainer.appendChild(msg);
    }
}

/**
 * Join an organization by code
 */
async function joinOrganizationByCode(code) {
    if (!code || code.trim().length < 4) {
        showJoinMessage('Please enter a valid organization code.', 'error');
        return;
    }

    const cleanCode = code.trim().toUpperCase();
    
    try {
        const response = await fetch(`${API_BASE_URL}/organizations/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: cleanCode,
                username: currentUser.username
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to join organization');
        }

        showJoinMessage(data.message || 'Join request submitted!', 'success');
        
        const joinInput = document.getElementById('orgJoinCode');
        if (joinInput) joinInput.value = '';

    } catch (error) {
        console.error('Error joining organization:', error);
        showJoinMessage(error.message, 'error');
    }
}

/**
 * Show join message
 */
function showJoinMessage(message, type) {
    const messageDiv = document.getElementById('joinMessage');
    if (!messageDiv) return;
    
    messageDiv.textContent = message;
    messageDiv.className = `join-message ${type}`;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

/**
 * Show My Organizations view
 */
async function showMyOrganizations(skipUrlUpdate = false) {
    // Update URL unless coming from popstate
    if (!skipUrlUpdate && typeof navigateTo === 'function') {
        navigateTo('organizations');
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    petitionSection.style.display = 'none';
    aboutSection.style.display = 'none';
    const searchSection = document.getElementById('searchSection');
    if (searchSection) searchSection.style.display = 'none';
    
    proposalsList.parentElement.style.display = 'block';
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    Templates.clearAndLoad(proposalsList, 'Loading your organizations...');

    try {
        const [ownedResponse, memberResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/organizations/owned/${currentUser.username}`),
            fetch(`${API_BASE_URL}/organizations/user/${currentUser.username}`)
        ]);
        
        const ownedData = await ownedResponse.json();
        const memberData = await memberResponse.json();

        if (!ownedResponse.ok || !memberResponse.ok) {
            throw new Error('Failed to load organizations');
        }

        const ownedIds = new Set((ownedData.organizations || []).map(o => o.id));
        const memberOrgs = (memberData.organizations || []).filter(o => !ownedIds.has(o.id));
        
        displayMyOrganizations(ownedData.organizations || [], memberOrgs);

    } catch (error) {
        console.error('Error loading organizations:', error);
        proposalsList.innerHTML = '';
        const errorCard = Templates.render('tpl-error-card', { 'message': error.message });
        if (errorCard) {
            Templates.bindActions(errorCard, { 'back': () => returnToHome() });
            proposalsList.appendChild(errorCard);
        }
    }
}

/**
 * Display user's organizations
 */
function displayMyOrganizations(ownedOrgs, memberOrgs) {
    proposalsList.innerHTML = '';
    
    // Create main container from template
    const container = Templates.render('tpl-my-organizations', {});
    if (!container) return;
    
    Templates.bindActions(container, {
        'return-home': () => returnToHome(),
        'create-org': () => showCreateOrganizationModal()
    });
    
    proposalsList.appendChild(container);

    const ownedContainer = document.getElementById('ownedOrgsList');
    const memberContainer = document.getElementById('memberOrgsList');

    if (ownedOrgs && ownedOrgs.length > 0) {
        const sectionHeader = Templates.render('tpl-orgs-section-header', {
            'title': 'Organizations I Own'
        });
        if (sectionHeader) {
            sectionHeader.style.marginTop = '1.5rem';
            ownedContainer.appendChild(sectionHeader);
            
            const grid = sectionHeader.querySelector('[data-slot="grid"]');
            if (grid) {
                ownedOrgs.forEach((org, index) => {
                    const card = createOwnedOrgCard(org, index);
                    grid.appendChild(card);
                });
            }
        }
    } else {
        ownedContainer.innerHTML = '';
    }

    if (memberOrgs && memberOrgs.length > 0) {
        const sectionHeader = Templates.render('tpl-orgs-section-header', {
            'title': "Organizations I've Joined"
        });
        if (sectionHeader) {
            sectionHeader.style.marginTop = '2rem';
            memberContainer.appendChild(sectionHeader);
            
            const grid = sectionHeader.querySelector('[data-slot="grid"]');
            if (grid) {
                memberOrgs.forEach((org, index) => {
                    const card = createMemberOrgCard(org, index);
                    grid.appendChild(card);
                });
            }
        }
    } else if (!ownedOrgs || ownedOrgs.length === 0) {
        memberContainer.innerHTML = '';
        const emptyState = Templates.render('tpl-empty-state', {
            'message': "You haven't joined any organizations yet.",
            'submessage': 'Use the Search tab to find and join organizations, or create your own!'
        });
        if (emptyState) {
            emptyState.style.marginTop = '1.5rem';
            memberContainer.appendChild(emptyState);
        }
    } else {
        const sectionHeader = Templates.render('tpl-orgs-section-header', {
            'title': "Organizations I've Joined"
        });
        if (sectionHeader) {
            sectionHeader.style.marginTop = '2rem';
            memberContainer.appendChild(sectionHeader);
            
            const grid = sectionHeader.querySelector('[data-slot="grid"]');
            if (grid) {
                const noOrgsMsg = document.createElement('p');
                noOrgsMsg.style.color = 'var(--text-secondary)';
                noOrgsMsg.textContent = "You haven't joined any other organizations yet.";
                grid.appendChild(noOrgsMsg);
            }
        }
    }
}

/**
 * Create card for an owned organization
 */
function createOwnedOrgCard(org, index) {
    const card = Templates.render('tpl-owned-org-card', {
        'name': org.name,
        'member-count': `${org.member_count || 0} members`,
        'pending-count': org.pending_count ? `${org.pending_count} pending requests` : '',
        'code-display': `Code: ${org.unique_code}`
    });
    
    if (!card) {
        // Fallback if template not found
        const fallback = document.createElement('div');
        fallback.className = 'org-card owned-org-card';
        fallback.textContent = org.name;
        return fallback;
    }
    
    card.style.animation = `fadeInUp 0.5s ease ${index * 0.05}s both`;
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => showOrganizationDetails(org.id));
    
    // Bind actions
    Templates.bindActions(card, {
        'copy-code': (e) => {
            e.stopPropagation();
            copyToClipboard(org.unique_code);
        },
        'new-proposal': (e) => {
            e.stopPropagation();
            showCreateProposalForOrg(org.id, org.name);
        },
        'view-requests': (e) => {
            e.stopPropagation();
            viewPendingRequests(org.id);
        },
        'delete-org': (e) => {
            e.stopPropagation();
            showDeleteOrgModal(org.id, org.name);
        }
    });
    
    return card;
}

/**
 * Create card for a member organization
 * Uses same large card layout as owned organizations (Task 2 & Task 3 fix)
 */
function createMemberOrgCard(org, index) {
    const roleClass = org.role || 'member';
    const statusLabel = org.status === 'pending' ? 'pending' : roleClass;
    
    const card = Templates.render('tpl-member-org-card', {
        'name': org.name,
        'role': { text: statusLabel, class: `org-card-role ${statusLabel}` },
        'member-count': `${org.member_count || 0} members`,
        'code-display': `Code: ${org.unique_code}`
    });
    
    if (!card) {
        const fallback = document.createElement('div');
        fallback.className = 'org-card owned-org-card';
        fallback.textContent = org.name;
        return fallback;
    }
    
    card.style.animation = `fadeInUp 0.5s ease ${index * 0.05}s both`;
    
    // Make card clickable if approved
    if (org.status === 'approved') {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => showOrganizationDetails(org.id));
    }
    
    // Set up actions slot based on status
    const actionsSlot = card.querySelector('[data-slot="actions"]');
    if (actionsSlot) {
        actionsSlot.innerHTML = '';
        
        if (org.status === 'approved') {
            const approvedActions = Templates.clone('tpl-member-org-actions-approved');
            if (approvedActions) {
                const viewBtn = approvedActions.querySelector('[data-action="view-proposals"]');
                const leaveBtn = approvedActions.querySelector('[data-action="leave-org"]');
                
                if (viewBtn) {
                    viewBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showOrganizationDetails(org.id);
                    });
                }
                if (leaveBtn) {
                    leaveBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        leaveOrganization(org.id);
                    });
                }
                
                actionsSlot.appendChild(approvedActions);
            }
        } else if (org.status === 'pending') {
            const pendingActions = Templates.clone('tpl-member-org-actions-pending');
            if (pendingActions) {
                actionsSlot.appendChild(pendingActions);
            }
        }
    }
    
    // Bind copy-code action
    Templates.bindActions(card, {
        'copy-code': (e) => {
            e.stopPropagation();
            copyToClipboard(org.unique_code);
        }
    });
    
    return card;
}

/**
 * Show create proposal form for an organization
 */
async function showCreateProposalForOrg(orgId, orgName) {
    let members = [];
    try {
        const res = await fetch(`${API_BASE_URL}/organizations/${orgId}/members`);
        const data = await res.json();
        members = data.members || [];
    } catch (e) {
        console.error('Failed to load members:', e);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    let membersListHtml = members.map(m => `
        <label class="voter-checkbox" data-userid="${m.user_id}">
            <input type="checkbox" name="allowed_voters" value="${m.user_id}" checked>
            <span class="voter-username">${m.username}</span>
            <span class="voter-id">${m.unique_id || ''}</span>
        </label>
    `).join('');

    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>Create Proposal for ${orgName}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form id="createOrgProposalForm" class="modal-body">
                <div class="modal-form-group">
                    <label>Proposal Title</label>
                    <input type="text" name="title" placeholder="Enter proposal title..." required>
                </div>
                <div class="modal-form-group">
                    <label>Description</label>
                    <textarea name="description" placeholder="Describe the proposal..." required></textarea>
                </div>
                <div class="modal-form-group">
                    <label>Authorized By</label>
                    <input type="text" name="authorized_by" placeholder="Name of authorizing person or body..." required>
                </div>
                <div class="modal-form-group">
                    <label>Decision Date</label>
                    <input type="date" name="decision_date" required>
                </div>
                <div class="modal-form-group">
                    <label>Voting Permissions</label>
                    <div class="voting-permissions-section">
                        <div class="voting-permission-controls">
                            <button type="button" class="btn btn-sm btn-secondary" onclick="selectAllVoters()">Select All</button>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="deselectAllVoters()">Deselect All</button>
                        </div>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0;">Deselect members to restrict voting access. Unchecked members will see "RESTRICTED VOTING" on this proposal.</p>
                        <div class="voters-list">
                            ${membersListHtml || '<p style="color: var(--text-muted);">No members found.</p>'}
                        </div>
                    </div>
                </div>
            </form>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="submitOrgProposal(${orgId})">Create Proposal</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
}

/**
 * Select all voters
 */
function selectAllVoters() {
    document.querySelectorAll('.voter-checkbox input[name="allowed_voters"]').forEach(cb => cb.checked = true);
}

/**
 * Deselect all voters
 */
function deselectAllVoters() {
    document.querySelectorAll('.voter-checkbox input[name="allowed_voters"]').forEach(cb => cb.checked = false);
}

/**
 * Submit organization proposal
 */
async function submitOrgProposal(orgId) {
    const form = document.getElementById('createOrgProposalForm');
    const title = form.querySelector('[name="title"]').value.trim();
    const description = form.querySelector('[name="description"]').value.trim();
    const authorized_by = form.querySelector('[name="authorized_by"]').value.trim();
    const decision_date = form.querySelector('[name="decision_date"]').value;

    if (!title || !description || !authorized_by || !decision_date) {
        alert('Please fill in all required fields.');
        return;
    }

    const checkedBoxes = form.querySelectorAll('[name="allowed_voters"]:checked');
    const allBoxes = form.querySelectorAll('[name="allowed_voters"]');
    
    let allowed_voters = 'ALL';
    if (checkedBoxes.length < allBoxes.length) {
        if (checkedBoxes.length === 0) {
            alert('Please select at least one voter.');
            return;
        }
        allowed_voters = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
    }

    try {
        const res = await fetch(`${API_BASE_URL}/organizations/${orgId}/proposals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                title,
                original_text: description,
                authorized_by,
                decision_date,
                allowed_voters
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create proposal');

        document.querySelector('.modal-overlay').remove();
        showOrganizationDetails(orgId);
        alert('Proposal created successfully!');
    } catch (error) {
        console.error('Error creating proposal:', error);
        alert(error.message);
    }
}

/**
 * View organization details
 */
async function showOrganizationDetails(orgId, skipUrlUpdate = false) {
    // Update URL unless coming from popstate
    if (!skipUrlUpdate && typeof navigateTo === 'function') {
        navigateTo(`organization/${orgId}`);
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    petitionSection.style.display = 'none';
    aboutSection.style.display = 'none';
    const searchSection = document.getElementById('searchSection');
    if (searchSection) searchSection.style.display = 'none';
    
    proposalsList.parentElement.style.display = 'block';
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    Templates.clearAndLoad(proposalsList, 'Loading organization...');

    try {
        const [orgResponse, membershipResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/organizations/${orgId}`),
            fetch(`${API_BASE_URL}/organizations/${orgId}/membership/${currentUser.username}`)
        ]);
        
        const orgData = await orgResponse.json();
        const membershipData = await membershipResponse.json();

        if (!orgResponse.ok) {
            throw new Error(orgData.error || 'Failed to load organization');
        }

        const org = orgData.organization;
        const isOwner = org.owner_id && membershipData.membership?.role === 'owner';
        const isAdmin = membershipData.membership?.role === 'admin';
        const isOwnerOrAdmin = isOwner || isAdmin;
        
        currentOrgContext = { org, isOwner, isAdmin, isOwnerOrAdmin };

        displayOrganizationDashboard(org, isOwnerOrAdmin);

    } catch (error) {
        console.error('Error loading organization:', error);
        proposalsList.innerHTML = '';
        const errorCard = Templates.render('tpl-error-card', { 'message': error.message });
        if (errorCard) {
            // Custom back action for org context
            const backBtn = errorCard.querySelector('[data-action="back"]');
            if (backBtn) {
                backBtn.textContent = '← Back';
                backBtn.addEventListener('click', () => showMyOrganizations());
            }
            proposalsList.appendChild(errorCard);
        }
    }
}

/**
 * Display organization dashboard with proposals and management tabs
 */
async function displayOrganizationDashboard(org, isOwnerOrAdmin) {
    let tabsHtml = `
        <button class="org-dash-tab active" data-tab="active">Active Proposals</button>
        <button class="org-dash-tab" data-tab="past">Past Proposals</button>
    `;
    
    if (isOwnerOrAdmin) {
        tabsHtml += `
            <button class="org-dash-tab" data-tab="petitions">Petitioned Proposals</button>
            <button class="org-dash-tab" data-tab="requests">Pending Requests</button>
            <button class="org-dash-tab" data-tab="members">Members</button>
        `;
    }

    proposalsList.innerHTML = `
        <div class="org-dashboard" style="grid-column: 1 / -1;">
            <button class="btn btn-secondary btn-sm" onclick="showMyOrganizations()" style="margin-bottom: 1rem; align-self: flex-start;">← Back to Organizations</button>
            <div class="org-dashboard-header">
                <div>
                    <h2>${org.name}</h2>
                    <span class="org-code" style="font-family: monospace; color: var(--text-secondary);">${org.unique_code}</span>
                </div>
                ${isOwnerOrAdmin ? `<button class="btn btn-primary" onclick="showCreateProposalForOrg(${org.id}, '${org.name.replace(/'/g, "\\'")}')">+ New Proposal</button>` : ''}
            </div>
            <div class="org-dashboard-tabs">
                ${tabsHtml}
            </div>
            <div id="orgDashboardContent"></div>
        </div>
    `;

    document.querySelectorAll('.org-dash-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.org-dash-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            loadOrgDashboardTab(org.id, e.target.dataset.tab, isOwnerOrAdmin);
        });
    });

    loadOrgDashboardTab(org.id, 'active', isOwnerOrAdmin);
}

/**
 * Load content for organization dashboard tab
 */
async function loadOrgDashboardTab(orgId, tab, isOwnerOrAdmin) {
    const contentDiv = document.getElementById('orgDashboardContent');
    Templates.clearAndLoad(contentDiv);

    try {
        switch (tab) {
            case 'active':
            case 'past':
                const proposalsResponse = await fetch(`${API_BASE_URL}/organizations/${orgId}/proposals?filter=${tab === 'past' ? 'past' : 'active'}&username=${currentUser.username}`);
                const proposalsData = await proposalsResponse.json();
                displayOrgProposals(proposalsData.proposals || [], isOwnerOrAdmin);
                break;
            case 'petitions':
                const petitionsResponse = await fetch(`${API_BASE_URL}/organizations/${orgId}/petitions?username=${currentUser.username}`);
                const petitionsData = await petitionsResponse.json();
                displayOrgPetitions(petitionsData.petitions || []);
                break;
            case 'requests':
                const requestsResponse = await fetch(`${API_BASE_URL}/organizations/${orgId}/pending?username=${currentUser.username}`);
                const requestsData = await requestsResponse.json();
                displayOrgPendingRequests(orgId, requestsData.pending_memberships || []);
                break;
            case 'members':
                const membersResponse = await fetch(`${API_BASE_URL}/organizations/${orgId}/members`);
                const membersData = await membersResponse.json();
                displayOrgMembers(orgId, membersData.members || [], isOwnerOrAdmin);
                break;
        }
    } catch (error) {
        console.error('Error loading tab:', error);
        contentDiv.innerHTML = '';
        const msg = document.createElement('p');
        msg.style.color = 'var(--danger)';
        msg.textContent = `Error loading content: ${error.message}`;
        contentDiv.appendChild(msg);
    }
}

/**
 * Display organization proposals
 * Task 4: Store organization context when navigating to proposals
 */
function displayOrgProposals(proposals, isOwnerOrAdmin) {
    const contentDiv = document.getElementById('orgDashboardContent');
    
    if (!proposals || proposals.length === 0) {
        contentDiv.innerHTML = '';
        const msg = document.createElement('p');
        msg.style.color = 'var(--text-secondary)';
        msg.textContent = 'No proposals found.';
        contentDiv.appendChild(msg);
        return;
    }

    contentDiv.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.className = 'org-proposals-list';
    
    proposals.forEach(proposal => {
        const isRestricted = proposal.allowed_voters && proposal.allowed_voters !== 'ALL';
        
        const card = Templates.render('tpl-org-proposal-card', {
            'title': proposal.title,
            'decision-date': `Decision: ${proposal.decision_date || 'N/A'}`,
            'vote-count': `Votes: ${proposal.total_votes || 0}`,
            'restricted': isRestricted ? { hidden: false } : { hidden: true }
        });
        
        if (card) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => navigateToProposalFromOrg(proposal.id));
            
            // Set up admin actions if owner/admin
            if (isOwnerOrAdmin) {
                const adminActions = card.querySelector('[data-slot="admin-actions"]');
                if (adminActions) {
                    adminActions.style.display = 'block';
                    adminActions.innerHTML = '';
                    
                    const actionsFragment = Templates.clone('tpl-org-proposal-admin-actions');
                    if (actionsFragment) {
                        const editBtn = actionsFragment.querySelector('[data-action="edit"]');
                        const permsBtn = actionsFragment.querySelector('[data-action="permissions"]');
                        
                        if (editBtn) {
                            editBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                editProposalModal(proposal.id);
                            });
                        }
                        if (permsBtn) {
                            permsBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                showEditVotingPermissionsModal(proposal.id);
                            });
                        }
                        
                        adminActions.appendChild(actionsFragment);
                    }
                }
            }
            
            // Set up vote status
            const voteStatusSlot = card.querySelector('[data-slot="vote-status"]');
            if (voteStatusSlot) {
                voteStatusSlot.innerHTML = '';
                
                if (proposal.has_voted) {
                    const votedNotice = Templates.render('tpl-vote-already-voted', {
                        'vote-type': proposal.user_vote ? 'Approved' : 'Denied'
                    });
                    if (votedNotice) voteStatusSlot.appendChild(votedNotice);
                } else if (!proposal.can_vote && proposal.is_restricted) {
                    const restrictedNotice = Templates.clone('tpl-vote-restricted');
                    if (restrictedNotice) voteStatusSlot.appendChild(restrictedNotice);
                }
            }
            
            listContainer.appendChild(card);
        }
    });
    
    contentDiv.appendChild(listContainer);
}

/**
 * Display organization petitions
 */
function displayOrgPetitions(petitions) {
    const contentDiv = document.getElementById('orgDashboardContent');
    
    if (!petitions || petitions.length === 0) {
        contentDiv.innerHTML = '';
        const msg = document.createElement('p');
        msg.style.color = 'var(--text-secondary)';
        msg.textContent = 'No petitions submitted yet.';
        contentDiv.appendChild(msg);
        return;
    }

    contentDiv.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.className = 'org-petitions-list';
    
    petitions.forEach(petition => {
        const isEdited = petition.is_edited === 1;
        const timestamp = new Date(petition.created_at).toLocaleString();
        
        const card = Templates.render('tpl-petition-item', {
            'proposal-title': petition.proposal_title,
            'username': petition.username,
            'unique-id': petition.unique_id || '',
            'timestamp': `${timestamp}${isEdited ? ' (edited)' : ''}`,
            'text': petition.petition_text
        });
        
        if (card) {
            listContainer.appendChild(card);
        }
    });
    
    contentDiv.appendChild(listContainer);
}

/**
 * Display pending membership requests in org dashboard
 */
function displayOrgPendingRequests(orgId, requests) {
    const contentDiv = document.getElementById('orgDashboardContent');
    
    if (!requests || requests.length === 0) {
        contentDiv.innerHTML = '';
        const msg = document.createElement('p');
        msg.style.color = 'var(--text-secondary)';
        msg.textContent = 'No pending requests.';
        contentDiv.appendChild(msg);
        return;
    }

    contentDiv.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.className = 'pending-requests-list';
    
    requests.forEach(request => {
        const card = Templates.render('tpl-pending-request-card', {
            'username': request.username,
            'unique-id': request.unique_id || 'N/A',
            'request-date': `Requested ${new Date(request.requested_at).toLocaleDateString()}`
        });
        
        if (card) {
            card.id = `request-${request.id}`;
            
            Templates.bindActions(card, {
                'approve': () => approveMembership(request.id),
                'reject': () => rejectMembership(request.id)
            });
            
            listContainer.appendChild(card);
        }
    });
    
    contentDiv.appendChild(listContainer);
}

/**
 * Display organization members with kick option
 */
function displayOrgMembers(orgId, members, isOwnerOrAdmin) {
    const contentDiv = document.getElementById('orgDashboardContent');
    
    if (!members || members.length === 0) {
        contentDiv.innerHTML = '';
        const msg = document.createElement('p');
        msg.style.color = 'var(--text-secondary)';
        msg.textContent = 'No members.';
        contentDiv.appendChild(msg);
        return;
    }

    contentDiv.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.className = 'org-members-list';
    
    members.forEach(member => {
        const isOwner = member.role === 'owner';
        
        const card = Templates.render('tpl-member-card', {
            'username': member.username,
            'unique-id': member.unique_id || 'N/A',
            'role': { text: member.role, class: `member-role-badge ${member.role}` }
        });
        
        if (card) {
            const actionsSlot = card.querySelector('[data-slot="actions"]');
            if (actionsSlot && isOwnerOrAdmin && !isOwner) {
                const kickBtn = document.createElement('button');
                kickBtn.className = 'btn btn-sm';
                kickBtn.style.cssText = 'background: var(--danger); color: white;';
                kickBtn.textContent = 'Kick';
                kickBtn.addEventListener('click', () => kickMember(orgId, member.user_id, member.username));
                actionsSlot.appendChild(kickBtn);
            }
            
            listContainer.appendChild(card);
        }
    });
    
    contentDiv.appendChild(listContainer);
}

/**
 * Kick a member from organization
 */
async function kickMember(orgId, userId, username) {
    if (!confirm(`Are you sure you want to remove ${username} from this organization?`)) return;

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/${orgId}/kick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: currentUser.username,
                memberUserId: userId
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to remove member');
        }

        if (currentOrgContext) {
            loadOrgDashboardTab(orgId, 'members', currentOrgContext.isOwnerOrAdmin);
        }

    } catch (error) {
        console.error('Error kicking member:', error);
        alert(error.message);
    }
}

/**
 * Edit proposal modal
 */
async function editProposalModal(proposalId) {
    try {
        const response = await fetch(`${API_BASE_URL}/proposals/${proposalId}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load proposal');
        }

        const proposal = data.proposal;

        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Edit Proposal</h2>
                    <button class="modal-close" onclick="closeModal()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="modal-form-group">
                        <label for="editTitle">Title</label>
                        <input type="text" id="editTitle" value="${proposal.title.replace(/"/g, '&quot;')}">
                    </div>
                    <div class="modal-form-group">
                        <label for="editDecisionDate">Decision Date</label>
                        <input type="date" id="editDecisionDate" value="${proposal.decision_date || ''}">
                    </div>
                    <div class="modal-form-group">
                        <label for="editText">Description</label>
                        <textarea id="editText" style="min-height: 200px;">${proposal.original_text}</textarea>
                    </div>
                    <div id="editProposalMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="saveProposalEdit(${proposalId}, ${proposal.organization_id})">Save Changes</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

    } catch (error) {
        console.error('Error loading proposal for edit:', error);
        alert('Failed to load proposal: ' + error.message);
    }
}

/**
 * Save proposal edits
 */
async function saveProposalEdit(proposalId, orgId) {
    const title = document.getElementById('editTitle').value.trim();
    const decision_date = document.getElementById('editDecisionDate').value;
    const original_text = document.getElementById('editText').value.trim();
    const messageDiv = document.getElementById('editProposalMessage');

    if (!title || !original_text) {
        messageDiv.textContent = 'Title and description are required.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/${orgId}/proposals/${proposalId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                title,
                decision_date,
                original_text
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update proposal');
        }

        messageDiv.textContent = 'Proposal updated successfully!';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        messageDiv.style.color = 'var(--success)';

        setTimeout(() => {
            closeModal();
            if (currentOrgContext) {
                loadOrgDashboardTab(orgId, 'active', currentOrgContext.isOwnerOrAdmin);
            }
        }, 1500);

    } catch (error) {
        console.error('Error saving proposal:', error);
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
    }
}

// Note: copyToClipboard is defined in dashboard-core.js

/**
 * Show create organization modal
 */
function showCreateOrganizationModal() {
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create Organization</h2>
                <button class="modal-close" onclick="closeModal()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="modal-form-group">
                    <label for="orgName">Organization Name *</label>
                    <input type="text" id="orgName" placeholder="Enter organization name" required>
                </div>
                <div class="modal-form-group">
                    <label for="orgDescription">Description (optional)</label>
                    <textarea id="orgDescription" placeholder="Describe your organization..."></textarea>
                </div>
                <div id="createOrgMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="createOrganization()">Create</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.getElementById('orgName').focus();
}

/**
 * Create a new organization
 */
async function createOrganization() {
    const name = document.getElementById('orgName').value.trim();
    const description = document.getElementById('orgDescription').value.trim();
    const messageDiv = document.getElementById('createOrgMessage');

    if (!name) {
        messageDiv.textContent = 'Organization name is required.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/organizations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description,
                username: currentUser.username
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create organization');
        }

        messageDiv.textContent = `Organization created! Your code: ${data.organization.unique_code}`;
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        messageDiv.style.color = 'var(--success)';

        setTimeout(() => {
            closeModal();
            showMyOrganizations();
        }, 2000);

    } catch (error) {
        console.error('Error creating organization:', error);
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
    }
}

/**
 * Show delete organization confirmation modal (GitHub-style)
 */
function showDeleteOrgModal(orgId, orgName) {
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header" style="background: rgba(239, 68, 68, 0.1);">
                <h2 style="color: var(--danger);">Delete Organization</h2>
                <button class="modal-close" onclick="closeModal()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                    <p style="color: var(--danger); font-weight: 600; margin-bottom: 0.5rem;">Warning:</p>
                    <p style="color: var(--text-secondary); font-size: 0.875rem;">This action <strong>cannot</strong> be undone. This will permanently delete the <strong>${orgName}</strong> organization, all its proposals, and remove all members.</p>
                </div>
                <div class="modal-form-group">
                    <label for="deleteOrgConfirmation">Please type <strong style="font-family: monospace;">${orgName}</strong> to confirm:</label>
                    <input type="text" id="deleteOrgConfirmation" placeholder="Enter organization name" autocomplete="off">
                </div>
                <div id="deleteOrgMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn" id="deleteOrgBtn" style="background: var(--danger); color: white; opacity: 0.5; cursor: not-allowed;" disabled onclick="deleteOrganization(${orgId}, '${orgName.replace(/'/g, "\\'")}')">Delete this organization</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    const confirmInput = document.getElementById('deleteOrgConfirmation');
    const deleteBtn = document.getElementById('deleteOrgBtn');
    
    confirmInput.addEventListener('input', () => {
        if (confirmInput.value === orgName) {
            deleteBtn.disabled = false;
            deleteBtn.style.opacity = '1';
            deleteBtn.style.cursor = 'pointer';
        } else {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.5';
            deleteBtn.style.cursor = 'not-allowed';
        }
    });

    confirmInput.focus();
}

/**
 * Delete an organization
 */
async function deleteOrganization(orgId, orgName) {
    const confirmationName = document.getElementById('deleteOrgConfirmation').value;
    const messageDiv = document.getElementById('deleteOrgMessage');

    if (confirmationName !== orgName) {
        messageDiv.textContent = 'Organization name does not match.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/${orgId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                confirmationName: confirmationName
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete organization');
        }

        messageDiv.textContent = 'Organization deleted successfully.';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        messageDiv.style.color = 'var(--success)';

        setTimeout(() => {
            closeModal();
            showMyOrganizations();
        }, 1500);

    } catch (error) {
        console.error('Error deleting organization:', error);
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
    }
}

/**
 * View pending membership requests for an organization
 */
async function viewPendingRequests(orgId) {
    const listContainer = document.getElementById('myOrgsList') || proposalsList;
    listContainer.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Loading requests...</p></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/${orgId}/pending?username=${currentUser.username}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load pending requests');
        }

        displayPendingRequests(orgId, data.pending_memberships || []);

    } catch (error) {
        console.error('Error loading pending requests:', error);
        listContainer.innerHTML = `
            <div class="result-card">
                <h3>Error</h3>
                <p>${error.message}</p>
                <button class="btn btn-secondary btn-sm" onclick="showMyOrganizations()" style="margin-top: 1rem;">← Back</button>
            </div>
        `;
    }
}

/**
 * Display pending membership requests
 */
function displayPendingRequests(orgId, requests) {
    const listContainer = document.getElementById('myOrgsList') || proposalsList;
    
    listContainer.innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="showMyOrganizations()" style="margin-bottom: 1rem;">← Back to Organizations</button>
        <h3 style="margin-bottom: 1rem;">Pending Membership Requests</h3>
    `;

    if (!requests || requests.length === 0) {
        listContainer.innerHTML += '<p style="color: var(--text-secondary);">No pending requests.</p>';
        return;
    }

    const list = document.createElement('div');
    list.className = 'pending-requests-list';

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'pending-request-card';
        card.id = `request-${request.id}`;
        card.innerHTML = `
            <div class="pending-request-info">
                <div class="pending-request-username">${request.username}</div>
                <div class="pending-request-id" style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary); background: var(--bg); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.25rem;">${request.unique_id || 'N/A'}</div>
                <div class="pending-request-time" style="margin-top: 0.25rem;">Requested ${new Date(request.requested_at).toLocaleDateString()}</div>
            </div>
            <div class="pending-request-actions">
                <button class="btn btn-sm btn-approve" onclick="approveMembership(${request.id})">Approve</button>
                <button class="btn btn-sm btn-reject" onclick="rejectMembership(${request.id})">Reject</button>
            </div>
        `;
        list.appendChild(card);
    });

    listContainer.appendChild(list);
}

/**
 * Approve a membership request
 */
async function approveMembership(membershipId) {
    try {
        const response = await fetch(`${API_BASE_URL}/organizations/membership/${membershipId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to approve');
        }

        const card = document.getElementById(`request-${membershipId}`);
        if (card) {
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
        }

    } catch (error) {
        console.error('Error approving membership:', error);
        alert(error.message);
    }
}

/**
 * Reject a membership request
 */
async function rejectMembership(membershipId) {
    if (!confirm('Are you sure you want to reject this request?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/membership/${membershipId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to reject');
        }

        const card = document.getElementById(`request-${membershipId}`);
        if (card) {
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
        }

    } catch (error) {
        console.error('Error rejecting membership:', error);
        alert(error.message);
    }
}

/**
 * Leave an organization
 */
async function leaveOrganization(orgId) {
    if (!confirm('Are you sure you want to leave this organization?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/${orgId}/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to leave organization');
        }

        showMyOrganizations();

    } catch (error) {
        console.error('Error leaving organization:', error);
        alert(error.message);
    }
}

/**
 * Task 4: Navigate to proposal while storing organization context
 */
function navigateToProposalFromOrg(proposalId) {
    if (currentOrgContext && currentOrgContext.org) {
        // Store organization context for back navigation
        sessionStorage.setItem('orgContext', JSON.stringify({
            id: currentOrgContext.org.id,
            name: currentOrgContext.org.name
        }));
    }
    window.location.href = `/proposal/${proposalId}`;
}

/**
 * Task 5: Show modal to edit voting permissions for a proposal
 */
async function showEditVotingPermissionsModal(proposalId) {
    if (!currentOrgContext || !currentOrgContext.org) {
        alert('Organization context not found');
        return;
    }

    const orgId = currentOrgContext.org.id;

    try {
        // Fetch proposal details and org members in parallel
        const [proposalRes, membersRes] = await Promise.all([
            fetch(`${API_BASE_URL}/proposals/${proposalId}`),
            fetch(`${API_BASE_URL}/organizations/${orgId}/members`)
        ]);

        const proposalData = await proposalRes.json();
        const membersData = await membersRes.json();

        if (!proposalRes.ok) throw new Error(proposalData.error || 'Failed to load proposal');

        const proposal = proposalData.proposal;
        const members = membersData.members || [];

        // Parse current allowed voters
        let allowedVoters = [];
        let isAllMembers = true;
        if (proposal.allowed_voters && proposal.allowed_voters !== 'ALL') {
            try {
                allowedVoters = JSON.parse(proposal.allowed_voters);
                isAllMembers = false;
            } catch (e) {
                console.warn('Failed to parse allowed_voters:', e);
            }
        }

        // Build member checkboxes
        const membersHtml = members.map(m => {
            const isChecked = isAllMembers || allowedVoters.includes(m.user_id);
            return `
                <label class="voter-checkbox" data-userid="${m.user_id}">
                    <input type="checkbox" name="allowed_voters" value="${m.user_id}" ${isChecked ? 'checked' : ''}>
                    <span class="voter-username">${m.username}</span>
                    <span class="voter-id">${m.unique_id || ''}</span>
                </label>
            `;
        }).join('');

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Edit Voting Permissions</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                        <strong>${proposal.title}</strong>
                    </p>
                    
                    <div class="modal-form-group">
                        <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                            <input type="radio" name="voter_mode" value="all" ${isAllMembers ? 'checked' : ''} onchange="toggleVoterSelection(false)">
                            <span>All Members Can Vote</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem;">
                            <input type="radio" name="voter_mode" value="specific" ${!isAllMembers ? 'checked' : ''} onchange="toggleVoterSelection(true)">
                            <span>Specific Members Only</span>
                        </label>
                    </div>

                    <div id="voterSelectionSection" style="display: ${isAllMembers ? 'none' : 'block'}; margin-top: 1rem;">
                        <div class="voting-permissions-section">
                            <div class="voting-permission-controls">
                                <button type="button" class="btn btn-sm btn-secondary" onclick="selectAllVoters()">Select All</button>
                                <button type="button" class="btn btn-sm btn-secondary" onclick="deselectAllVoters()">Deselect All</button>
                            </div>
                            <div class="voters-list" style="margin-top: 0.5rem; max-height: 300px; overflow-y: auto;">
                                ${membersHtml || '<p style="color: var(--text-muted);">No members found.</p>'}
                            </div>
                        </div>
                    </div>

                    <div id="permissionsMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-top: 1rem;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button class="btn btn-primary" onclick="saveVotingPermissions(${proposalId}, ${orgId})">Save Permissions</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

    } catch (error) {
        console.error('Error loading voting permissions:', error);
        alert('Failed to load voting permissions: ' + error.message);
    }
}

/**
 * Toggle voter selection section visibility
 */
function toggleVoterSelection(show) {
    const section = document.getElementById('voterSelectionSection');
    if (section) {
        section.style.display = show ? 'block' : 'none';
    }
}

/**
 * Task 5: Save voting permissions for a proposal
 */
async function saveVotingPermissions(proposalId, orgId) {
    const messageDiv = document.getElementById('permissionsMessage');
    const voterMode = document.querySelector('input[name="voter_mode"]:checked')?.value;

    let allowed_voters = 'ALL';
    if (voterMode === 'specific') {
        const checkedBoxes = document.querySelectorAll('[name="allowed_voters"]:checked');
        if (checkedBoxes.length === 0) {
            messageDiv.textContent = 'Please select at least one voter.';
            messageDiv.style.display = 'block';
            messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            messageDiv.style.color = 'var(--danger)';
            return;
        }
        allowed_voters = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
    }

    try {
        const response = await fetch(`${API_BASE_URL}/organizations/${orgId}/proposals/${proposalId}/permissions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                allowed_voters
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update permissions');
        }

        messageDiv.textContent = 'Voting permissions updated successfully!';
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        messageDiv.style.color = 'var(--success)';

        setTimeout(() => {
            document.querySelector('.modal-overlay').remove();
            // Refresh current tab
            if (currentOrgContext) {
                loadOrgDashboardTab(orgId, 'active', currentOrgContext.isOwnerOrAdmin);
            }
        }, 1500);

    } catch (error) {
        console.error('Error saving permissions:', error);
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        messageDiv.style.color = 'var(--danger)';
    }
}


/**
 * Template Utilities Module
 * Provides helper functions for cloning and populating HTML templates
 * This approach improves security (no innerHTML with user data) and maintainability
 */

const Templates = (function() {
    'use strict';

    // Cache for compiled templates
    const templateCache = new Map();

    /**
     * Get a template by ID, with caching
     * @param {string} templateId - The ID of the template element
     * @returns {HTMLTemplateElement|null}
     */
    function getTemplate(templateId) {
        if (templateCache.has(templateId)) {
            return templateCache.get(templateId);
        }
        
        const template = document.getElementById(templateId);
        if (template && template.tagName === 'TEMPLATE') {
            templateCache.set(templateId, template);
            return template;
        }
        
        console.warn(`Template not found: ${templateId}`);
        return null;
    }

    /**
     * Clone a template and return the document fragment
     * @param {string} templateId - The ID of the template element
     * @returns {DocumentFragment|null}
     */
    function clone(templateId) {
        const template = getTemplate(templateId);
        if (!template) return null;
        return template.content.cloneNode(true);
    }

    /**
     * Clone a template and return the first element child
     * @param {string} templateId - The ID of the template element
     * @returns {Element|null}
     */
    function cloneElement(templateId) {
        const fragment = clone(templateId);
        if (!fragment) return null;
        return fragment.firstElementChild;
    }

    /**
     * Fill slots in a cloned template with data
     * Slots are marked with data-slot="slotName" attributes
     * @param {Element|DocumentFragment} element - The cloned template element
     * @param {Object} data - Key-value pairs where key matches slot name
     * @returns {Element|DocumentFragment}
     */
    function fillSlots(element, data) {
        if (!element || !data) return element;

        for (const [slotName, value] of Object.entries(data)) {
            const slot = element.querySelector(`[data-slot="${slotName}"]`);
            if (slot) {
                if (value === null || value === undefined) {
                    slot.style.display = 'none';
                } else if (typeof value === 'string' || typeof value === 'number') {
                    slot.textContent = String(value);
                } else if (value instanceof Node) {
                    slot.innerHTML = '';
                    slot.appendChild(value);
                } else if (typeof value === 'object') {
                    // Handle object with special properties
                    if (value.html !== undefined) {
                        slot.innerHTML = value.html;
                    }
                    if (value.text !== undefined) {
                        slot.textContent = value.text;
                    }
                    if (value.class !== undefined) {
                        slot.className = value.class;
                    }
                    if (value.hidden !== undefined) {
                        slot.style.display = value.hidden ? 'none' : '';
                    }
                    if (value.attrs !== undefined) {
                        for (const [attr, attrValue] of Object.entries(value.attrs)) {
                            slot.setAttribute(attr, attrValue);
                        }
                    }
                }
            }
        }

        return element;
    }

    /**
     * Clone a template and fill its slots in one step
     * @param {string} templateId - The ID of the template element
     * @param {Object} data - Data to fill slots with
     * @returns {Element|null}
     */
    function render(templateId, data = {}) {
        const element = cloneElement(templateId);
        if (!element) return null;
        return fillSlots(element, data);
    }

    /**
     * Set up action handlers on an element
     * Actions are marked with data-action="actionName" attributes
     * @param {Element} element - The element to set up handlers on
     * @param {Object} handlers - Key-value pairs of action names to handler functions
     */
    function bindActions(element, handlers) {
        if (!element || !handlers) return;

        for (const [actionName, handler] of Object.entries(handlers)) {
            const actionElements = element.querySelectorAll(`[data-action="${actionName}"]`);
            actionElements.forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handler(e, el);
                });
            });
        }
    }

    /**
     * Create a loader element
     * @param {string} message - Loading message to display
     * @returns {Element}
     */
    function createLoader(message = 'Loading...') {
        return render('tpl-loader', { message });
    }

    /**
     * Create an error card element
     * @param {string} message - Error message to display
     * @param {Function} onBack - Optional callback for back button
     * @returns {Element}
     */
    function createError(message, onBack = null) {
        const element = render('tpl-error-card', { message });
        if (element && onBack) {
            bindActions(element, {
                'back-btn': onBack
            });
        }
        return element;
    }

    /**
     * Create an empty state element
     * @param {string} message - Main message
     * @param {string} submessage - Secondary message (optional)
     * @returns {Element}
     */
    function createEmptyState(message, submessage = null) {
        return render('tpl-empty-state', { message, submessage });
    }

    /**
     * Escape HTML to prevent XSS when absolutely necessary to use innerHTML
     * @param {string} str - String to escape
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Clear an element and optionally show a loader
     * @param {Element} container - Container element to clear
     * @param {string|null} loadingMessage - If provided, shows a loader
     */
    function clearAndLoad(container, loadingMessage = null) {
        if (!container) return;
        container.innerHTML = '';
        if (loadingMessage) {
            const loader = createLoader(loadingMessage);
            if (loader) container.appendChild(loader);
        }
    }

    /**
     * Replace container content with an error message
     * @param {Element} container - Container element
     * @param {string} message - Error message
     * @param {Function} onBack - Optional back button handler
     */
    function showError(container, message, onBack = null) {
        if (!container) return;
        container.innerHTML = '';
        const error = createError(message, onBack);
        if (error) container.appendChild(error);
    }

    /**
     * Create and append multiple items to a container using a template
     * @param {Element} container - Container to append to
     * @param {string} templateId - Template ID to use for each item
     * @param {Array} items - Array of data objects
     * @param {Function} dataMapper - Function that maps each item to slot data
     * @param {Function} actionBinder - Optional function that returns action handlers for each item
     * @param {Object} options - Additional options (animationDelay, etc.)
     */
    function renderList(container, templateId, items, dataMapper, actionBinder = null, options = {}) {
        if (!container || !items) return;
        
        container.innerHTML = '';
        
        if (items.length === 0 && options.emptyMessage) {
            const empty = createEmptyState(options.emptyMessage, options.emptySubmessage);
            if (empty) container.appendChild(empty);
            return;
        }

        items.forEach((item, index) => {
            const element = render(templateId, dataMapper(item, index));
            if (!element) return;
            
            if (options.animationDelay) {
                element.style.animation = `fadeInUp 0.5s ease ${index * options.animationDelay}s both`;
            }
            
            if (actionBinder) {
                const handlers = actionBinder(item, index, element);
                if (handlers) bindActions(element, handlers);
            }
            
            if (options.onClick) {
                element.style.cursor = 'pointer';
                element.addEventListener('click', () => options.onClick(item, index, element));
            }
            
            container.appendChild(element);
        });
    }

    // Public API
    return {
        getTemplate,
        clone,
        cloneElement,
        fillSlots,
        render,
        bindActions,
        createLoader,
        createError,
        createEmptyState,
        escapeHtml,
        clearAndLoad,
        showError,
        renderList
    };
})();

// Make globally available
window.Templates = Templates;

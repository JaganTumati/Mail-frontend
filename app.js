/**
 * TempMail — Frontend Application
 * Communicates with the Spring Boot REST API to manage
 * temporary inboxes and display received emails.
 */

// ── State ──────────────────────────────────────────────────────────
let currentAddress  = null;   // Active temporary email address
let currentInboxId  = null;   // Database ID of the active inbox
let selectedEmailId = null;   // Currently open email ID
let searchTimer     = null;   // Debounce handle for search input
let refreshTimer    = null;   // Handle for the auto-refresh interval

// Backend base URL comes from config.js (loaded before this file in index.html).
// Falls back to relative paths if config.js wasn't loaded, for local same-origin testing.
const BASE_URL = window.API_BASE_URL || '';

const API = {
    generate:    () => `${BASE_URL}/api/inbox/generate`,
    emails:      (addr)    => `${BASE_URL}/api/inbox/${encodeURIComponent(addr)}/emails`,
    emailSearch: (addr, q) => `${BASE_URL}/api/inbox/${encodeURIComponent(addr)}/emails?search=${encodeURIComponent(q)}`,
    email:       (id)      => `${BASE_URL}/api/email/${id}`,
    deleteEmail: (id)      => `${BASE_URL}/api/email/${id}`,
    deleteInbox: (id)      => `${BASE_URL}/api/inbox/${id}`,
};

// ── Initialisation ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const savedAddress  = localStorage.getItem('tm_address');
    const savedInboxId  = localStorage.getItem('tm_inbox_id');

    if (savedAddress && savedInboxId) {
        currentAddress = savedAddress;
        currentInboxId = savedInboxId;
        document.getElementById('currentAddress').textContent = currentAddress;
        refreshEmails();
    } else {
        generateInbox();
    }

    // Auto-refresh inbox every 15 seconds
    refreshTimer = setInterval(refreshEmails, 15_000);
});

// ── Generate New Inbox ──────────────────────────────────────────────
async function generateInbox() {
    document.getElementById('currentAddress').textContent = 'Generating…';

    try {
        const res  = await fetch(API.generate(), { method: 'POST' });
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();

        currentAddress = data.address;
        currentInboxId = data.id;

        localStorage.setItem('tm_address',  currentAddress);
        localStorage.setItem('tm_inbox_id', currentInboxId);

        document.getElementById('currentAddress').textContent = currentAddress;
        document.getElementById('expiresInfo').textContent =
            'Expires: ' + formatExpiry(data.expiresAt);
        document.getElementById('unreadBadge').classList.add('hidden');

        clearEmailList();
        clearViewer();
        showToast('New address generated!');
    } catch (err) {
        console.error(err);
        document.getElementById('currentAddress').textContent = 'Error — retry';
        showToast('Failed to generate address.', true);
    }
}

// ── Refresh Emails ──────────────────────────────────────────────────
async function refreshEmails() {
    if (!currentAddress) return;

    const keyword = document.getElementById('searchInput').value.trim();
    const url     = keyword
        ? API.emailSearch(currentAddress, keyword)
        : API.emails(currentAddress);

    try {
        const res = await fetch(url);
        if (res.status === 404) { clearEmailList(); return; }
        if (!res.ok) throw new Error('Server error');

        const data = await res.json();

        // Update expiry label
        document.getElementById('expiresInfo').textContent =
            'Expires: ' + formatExpiry(data.expiresAt);

        // Update unread badge
        const badge = document.getElementById('unreadBadge');
        if (data.unread > 0) {
            badge.textContent = data.unread + ' unread';
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        renderEmailList(data.emails);
    } catch (err) {
        console.error('Refresh failed:', err);
    }
}

// ── Render Email List ───────────────────────────────────────────────
function renderEmailList(emails) {
    const list = document.getElementById('emailList');

    if (!emails || emails.length === 0) {
        list.innerHTML = '';
        list.appendChild(buildEmptyState());
        return;
    }

    list.innerHTML = emails.map(e => `
        <div class="email-item ${e.isRead ? '' : 'unread'} ${e.id === selectedEmailId ? 'active' : ''}"
             id="item-${e.id}"
             onclick="openEmail(${e.id})">
            <div class="ei-row1">
                <span class="ei-sender" title="${esc(e.sender)}">${esc(e.sender || 'Unknown Sender')}</span>
                <span class="ei-date">${formatDate(e.receivedAt)}</span>
            </div>
            <div class="ei-subject">${esc(e.subject || '(No subject)')}</div>
            <button class="delete-btn"
                    onclick="event.stopPropagation(); deleteEmail(${e.id})"
                    title="Delete this email">🗑 Delete</button>
        </div>
    `).join('');
}

function buildEmptyState() {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.id = 'emptyState';
    div.innerHTML = '<span>📭</span><p>No emails yet.<br/>Share your address and wait for mail!</p>';
    return div;
}

function clearEmailList() {
    const list = document.getElementById('emailList');
    list.innerHTML = '';
    list.appendChild(buildEmptyState());
}

// ── Open & Render Email ─────────────────────────────────────────────
async function openEmail(emailId) {
    selectedEmailId = emailId;

    // Highlight selected, un-bold unread marker
    document.querySelectorAll('.email-item').forEach(el => {
        el.classList.remove('active');
    });
    const item = document.getElementById('item-' + emailId);
    if (item) {
        item.classList.add('active');
        item.classList.remove('unread');
    }

    try {
        const res  = await fetch(API.email(emailId));
        if (!res.ok) throw new Error('Email not found');
        const data = await res.json();
        renderEmailViewer(data);

        // Update unread badge after marking as read
        refreshEmails();
    } catch (err) {
        showToast('Could not load email.', true);
    }
}

function renderEmailViewer(email) {
    const viewer = document.getElementById('emailViewer');

    // Prefer HTML body; fall back to plain text
    const bodyContent = email.bodyHtml
        ? `<iframe srcdoc="${esc(email.bodyHtml)}"
                   sandbox="allow-same-origin"
                   title="Email content"></iframe>`
        : `<pre>${esc(email.bodyText || '(This email has no content.)')}</pre>`;

    viewer.innerHTML = `
        <div class="email-header">
            <div class="email-subject-title">${esc(email.subject || '(No subject)')}</div>
            <div class="email-meta">
                <span><strong>From:</strong> ${esc(email.sender || 'Unknown')}</span>
                <span><strong>Date:</strong> ${formatDate(email.receivedAt)}</span>
            </div>
        </div>
        <div class="email-body">${bodyContent}</div>
    `;
}

function clearViewer() {
    document.getElementById('emailViewer').innerHTML = `
        <div class="viewer-placeholder">
            <span>📩</span>
            <p>Select an email to read it here</p>
        </div>`;
}

// ── Delete Email ────────────────────────────────────────────────────
async function deleteEmail(emailId) {
    try {
        await fetch(API.deleteEmail(emailId), { method: 'DELETE' });

        if (selectedEmailId === emailId) {
            clearViewer();
            selectedEmailId = null;
        }

        await refreshEmails();
        showToast('Email deleted.');
    } catch (err) {
        showToast('Could not delete email.', true);
    }
}

// ── Delete Inbox ────────────────────────────────────────────────────
async function deleteInbox() {
    if (!currentInboxId) return;
    if (!confirm('Delete this inbox and ALL its emails permanently?')) return;

    try {
        await fetch(API.deleteInbox(currentInboxId), { method: 'DELETE' });

        localStorage.removeItem('tm_address');
        localStorage.removeItem('tm_inbox_id');

        currentAddress  = null;
        currentInboxId  = null;
        selectedEmailId = null;

        document.getElementById('currentAddress').textContent = '—';
        document.getElementById('expiresInfo').textContent    = '';
        document.getElementById('unreadBadge').classList.add('hidden');

        clearEmailList();
        clearViewer();
        showToast('Inbox deleted. Generate a new address to continue.');
    } catch (err) {
        showToast('Could not delete inbox.', true);
    }
}

// ── Copy Address to Clipboard ───────────────────────────────────────
function copyAddress() {
    if (!currentAddress) return;
    navigator.clipboard.writeText(currentAddress)
        .then(()  => showToast('Address copied to clipboard!'))
        .catch(()  => showToast('Copy failed — please copy manually.', true));
}

// ── Search (debounced) ──────────────────────────────────────────────
function debounceSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshEmails, 350);
}

// ── Utility Helpers ─────────────────────────────────────────────────

/** HTML-escape a string to prevent XSS when injecting into innerHTML. */
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Format an ISO datetime string to a human-readable local date/time. */
function formatDate(isoStr) {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

/** Format expiry to a short time + date string. */
function formatExpiry(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
         + ' on '
         + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Show a temporary toast notification. */
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent    = msg;
    toast.style.background = isError ? '#ef4444' : '#6366f1';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3200);
}

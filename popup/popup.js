
// popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveButton');
    const deleteButton = document.getElementById('deleteButton');
    const messageDiv = document.getElementById('message');
    const togglePasswordButton = document.getElementById('togglePassword');

    // Load saved API key
    loadApiKey();

    // Toggle password visibility
    togglePasswordButton.addEventListener('click', () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
        togglePasswordButton.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
    });

    // Save API key
    saveButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showMessage('Please enter an API Key', 'error');
            return;
        }

        try {
            await chrome.storage.sync.set({ apiKey });
            showMessage('API Key saved successfully!', 'success');
        } catch (error) {
            showMessage('Save failed: ' + error.message, 'error');
        }
    });

    // Delete API key
    deleteButton.addEventListener('click', async () => {
        try {
            await chrome.storage.sync.remove('apiKey');
            apiKeyInput.value = '';
            showMessage('API Key deleted', 'success');
        } catch (error) {
            showMessage('Delete failed: ' + error.message, 'error');
        }
    });
});

// Load saved API key
async function loadApiKey() {
    const apiKeyInput = document.getElementById('apiKey');
    try {
        const { apiKey } = await chrome.storage.sync.get('apiKey');
        if (apiKey) {
            apiKeyInput.value = apiKey;
        }
    } catch (error) {
        showMessage('Failed to load API Key: ' + error.message, 'error');
    }
}

// Show message with auto-hide
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';

    // Auto hide after 3 seconds
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}
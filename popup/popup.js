// Mail Craft Popup JavaScript
// Handles both setup and working stages

class MailCraftPopup {
    constructor() {
        this.apiKey = '';
        this.currentTab = null;
        this.init();
    }

    async init() {
        // First, try to hide setup div immediately if API key exists
        this.quickCheckAndHideSetup();
        
        // Then do the full async check
        await this.checkSetupStatus();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Get current tab
        await this.getCurrentTab();
    }
    
    quickCheckAndHideSetup() {
        // Try to get API key synchronously first
        chrome.storage.sync.get(['apiKey'], (result) => {
            if (result.apiKey && result.apiKey.trim() !== '') {
                console.log('Mail Craft: Quick check - API key found, hiding setup');
                document.getElementById('setup-stage').style.display = 'none';
                document.getElementById('working-stage').style.display = 'block';
            }
        });
    }

    async checkSetupStatus() {
        try {
            const result = await chrome.storage.sync.get(['apiKey']);
            this.apiKey = result.apiKey || '';
            
            console.log('Mail Craft: API Key found:', this.apiKey);
            
            if (this.apiKey && this.apiKey.trim() !== '') {
                console.log('Mail Craft: Hiding setup, showing guide');
                this.showWorkingStage();
            } else {
                console.log('Mail Craft: No API key, showing setup');
                this.showSetupStage();
            }
        } catch (error) {
            console.error('Error checking setup status:', error);
            this.showSetupStage();
        }
    }

    showSetupStage() {
        document.getElementById('setup-stage').style.display = 'block';
        document.getElementById('working-stage').style.display = 'none';
    }

    showWorkingStage() {
        document.getElementById('setup-stage').style.display = 'none';
        document.getElementById('working-stage').style.display = 'block';
        this.updateUIForCurrentTab();
    }

    setupEventListeners() {
        // Setup stage events
        document.getElementById('saveApiKey').addEventListener('click', () => {
            this.saveApiKey();
        });

        document.getElementById('toggleApiKey').addEventListener('click', () => {
            this.toggleApiKeyVisibility();
        });

        // Guide stage events - no action buttons needed, just the change API key button

        document.getElementById('changeApiKey').addEventListener('click', () => {
            this.clearSetupAndShowSetup();
        });

        // Enter key to save API key
        document.getElementById('apiKey').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveApiKey();
            }
        });
    }

    async saveApiKey() {
        const apiKeyInput = document.getElementById('apiKey');
        const saveBtn = document.getElementById('saveApiKey');
        const btnText = saveBtn.querySelector('.btn-text');
        const btnLoading = saveBtn.querySelector('.btn-loading');
        
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showError('Please enter an API key');
            return;
        }

        if (!apiKey.startsWith('AIza')) {
            this.showError('Invalid API key format. Gemini keys start with "AIza"');
            return;
        }

        // Show loading state
        saveBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        try {
            // Validate API key
            const isValid = await this.validateApiKey(apiKey);
            
            if (!isValid) {
                this.showError('Invalid API key. Please check and try again.');
                return;
            }

            // Save to chrome storage
            await chrome.storage.sync.set({ apiKey });
            console.log("✅ API Key saved:", apiKey);

            this.apiKey = apiKey;
            this.showSuccess('API key saved successfully!');
            
            // Switch to working stage after a brief delay
            setTimeout(() => {
                this.showWorkingStage();
            }, 1500);
            
        } catch (error) {
            console.error("❌ Failed to save key:", error);
            this.showError('Failed to save API key. Please try again.');
        } finally {
            // Reset button state
            saveBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    async validateApiKey(apiKey) {
        try {
            // Send validation request to background script
            const response = await chrome.runtime.sendMessage({
                action: 'validateApiKey',
                apiKey: apiKey
            });
            
            return response.success && response.valid;
        } catch (error) {
            console.error('Error validating API key:', error);
            return false;
        }
    }

    toggleApiKeyVisibility() {
        const apiKeyInput = document.getElementById('apiKey');
        const toggleBtn = document.getElementById('toggleApiKey');
        
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleBtn.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleBtn.textContent = '👁️';
        }
    }

    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
        } catch (error) {
            console.error('Error getting current tab:', error);
        }
    }

    updateUIForCurrentTab() {
        chrome.storage.sync.get(['apiKey'], (result) => {
            console.log("🔍 Storage check:", result); // Debug

            if (result.apiKey && result.apiKey.trim() !== "") {
                this.apiKey = result.apiKey;
                this.showWorkingStage();
            } else {
                this.showSetupStage();
            }
        });
    }

    isEmailClient(url) {
        if (!url) return false;
        return url.includes('mail.google.com');
    }

    async clearSetupAndShowSetup() {
        try {
            await chrome.storage.sync.remove(['apiKey']);
            this.apiKey = '';
            this.showSetupStage();
        } catch (error) {
            console.error('Error clearing setup:', error);
            this.showSetupStage();
        }
    }

    // Removed applyToneToEmail and applyCustomPrompt functions
    // The extension now works directly in Gmail with the "Craft It" button

    updateStatus(message, type = 'success') {
        const statusElement = document.getElementById('status');
        const statusText = statusElement.querySelector('.status-text');
        const statusDot = statusElement.querySelector('.status-dot');

        // Remove existing classes
        statusElement.classList.remove('error', 'loading', 'success', 'warning');
        
        // Add new class
        statusElement.classList.add(type);

        // Update text
        statusText.textContent = message;

        // Update dot color
        switch (type) {
            case 'error':
                statusDot.style.background = '#e53e3e';
                break;
            case 'loading':
                statusDot.style.background = '#f6ad55';
                break;
            case 'warning':
                statusDot.style.background = '#ed8936';
                break;
            default:
                statusDot.style.background = '#38a169';
        }
    }

    showError(message) {
        // Create a simple error display for setup stage
        const existingError = document.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            background: #fed7d7;
            color: #c53030;
            padding: 10px;
            border-radius: 6px;
            margin-top: 15px;
            font-size: 14px;
            text-align: center;
        `;
        errorDiv.textContent = message;

        document.querySelector('.setup-card').appendChild(errorDiv);

        // Remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    showSuccess(message) {
        // Create a simple success display for setup stage
        const existingSuccess = document.querySelector('.success-message');
        if (existingSuccess) {
            existingSuccess.remove();
        }

        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.style.cssText = `
            background: #f0fff4;
            color: #2f855a;
            padding: 10px;
            border-radius: 6px;
            margin-top: 15px;
            font-size: 14px;
            text-align: center;
        `;
        successDiv.textContent = message;

        document.querySelector('.setup-card').appendChild(successDiv);
    }
}

// Check immediately when popup opens
console.log('Mail Craft: Popup script loaded, checking for API key...');

// Debug: Log all storage values
chrome.storage.sync.get(null, (res) => {
    console.log("📦 Current storage:", res);
});

chrome.storage.sync.get(['apiKey'], (result) => {
    console.log('Mail Craft: Immediate check result:', result);
    if (result.apiKey && result.apiKey.trim() !== '') {
        console.log('Mail Craft: API key found immediately, hiding setup');
        // Hide setup div immediately
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('setup-stage').style.display = 'none';
            document.getElementById('working-stage').style.display = 'block';
        });
    }
});

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Mail Craft: Popup DOM loaded, initializing...');
    new MailCraftPopup();
});
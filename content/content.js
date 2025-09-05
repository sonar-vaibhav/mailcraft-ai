// Mail Craft Content Script
// This runs ON Gmail pages and adds AI functionality

console.log('Mail Craft: Content script loaded!');
console.log('Mail Craft: Current URL:', window.location.href);
console.log('Mail Craft: Document ready state:', document.readyState);

// Test if we can find any elements
setTimeout(() => {
    console.log('Mail Craft: Testing element selectors...');
    console.log('Mail Craft: div[role="textbox"] found:', !!document.querySelector('div[role="textbox"]'));
    console.log('Mail Craft: input[name="subjectbox"] found:', !!document.querySelector('input[name="subjectbox"]'));
    console.log('Mail Craft: All divs with role="textbox":', document.querySelectorAll('div[role="textbox"]').length);
}, 3000);

class GmailAIAssistant {
    constructor() {
        console.log('Mail Craft: GmailAIAssistant constructor called');
        this.isInitialized = false;
        this.composeBox = null;
        this.subjectBox = null;
        this.aiButtons = null;
        this.init();
    }

    async init() {
        console.log('Mail Craft: init() called');
        // Wait for Gmail to load
        this.waitForGmail();
        
        // Set up message listener for popup communication
        this.setupMessageListener();
        
        // Set up keyboard shortcut listener
        this.setupKeyboardListener();
    }

    waitForGmail() {
        console.log('Mail Craft: waitForGmail() called');
        
        // Simple approach: just check for compose box and add button
        const addButtonIfNeeded = () => {
            const composeBox = document.querySelector('div[role="textbox"]');
            const subjectBox = document.querySelector('input[name="subjectbox"]');

            // Try to find the compose area container first, then the action table inside it
            let composeArea = null;
            if (composeBox) {
                composeArea = composeBox.closest('div[role="dialog  "], .nH, .AD, .aoI') || document;
            }
            const targetTable = (composeArea || document).querySelector('table.aoP.aoC[role="presentation"]')
                || document.querySelector('table[role="presentation"].aoP.aoC');

            console.log('Mail Craft: Compose box found:', !!composeBox);
            console.log('Mail Craft: Subject box found:', !!subjectBox);
            console.log('Mail Craft: Target table found:', !!targetTable);

            if (composeBox && subjectBox && targetTable) {
                // Check if button already exists within target table
                const existingButton = targetTable.querySelector('.mail-craft-rewrite-btn');
                
                if (!existingButton) {
                    console.log('Mail Craft: Adding AI button...');
                    this.addAIButtonAfterComposeBox(composeBox, targetTable);
                }
            }
        };

        // Check immediately
        addButtonIfNeeded();
        
        // Check every 3 seconds for new compose windows
        setInterval(addButtonIfNeeded, 3000);
    }

    addAIButtonAfterComposeBox(composeBox, targetContainer) {
        // Controls container
        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 10px 0;
            width: max-content;
        `;

        // Rewrite button
        const button = document.createElement('button');
        button.className = 'mail-craft-rewrite-btn';
        button.innerHTML = `
            <span class="ai-icon">🤖</span>
            <span class="button-text">Craft It</span>
        `;
        button.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            font-family: 'Google Sans', Roboto, Arial, sans-serif;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-1px)';
            button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        });
        button.addEventListener('click', () => {
            this.handleRewriteClick(composeBox);
        });

        // Tone select
        const toneSelect = document.createElement('select');
        toneSelect.className = 'mail-craft-tone-select';
        toneSelect.style.cssText = `
            height: 36px;
            padding: 6px 10px;
            border: 1px solid #dadce0;
            border-radius: 6px;
            background: #ffffff;
            color: #3c4043;
            font-size: 13px;
            cursor: pointer;
        `;

        const toneExplanations = {
            formal: 'Professional and respectful',
            friendly: 'Warm and approachable',
            concise: 'Short and to the point',
            persuasive: 'Convincing and action-oriented'
        };
        const addOption = (value, label) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            opt.title = toneExplanations[value];
            return opt;
        };
        toneSelect.appendChild(addOption('formal', 'Formal'));
        toneSelect.appendChild(addOption('friendly', 'Friendly'));
        toneSelect.appendChild(addOption('concise', 'Concise'));
        toneSelect.appendChild(addOption('persuasive', 'Persuasive'));

        this.selectedTone = 'formal';
        toneSelect.addEventListener('change', (e) => {
            this.selectedTone = e.target.value;
        });

        controls.appendChild(toneSelect);
        controls.appendChild(button);

        const container = targetContainer || composeBox.parentElement;
        container.appendChild(controls);
        console.log('Mail Craft: AI button + tone selector added successfully!');
    }

    handleRewriteClick(composeBox) {
        console.log('Mail Craft: Rewrite button clicked!');
        
        (async () => {
            try {
                // Collect subject and body
                const subjectBox = document.querySelector('input[name="subjectbox"]');
                const subject = subjectBox ? (subjectBox.value || '') : '';
                const body = composeBox.innerText || composeBox.textContent || '';

                console.log('Mail Craft: Subject:', subject);
                console.log('Mail Craft: Body:', body);

                if (!subject.trim() && !body.trim()) {
                    alert('Please write some text first!');
                    return;
                }

                // Extract optional custom prompt via !@# at end of body
                let customPrompt = '';
                const match = body.match(/!@#\s*(.+)$/);
                if (match) {
                    customPrompt = match[1].trim();
                }

                // Build text payload
                const textPayload = subject
                    ? `Subject: ${subject}\n\nBody: ${body}`
                    : body;

                // Get API key
                const { apiKey } = await chrome.storage.sync.get(['apiKey']);
                if (!apiKey) {
                    alert('Please set up your Gemini API key in the extension popup.');
                    return;
                }

                // Notify user
                this.showNotification('AI is rewriting your email...', 'loading');

                // Prefer a long-lived port to avoid context invalidation
                const response = await this.sendViaPort({
                    action: 'rewriteEmail',
                    text: textPayload,
                    customPrompt: customPrompt || undefined,
                    tone: customPrompt ? undefined : (this.selectedTone || 'formal'),
                    apiKey
                });

                console.log('Mail Craft: Response received:', response);
                
                if (response && response.success) {
                    console.log('Mail Craft: Success! Data to replace:', response.data);
                    this.replaceEmailText(response.data);
                    this.showNotification('Rewritten with AI', 'success');
                } else {
                    const err = (response && response.error) || 'Failed to rewrite email';
                    console.error('Mail Craft: Rewrite error:', err);
                    this.showNotification(err, 'error');
                }
            } catch (e) {
                console.error('Mail Craft: Unexpected error during rewrite:', e);
                this.showNotification('Unexpected error during rewrite', 'error');
            }
        })();
    }

    // Reliable message sender that handles MV3 service worker wakeups and context invalidation
    async sendMessageWithRetry(payload, retries = 1) {
        return await new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    console.error('Mail Craft: sendMessage timeout');
                    settled = true;
                    resolve({ success: false, error: 'AI service timeout. Please try again.' });
                }
            }, 20000);

            const attempt = (remaining) => {
                try {
                    chrome.runtime.sendMessage(payload, (resp) => {
                        const lastErr = chrome.runtime.lastError;
                        if (lastErr) {
                            const msg = String(lastErr.message || lastErr);
                            console.error('Mail Craft: sendMessage lastError:', msg);
                            if (remaining > 0 && (msg.includes('Extension context invalidated') || msg.includes('The message port closed') || msg.includes('Receiving end does not exist'))) {
                                // Retry once after a short delay to allow worker wakeup
                                return setTimeout(() => attempt(remaining - 1), 500);
                            }
                            if (!settled) {
                                settled = true;
                                clearTimeout(timer);
                                return resolve({ success: false, error: msg });
                            }
                            return;
                        }

                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            resolve(resp || { success: false, error: 'No response from background' });
                        }
                    });
                } catch (e) {
                    if (remaining > 0) {
                        return setTimeout(() => attempt(remaining - 1), 500);
                    }
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        resolve({ success: false, error: e?.message || 'Failed to send message' });
                    }
                }
            };

            attempt(retries);
        });
    }

    // Use long-lived Port to keep background alive across async work
    async sendViaPort(payload) {
        return await new Promise((resolve) => {
            const port = chrome.runtime.connect({ name: 'mail-craft-port' });
            const requestId = Math.random().toString(36).slice(2);
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    try { port.disconnect(); } catch (_) {}
                    resolve({ success: false, error: 'AI service timeout. Please try again.' });
                }
            }, 20000);

            const onMessage = (msg) => {
                if (msg?.requestId !== requestId) return;
                settled = true;
                clearTimeout(timer);
                try { port.onMessage.removeListener(onMessage); } catch (_) {}
                try { port.disconnect(); } catch (_) {}
                resolve(msg);
            };
            port.onMessage.addListener(onMessage);

            try {
                port.postMessage({ ...payload, requestId });
            } catch (e) {
                settled = true;
                clearTimeout(timer);
                try { port.onMessage.removeListener(onMessage); } catch (_) {}
                try { port.disconnect(); } catch (_) {}
                resolve({ success: false, error: e?.message || 'Failed to send via port' });
            }
        });
    }





    async handleAIButtonClick(tone) {
        console.log('Mail Craft: handleAIButtonClick called with tone:', tone);
        
        // Get current elements
        const composeBox = document.querySelector('div[role="textbox"]');
        const subjectBox = document.querySelector('input[name="subjectbox"]');
        
        if (!composeBox) {
            this.showNotification('Please open a compose window first', 'error');
            return;
        }

        // Get email text
        const subject = subjectBox ? (subjectBox.value || '') : '';
        const body = composeBox.innerText || composeBox.textContent || '';
        
        if (!subject.trim() && !body.trim()) {
            this.showNotification('Please write some text first', 'error');
            return;
        }

        // Build text payload
        const textPayload = subject
            ? `Subject: ${subject}\n\nBody: ${body}`
            : body;

        // Show loading state
        this.showNotification('AI is rewriting your email...', 'loading');

        try {
            // Get API key from storage
            const result = await chrome.storage.sync.get(['apiKey']);
            if (!result.apiKey) {
                this.showNotification('Please set up your API key in the extension popup', 'error');
                return;
            }

            // Send request via port
            const response = await this.sendViaPort({
                action: 'rewriteEmail',
                text: textPayload,
                tone: tone,
                apiKey: result.apiKey
            });

            console.log('Mail Craft: Tone response received:', response);

            if (response && response.success) {
                this.replaceEmailText(response.data);
                this.showNotification(`${tone.charAt(0).toUpperCase() + tone.slice(1)} tone applied!`, 'success');
            } else {
                const err = (response && response.error) || 'Failed to rewrite email';
                console.error('Mail Craft: Tone error:', err);
                this.showNotification(err, 'error');
            }
        } catch (error) {
            console.error('Mail Craft: Error applying tone:', error);
            this.showNotification('Error communicating with AI service', 'error');
        }
    }

    getEmailText() {
        if (!this.composeBox) return '';
        
        // Get subject text
        const subject = this.subjectBox ? (this.subjectBox.value || '') : '';
        
        // Get body text from compose box
        const body = this.composeBox.innerText || this.composeBox.textContent || '';
        
        // Combine subject and body for AI processing
        if (subject && body) {
            return `Subject: ${subject}\n\nBody: ${body}`;
        } else if (subject) {
            return `Subject: ${subject}`;
        } else {
            return body;
        }
    }

    replaceEmailText(newText) {
        console.log('Mail Craft: replaceEmailText called with:', newText);
        
        // Get current elements
        const composeBox = document.querySelector('div[role="textbox"]');
        const subjectBox = document.querySelector('input[name="subjectbox"]');
        
        console.log('Mail Craft: composeBox found:', !!composeBox);
        console.log('Mail Craft: subjectBox found:', !!subjectBox);
        
        if (!composeBox) {
            console.error('Mail Craft: No compose box found!');
            return;
        }

        // Check if the response contains both subject and body
        if (newText.includes('Subject:') && newText.includes('\n\n')) {
            // Parse format: "Subject: [subject]\n\n[body]" or "Subject: [subject]\n\nBody: [body]"
            const parts = newText.split('\n\n');
            const subjectPart = parts[0].replace('Subject:', '').trim();
            let bodyPart = parts.slice(1).join('\n\n').trim(); // Join remaining parts in case body has \n\n
            
            // Remove "Body:" prefix if it exists
            if (bodyPart.startsWith('Body:')) {
                bodyPart = bodyPart.replace('Body:', '').trim();
            }
            
            console.log('Mail Craft: Parsed subject:', subjectPart);
            console.log('Mail Craft: Parsed body:', bodyPart);
            
            // Update subject if subject box exists
            if (subjectBox && subjectPart) {
                subjectBox.value = subjectPart;
                subjectBox.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('Mail Craft: Subject updated');
            }
            
            // Update body with proper formatting
            composeBox.innerHTML = '';
            // Convert newlines to <br> tags for proper formatting
            const formattedBody = bodyPart.replace(/\n/g, '<br>');
            composeBox.innerHTML = formattedBody;
            composeBox.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('Mail Craft: Body updated with formatting');
        } else {
            // Just update the body with proper formatting
            console.log('Mail Craft: Updating body only with:', newText);
            composeBox.innerHTML = '';
            // Convert newlines to <br> tags for proper formatting
            const formattedText = newText.replace(/\n/g, '<br>');
            composeBox.innerHTML = formattedText;
            composeBox.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('Mail Craft: Body updated (single text) with formatting');
        }
    }

    setupKeyboardListener() {
        document.addEventListener('keydown', (event) => {
            // Check for !@# shortcut
            if (event.key === '#' && event.shiftKey) {
                // Check if previous characters are !@
                const text = this.getEmailText();
                if (text.endsWith('!@')) {
                    event.preventDefault();
                    this.handleShortcutPrompt();
                }
            }
        });
    }

    async handleShortcutPrompt() {
        if (!this.composeBox) return;

        // Remove the !@# from the text
        const currentText = this.getEmailText();
        const textWithoutShortcut = currentText.slice(0, -3); // Remove !@#
        
        if (!textWithoutShortcut.trim()) {
            this.showNotification('Please write some text before using the shortcut', 'error');
            return;
        }

        // Get custom prompt from user
        const userPrompt = window.prompt('Enter your custom prompt (e.g., "make this more professional"):');
        if (!userPrompt) return;

        // Show loading state
        this.showNotification('AI is processing your request...', 'loading');

        try {
            // Get API key from storage
            const result = await chrome.storage.sync.get(['apiKey']);
            if (!result.apiKey) {
                this.showNotification('Please set up your API key in the extension popup', 'error');
                return;
            }

            // Send request to background script
            const response = await chrome.runtime.sendMessage({
                action: 'rewriteEmail',
                text: textWithoutShortcut,
                customPrompt: userPrompt,
                apiKey: result.apiKey
            });

            if (response.success) {
                this.replaceEmailText(response.data);
                this.showNotification('Custom prompt applied!', 'success');
            } else {
                this.showNotification(response.error || 'Failed to process request', 'error');
            }
        } catch (error) {
            console.error('Error processing shortcut:', error);
            this.showNotification('Error communicating with AI service', 'error');
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Mail Craft: Message received in content script:', request);
            
            switch (request.action) {
                case 'applyTone':
                    console.log('Mail Craft: Applying tone:', request.tone);
                    this.handleAIButtonClick(request.tone);
                    sendResponse({ success: true });
                    break;
                
                case 'applyCustomPrompt':
                    console.log('Mail Craft: Applying custom prompt:', request.prompt);
                    this.handleCustomPrompt(request.prompt);
                    sendResponse({ success: true });
                    break;
                
                default:
                    console.log('Mail Craft: Unknown action:', request.action);
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        });
    }

    async handleCustomPrompt(prompt) {
        console.log('Mail Craft: handleCustomPrompt called with prompt:', prompt);
        
        // Get current elements
        const composeBox = document.querySelector('div[role="textbox"]');
        const subjectBox = document.querySelector('input[name="subjectbox"]');
        
        if (!composeBox) {
            this.showNotification('Please open a compose window first', 'error');
            return;
        }

        // Get email text
        const subject = subjectBox ? (subjectBox.value || '') : '';
        const body = composeBox.innerText || composeBox.textContent || '';
        
        if (!subject.trim() && !body.trim()) {
            this.showNotification('Please write some text first', 'error');
            return;
        }

        // Build text payload
        const textPayload = subject
            ? `Subject: ${subject}\n\nBody: ${body}`
            : body;

        // Show loading state
        this.showNotification('AI is processing your request...', 'loading');

        try {
            // Get API key from storage
            const result = await chrome.storage.sync.get(['apiKey']);
            if (!result.apiKey) {
                this.showNotification('Please set up your API key in the extension popup', 'error');
                return;
            }

            // Send request via port
            const response = await this.sendViaPort({
                action: 'rewriteEmail',
                text: textPayload,
                customPrompt: prompt,
                apiKey: result.apiKey
            });

            console.log('Mail Craft: Custom prompt response received:', response);

            if (response && response.success) {
                this.replaceEmailText(response.data);
                this.showNotification('Custom prompt applied!', 'success');
            } else {
                const err = (response && response.error) || 'Failed to process request';
                console.error('Mail Craft: Custom prompt error:', err);
                this.showNotification(err, 'error');
            }
        } catch (error) {
            console.error('Mail Craft: Error processing custom prompt:', error);
            this.showNotification('Error communicating with AI service', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.querySelector('.mail-craft-notification');
        if (existing) {
            existing.remove();
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'mail-craft-notification';
        
        const colors = {
            success: '#34a853',
            error: '#ea4335',
            loading: '#fbbc04',
            info: '#1a73e8'
        };

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            max-width: 300px;
            word-wrap: break-word;
        `;

        notification.textContent = message;
        document.body.appendChild(notification);

        // Auto-remove after 3 seconds (except for loading)
        if (type !== 'loading') {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 3000);
        }
    }
}

// Initialize the Gmail AI Assistant
console.log('Mail Craft: About to initialize GmailAIAssistant...');
try {
    new GmailAIAssistant();
    console.log('Mail Craft: GmailAIAssistant initialized successfully!');
} catch (error) {
    console.error('Mail Craft: Error initializing GmailAIAssistant:', error);
}

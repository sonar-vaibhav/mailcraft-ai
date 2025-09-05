// Background Service Worker - Secure API Handler
// This runs in the background and handles all API calls

class SecureAPIHandler {
    constructor() {
        this.setupMessageListener();
    }

    setupMessageListener() {
        // Listen for messages from content scripts and popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try { console.log('[BG] onMessage action:', request?.action); } catch (_) {}
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Support long-lived connections to avoid context invalidation between request/response
        chrome.runtime.onConnect.addListener((port) => {
            if (!port) return;
            try { console.log('[BG] onConnect:', port.name); } catch (_) {}
            port.onMessage.addListener(async (msg) => {
                const requestId = msg?.requestId;
                const action = msg?.action;
                try {
                    switch (action) {
                        case 'ping':
                            port.postMessage({ requestId, success: true, ts: Date.now() });
                            break;
                        case 'rewriteEmail': {
                            const data = await this.rewriteEmail(msg);
                            port.postMessage({ requestId, success: true, data });
                            break;
                        }
                        default:
                            port.postMessage({ requestId, success: false, error: 'Unknown action' });
                    }
                } catch (err) {
                    try { console.error('[BG] port handler error:', err?.message || err); } catch (_) {}
                    port.postMessage({ requestId, success: false, error: err?.message || String(err) });
                }
            });
        });
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'rewriteEmail':
                    const result = await this.rewriteEmail(request);
                    sendResponse({ success: true, data: result });
                    break;
                
                case 'ping':
                    sendResponse({ success: true, ts: Date.now() });
                    break;
                
                case 'validateApiKey':
                    const isValid = await this.validateApiKey(request.apiKey);
                    sendResponse({ success: true, valid: isValid });
                    break;
                
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async rewriteEmail(request) {
        const { text: emailText, tone, customPrompt, apiKey } = request;
        try { console.log('[BG] rewriteEmail start. text length:', (emailText||'').length, 'tone:', tone, 'hasPrompt:', !!customPrompt); } catch (_) {}
        
        // Validate API key format
        if (!this.isValidApiKeyFormat(apiKey)) {
            throw new Error('Invalid API key format');
        }

        // Create the prompt based on tone or custom prompt (STRICT OUTPUT FORMAT)
        let prompt;
        if (customPrompt) {
            prompt = `Rewrite the email according to these instructions: "${customPrompt}". Return ONLY the following two sections and nothing else. Maintain paragraph breaks and list formatting in the body.\n\nSubject: <subject goes here>\n\nBody: <body goes here>\n\nRules:\n- Do not include explanations, notes, markdown headings, or extra commentary outside of Subject/Body.\n- Always include both Subject and Body.\n- Preserve essential details, names, paragraph breaks, and lists.\n\nEmail to rewrite:\n${emailText}`;
        } else {
            prompt = this.getTonePrompt(tone, emailText);
        }

        // Make API call to Gemini (use a supported model) with retry/backoff on 429/503
        const requestBody = {
            contents: [{
                parts: [{ text: `You are an expert email writing assistant. Always respond in the STRICT format: Subject: ...\n\nBody: ... with no extra commentary. Preserve paragraph breaks and list formatting in the body.\n\n${prompt}` }]
            }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 700,
            }
        };

        const response = await this.fetchGeminiWithRetry(apiKey, requestBody, 3);

        if (!response.ok) {
            let details = '';
            try {
                const errJson = await response.json();
                details = errJson?.error?.message || JSON.stringify(errJson);
            } catch (_) {
                try { details = await response.text(); } catch (_) { /* ignore */ }
            }
            try { console.error('[BG] Gemini API error', response.status, details); } catch (_) {}
            // Provide friendly message for overload/ratelimit
            if (response.status === 503) {
                throw new Error('AI service is temporarily overloaded. Please try again in a few seconds.');
            }
            if (response.status === 429) {
                throw new Error('Rate limit reached. Please wait a moment and try again.');
            }
            throw new Error(`API Error (${response.status}): ${details || 'Unknown error'}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            throw new Error('Failed to parse Gemini response');
        }

        // Extract text robustly
        const candidate = (data && data.candidates && data.candidates[0]) || null;
        const parts = candidate && candidate.content && candidate.content.parts;
        const generatedText = Array.isArray(parts)
            ? parts.map(p => p?.text || '').join('\n').trim()
            : '';

        if (!generatedText) {
            try { console.error('[BG] Empty Gemini response payload:', JSON.stringify(data).slice(0, 500)); } catch (_) {}
            throw new Error('Empty response from Gemini');
        }

        const cleaned = this.enforceSubjectBodyFormat(generatedText);
        try { console.log('[BG] rewriteEmail success. chars:', cleaned.length); } catch (_) {}
        return cleaned;
    }

    async validateApiKey(apiKey) {
        if (!this.isValidApiKeyFormat(apiKey)) {
            return false;
        }

        try {
            // Make a simple API call to validate the Gemini key
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    isValidApiKeyFormat(apiKey) {
        // Gemini API keys are typically 39 characters long and contain alphanumeric characters
        return apiKey && apiKey.length >= 35 && /^[A-Za-z0-9_-]+$/.test(apiKey);
    }

    getTonePrompt(tone, text) {
        const commonRules = `Return ONLY this exact format and nothing else:\n\nSubject: <subject goes here>\n\nBody: <body goes here>\n\nRules:\n- Do not include explanations, notes, markdown, headings, or extra lines.\n- Always include both Subject and Body.`;
        const tonePrompts = {
            formal: `Rewrite this email in a formal, professional tone while maintaining the original meaning. ${commonRules}\n\nEmail to rewrite:\n${text}`,
            friendly: `Rewrite this email in a friendly, warm tone while maintaining the original meaning. ${commonRules}\n\nEmail to rewrite:\n${text}`,
            concise: `Rewrite this email to be more concise and to the point while maintaining all important information. ${commonRules}\n\nEmail to rewrite:\n${text}`,
            persuasive: `Rewrite this email to be more persuasive and compelling while maintaining the original meaning. ${commonRules}\n\nEmail to rewrite:\n${text}`
        };

        return tonePrompts[tone] || tonePrompts.formal;
    }

    // Fetch with retries/backoff for transient errors (429/503, network/timeout)
    async fetchGeminiWithRetry(apiKey, body, maxAttempts = 3) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        let attempt = 0;
        let lastError = null;
        while (attempt < maxAttempts) {
            attempt += 1;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                // Retry on 429/503
                if (resp.status === 429 || resp.status === 503) {
                    lastError = new Error(`Transient error ${resp.status}`);
                    // Exponential backoff with jitter
                    const base = 500 * Math.pow(2, attempt - 1);
                    const jitter = Math.floor(Math.random() * 250);
                    await this.sleep(base + jitter);
                    continue;
                }
                return resp;
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                // Retry on abort or likely transient network errors
                if (err?.name === 'AbortError' || /NetworkError|Failed to fetch/i.test(String(err?.message || err))) {
                    const base = 500 * Math.pow(2, attempt - 1);
                    const jitter = Math.floor(Math.random() * 250);
                    await this.sleep(base + jitter);
                    continue;
                }
                break;
            }
        }
        if (lastError?.name === 'AbortError') {
            throw new Error('Gemini request timed out (20s)');
        }
        throw new Error(lastError?.message || 'Failed to reach AI service');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Ensure output strictly follows "Subject:" and "Body:" format, stripping extras
    enforceSubjectBodyFormat(rawText) {
        if (!rawText) return '';
        const text = String(rawText).replace(/\r/g, '').trim();

        // Try to extract subject and body using labels
        const subjectMatch = text.match(/Subject:\s*(.*)/i);
        let subject = subjectMatch ? subjectMatch[1].trim() : '';

        let body = '';
        // Prefer split by two newlines after Subject: line
        if (subjectMatch) {
            const afterSubject = text.slice(text.indexOf(subjectMatch[0]) + subjectMatch[0].length).replace(/^\n+/, '');
            // Look for Body: label first
            const bodyLabelMatch = afterSubject.match(/Body:\s*([\s\S]*)/i);
            body = bodyLabelMatch ? bodyLabelMatch[1].trim() : afterSubject.trim();
        } else {
            // Fallback: try markers "Body:" only
            const bodyOnly = text.match(/Body:\s*([\s\S]*)/i);
            if (bodyOnly) {
                body = bodyOnly[1].trim();
            } else {
                // Final fallback: treat full text as body and empty subject
                body = text;
            }
        }

        // Remove any trailing sections like "Changes Made" or markdown headings
        body = body.replace(/\n\*\*Changes[\s\S]*/i, '').replace(/\n#+\s.*$/gm, '').trim();

        // Constrain whitespace lightly: preserve paragraph breaks and lists
        subject = subject.replace(/\s+/g, ' ').trim();
        // Keep multiple newlines (paragraphs) and list markers; just trim trailing spaces on lines
        body = body
            .split('\n')
            .map(line => line.replace(/\s+$/g, ''))
            .join('\n')
            .trim();

        // Ensure both are present
        if (!subject) {
            // Try to synthesize a short subject from first line of body
            const firstLine = (body.split(/\n/)[0] || '').trim();
            subject = firstLine.slice(0, 100);
        }

        return `Subject: ${subject}\n\nBody: ${body}`.trim();
    }
}

// Initialize the secure API handler
new SecureAPIHandler();
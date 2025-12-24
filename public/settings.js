const settingsForm = document.getElementById('settings-form');
const saveBtn = document.getElementById('save-settings-btn');
const messageDiv = document.getElementById('settings-message');
const authSection = document.getElementById('auth-section');
const manualTokenSection = document.getElementById('manual-token-section');

async function checkAuthStatus() {
  try {
    const response = await fetch('/auth/status');
    const data = await response.json();
    
    if (data.isAzureConnected) {
      authSection.innerHTML = `
        <div class="auth-card connected">
          <span class="icon">✅</span>
          <div>
            <strong>Connected to Azure</strong>
            <p>Logged in as ${data.user.name || data.user.email}</p>
          </div>
          <a href="/auth/logout" class="disconnect-btn">Disconnect</a>
        </div>
      `;
      
      if (manualTokenSection) manualTokenSection.style.display = 'none'; 
      
      // Update Service Toggle
      const toggle = document.getElementById('service-toggle');
      const statusText = document.getElementById('service-status-text');
      
      if (toggle && statusText) {
        toggle.checked = data.isActive;
        statusText.textContent = data.isActive ? 'Service Active' : 'Service Disabled';
        statusText.className = data.isActive ? 'status-text active' : 'status-text disabled';
        
        // Remove old listener to prevent duplicates if called multiple times
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        
        newToggle.addEventListener('change', async (e) => {
          const isActive = e.target.checked;
          statusText.textContent = isActive ? 'Service Active' : 'Service Disabled';
          statusText.className = isActive ? 'status-text active' : 'status-text disabled';
          
          try {
            await fetch('/api/user/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isActive })
            });
          } catch (err) {
            console.error('Error toggling service:', err);
            e.target.checked = !isActive; // Revert on error
            statusText.textContent = !isActive ? 'Service Active' : 'Service Disabled';
            statusText.className = !isActive ? 'status-text active' : 'status-text disabled';
          }
        });
      }
      
    } else {
      authSection.innerHTML = `
        <div class="auth-card disconnected">
          <span class="icon">⚠️</span>
          <div>
            <strong>Not Connected to Azure</strong>
            <p>Connect your Azure DevOps account to get started.</p>
          </div>
          <a href="/auth/azure" class="azure-btn">
            <svg class="azure-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5.4 17.6l4.4-11.4h4.6l-2.6 3.8 4.8 7.6h-5l-2.6-5-3.6 5z"/></svg>
            Connect with Azure
          </a>
        </div>
      `;
      if (manualTokenSection) manualTokenSection.style.display = 'block';
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
  }
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    if (response.status === 401) return; // Not logged in
    
    const settings = await response.json();
    
    // Email List Logic
    const emailListContainer = document.getElementById('email-list');
    const hiddenEmailInput = document.getElementById('notification_emails');
    const newEmailInput = document.getElementById('new-email-input');
    const addEmailBtn = document.getElementById('add-email-btn');
    
    let emails = settings.notification_emails ? settings.notification_emails.split(',').map(e => e.trim()).filter(e => e) : [];
    
    function renderEmails() {
      emailListContainer.innerHTML = '';
      emails.forEach((email, index) => {
        const li = document.createElement('li');
        li.className = 'email-item';
        li.innerHTML = `
          <span>${email}</span>
          <button type="button" class="remove-email-btn" data-index="${index}">&times;</button>
        `;
        emailListContainer.appendChild(li);
      });
      hiddenEmailInput.value = emails.join(',');
    }
    
    function addEmail() {
      const email = newEmailInput.value.trim();
      if (email && email.includes('@')) {
        if (!emails.includes(email)) {
          emails.push(email);
          renderEmails();
          newEmailInput.value = '';
        } else {
          alert('Email already exists in the list.');
        }
      } else {
        alert('Please enter a valid email address.');
      }
    }
    
    if (addEmailBtn) {
      // Remove existing listeners to avoid duplicates if loadSettings is called multiple times
      const newAddBtn = addEmailBtn.cloneNode(true);
      addEmailBtn.parentNode.replaceChild(newAddBtn, addEmailBtn);
      
      newAddBtn.addEventListener('click', addEmail);
      
      // Allow Enter key to add email
      newEmailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addEmail();
        }
      });
    }
    
    // Event delegation for remove buttons
    emailListContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-email-btn')) {
        const index = parseInt(e.target.getAttribute('data-index'));
        emails.splice(index, 1);
        renderEmails();
      }
    });

    renderEmails();
    
    const autoDetect = document.getElementById('auto_detect_developer');
    if (autoDetect) autoDetect.checked = settings.auto_detect_developer === 1;
    
    const modelSelect = document.getElementById('ai_model');
    if (modelSelect) modelSelect.value = settings.ai_model || 'gpt-4o';
    
    const deepThinking = document.getElementById('deep_thinking');
    if (deepThinking) deepThinking.checked = settings.deep_thinking === 1;

    const sendEmails = document.getElementById('send_emails');
    const emailContainer = document.getElementById('email-settings-container');

    if (sendEmails) {
      sendEmails.checked = settings.send_emails === 1;
      
      // Initial visibility
      if (emailContainer) {
        emailContainer.style.display = sendEmails.checked ? 'block' : 'none';
      }

      // Toggle listener
      sendEmails.addEventListener('change', (e) => {
        if (emailContainer) {
          emailContainer.style.display = e.target.checked ? 'block' : 'none';
        }
      });
    }

  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

if (saveBtn) {
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    messageDiv.textContent = '';
    messageDiv.className = '';

    try {
      const notification_emails = document.getElementById('notification_emails').value;
      const auto_detect_developer = document.getElementById('auto_detect_developer').checked;
      const ai_model = document.getElementById('ai_model').value;
      const deep_thinking = document.getElementById('deep_thinking').checked;
      const send_emails = document.getElementById('send_emails').checked;
      
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_emails,
          auto_detect_developer,
          ai_model,
          deep_thinking,
          send_emails
        })
      });

      messageDiv.textContent = 'Settings saved successfully!';
      messageDiv.className = 'success';
      
      await loadSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      messageDiv.textContent = 'Error saving settings.';
      messageDiv.className = 'error';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  });
}

// Load settings and auth status on page load
loadSettings();
checkAuthStatus();

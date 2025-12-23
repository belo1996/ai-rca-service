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
        statusText.style.color = data.isActive ? 'var(--success)' : 'var(--text-secondary)';
        
        // Remove old listener to prevent duplicates if called multiple times
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        
        newToggle.addEventListener('change', async (e) => {
          const isActive = e.target.checked;
          statusText.textContent = isActive ? 'Service Active' : 'Service Disabled';
          statusText.style.color = isActive ? 'var(--success)' : 'var(--text-secondary)';
          
          try {
            await fetch('/api/user/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isActive })
            });
          } catch (err) {
            console.error('Error toggling service:', err);
            e.target.checked = !isActive; // Revert on error
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
    const response = await fetch('/api/config');
    const configs = await response.json();
    
    configs.forEach(config => {
      const input = document.getElementById(config.key);
      if (input) {
        input.value = config.value;
      }
    });
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSetting(key, value, encrypted = false) {
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, encrypted }),
  });
}

if (saveBtn) {
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    messageDiv.textContent = '';
    messageDiv.className = '';

    try {
      const developerEmail = document.getElementById('DEVELOPER_EMAIL').value;
      
      if (developerEmail) {
        await saveSetting('DEVELOPER_EMAIL', developerEmail, false);
      }

      messageDiv.textContent = 'Settings saved successfully!';
      messageDiv.className = 'success';
      
      // Reload to show masked values
      await loadSettings();
      await checkAuthStatus(); // Refresh auth status UI
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

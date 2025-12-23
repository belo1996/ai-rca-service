const repoList = document.getElementById('repo-list');
const fetchReposBtn = document.getElementById('fetch-repos-btn');
const connectRepoBtn = document.getElementById('connect-repo-btn');
const repoSelect = document.getElementById('repo-select');
const repoSelectContainer = document.getElementById('repo-select-container');
const addRepoMessage = document.getElementById('add-repo-message');
const currentPlanBadge = document.getElementById('current-plan-badge');

async function loadDashboard() {
  await loadSubscription();
  await loadConnectedRepos();
}

async function loadSubscription() {
  try {
    const res = await fetch('/api/subscription');
    const sub = await res.json();
    if (currentPlanBadge) {
      currentPlanBadge.textContent = `${sub.plan_id.toUpperCase()} PLAN`;
    }
  } catch (e) {
    console.error('Error loading subscription', e);
  }
}

async function loadConnectedRepos() {
  try {
    const res = await fetch('/api/repos');
    if (res.status === 401) return; // Not logged in
    const repos = await res.json();
    
    repoList.innerHTML = repos.length ? repos.map(repo => `
      <div class="repo-card">
        <div>
          <span class="repo-name">${repo.name}</span>
          <span class="repo-status">Active (Webhook: ${repo.webhook_id})</span>
        </div>
        <button class="secondary-btn danger-btn" onclick="disconnectRepo('${repo.id}')">Disconnect</button>
      </div>
    `).join('') : '<p>No repositories connected.</p>';
  } catch (e) {
    console.error('Error loading repos', e);
  }
}

if (fetchReposBtn) {
  fetchReposBtn.addEventListener('click', async () => {
    const orgUrl = document.getElementById('saas-org-url').value;
    if (!orgUrl) return alert('Please enter Org URL');
    
    fetchReposBtn.textContent = 'Fetching...';
    try {
      const res = await fetch(`/api/azure/repos?orgUrl=${encodeURIComponent(orgUrl)}`);
      const repos = await res.json();
      
      repoSelect.innerHTML = '<option value="">Select a repository...</option>' + 
        repos.map(r => `<option value="${r.id}" data-name="${r.name}" data-project-id="${r.projectId}">${r.name}</option>`).join('');
      
      repoSelectContainer.style.display = 'block';
    } catch (e) {
      alert('Failed to fetch repos. Ensure you are connected via Azure AD.');
    } finally {
      fetchReposBtn.textContent = 'Fetch Repos';
    }
  });
}

if (connectRepoBtn) {
  connectRepoBtn.addEventListener('click', async () => {
    const orgUrl = document.getElementById('saas-org-url').value;
    const repoId = repoSelect.value;
    const repoName = repoSelect.options[repoSelect.selectedIndex].dataset.name;
    const projectId = repoSelect.options[repoSelect.selectedIndex].dataset.projectId;
    
    if (!repoId) return;

    connectRepoBtn.disabled = true;
    connectRepoBtn.textContent = 'Connecting...';
    addRepoMessage.textContent = '';

    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgUrl, repoId, repoName, projectId })
      });
      
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      addRepoMessage.textContent = 'Repository connected successfully!';
      addRepoMessage.className = 'success';
      loadConnectedRepos();
      repoSelectContainer.style.display = 'none';
    } catch (e) {
      addRepoMessage.textContent = e.message;
      addRepoMessage.className = 'error';
    } finally {
      connectRepoBtn.disabled = false;
      connectRepoBtn.textContent = 'Connect';
    }
  });
}

async function upgradeTo(planId) {
  if (!confirm(`Upgrade to ${planId} plan?`)) return;
  
  try {
    await fetch('/api/subscription/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId })
    });
    alert('Plan updated!');
    loadSubscription();
  } catch (e) {
    alert('Error upgrading plan');
  }
}

// Expose for onclick
window.upgradeTo = upgradeTo;

async function disconnectRepo(repoId) {
  if (!confirm('Are you sure you want to disconnect this repository? This will remove the webhook.')) return;
  
  try {
    const res = await fetch(`/api/repos/${repoId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    loadConnectedRepos();
  } catch (e) {
    alert('Failed to disconnect repository: ' + e.message);
  }
}
window.disconnectRepo = disconnectRepo;

// Load on start
loadDashboard();

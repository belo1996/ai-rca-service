const logsContainer = document.getElementById('logs-container');

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString();
}

function createLogElement(log) {
  const div = document.createElement('div');
  div.className = `log-entry ${log.level}`;
  
  const header = document.createElement('div');
  header.className = 'log-header';
  header.innerHTML = `
    <span class="timestamp">${formatTime(log.timestamp)}</span>
    <span class="level">${log.level.toUpperCase()}</span>
  `;
  
  const message = document.createElement('div');
  message.className = 'log-message';
  message.textContent = log.message;
  
  div.appendChild(header);
  div.appendChild(message);
  
  if (log.details) {
    const details = document.createElement('div');
    details.className = 'log-details';
    details.textContent = typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details;
    div.appendChild(details);
  }
  
  return div;
}

async function fetchLogs() {
  try {
    const response = await fetch('/api/logs');
    const logs = await response.json();
    
    if (logs.length === 0) {
      logsContainer.innerHTML = '<p class="loading">No logs yet.</p>';
      return;
    }
    
    logsContainer.innerHTML = '';
    logs.forEach(log => {
      logsContainer.appendChild(createLogElement(log));
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    logsContainer.innerHTML = '<p class="loading" style="color: var(--error)">Error connecting to service.</p>';
  }
}

// Check Authentication on Load
async function checkAuth() {
  try {
    const res = await fetch('/auth/status');
    const data = await res.json();
    if (!data.isAuthenticated) {
      window.location.href = '/login.html';
    }
  } catch (e) {
    console.error('Auth check failed', e);
  }
}

// Initial fetch
checkAuth();
fetchLogs();

// Poll every 3 seconds
setInterval(fetchLogs, 10000);

async function clearLogs() {
  try {
    await fetch('/api/logs', { method: 'DELETE' });
    fetchLogs();
  } catch (e) {
    console.error('Error clearing logs', e);
  }
}
window.clearLogs = clearLogs;

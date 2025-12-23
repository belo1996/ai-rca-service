export interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'warn';
  message: string;
  details?: any;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 100;

export const addLog = (level: 'info' | 'error' | 'warn', message: string, details?: any) => {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    details,
  };
  logs.unshift(entry); // Add to beginning..
  if (logs.length > MAX_LOGS) {
    logs.pop();
  }
  
  // Also log to console
  if (level === 'error') {
    console.error(message, details || '');
  } else if (level === 'warn') {
    console.warn(message, details || '');
  } else {
    console.log(message, details || '');
  }
};

export const getLogs = () => logs;

import { getPullRequestDiff, getCommitHistory, postComment, getUserEmail, getWorkItems, postWorkItemComment, updateWorkItem, getPullRequestComments, getPreviousCommits } from './gitService';
import { generateRCA } from './aiService';
import { sendRcaEmail } from './emailService';
import { addLog } from './logService';
import { getRepository, getUser, getSettings } from './dbService';
import { getValidAccessToken } from './authService';
import { getConfig } from './configService';

export const analyzePullRequest = async (payload: any) => {
  const pr = payload.resource;
  const repo = pr.repository;
  
  const repoId = repo.id;
  const repoName = repo.name;
  const pullRequestId = pr.pullRequestId;
  const project = repo.project?.name;
  
  // Azure DevOps PR URL
  const prUrl = `${repo.webUrl}/pullrequest/${pullRequestId}`;
  
  const author = pr.createdBy;
  const authorName = author.displayName;
  const authorEmail = author.uniqueName || author.id; // uniqueName is usually email in Azure AD

  addLog('info', `Starting RCA for ${repoName} PR #${pullRequestId}`);

  // 1. Get Repository Owner & Token
  const dbRepo = getRepository(repoId);
  if (!dbRepo || !dbRepo.user_id) {
    throw new Error(`Repository ${repoId} not found in DB or has no owner.`);
  }

  const user = getUser(dbRepo.user_id);
  if (user && user.is_active === 0) {
    addLog('warn', `Service is disabled for user ${user.name} (${user.id}). Skipping RCA.`);
    return;
  }

  const token = await getValidAccessToken(dbRepo.user_id);
  if (!token) {
    throw new Error(`Could not get access token for user ${dbRepo.user_id}`);
  }

  // Construct Org URL from repo URL
  // repo.webUrl is like https://dev.azure.com/org/project/_git/repo
  // We need https://dev.azure.com/org
  const orgUrlMatch = repo.webUrl.match(/(https:\/\/dev\.azure\.com\/[^\/]+)/) || repo.webUrl.match(/(https:\/\/[^\/]+\.visualstudio\.com)/);
  const orgUrl = orgUrlMatch ? orgUrlMatch[1] : null;

  if (!orgUrl) {
    throw new Error(`Could not parse Org URL from ${repo.webUrl}`);
  }

  // 2. Get the Diff
  const diff = await getPullRequestDiff(repoId, pullRequestId, token, orgUrl, project);
  
  // 3. Get Commit History (context)
  const commits = await getCommitHistory(repoId, pullRequestId, token, orgUrl, project);

  // 3.5 Get Settings & Comments (if Deep Thinking is on)
  const settings = getSettings(dbRepo.user_id);
  let comments: string[] = [];
  let previousCommits: any[] = [];
  
  if (settings.deep_thinking) {
    addLog('info', `Deep Thinking enabled. Fetching PR comments and history...`);
    comments = await getPullRequestComments(repoId, pullRequestId, token, orgUrl, project);
    
    // Fetch previous commits from target branch
    const targetRef = pr.targetRefName; // e.g. refs/heads/main
    if (targetRef) {
      previousCommits = await getPreviousCommits(repoId, targetRef, token, orgUrl, project);
    }
  }

  // 4. AI Analysis
  const rcaReport = await generateRCA(diff, commits, {
    model: settings.ai_model,
    deepThinking: !!settings.deep_thinking,
    comments,
    previousCommits
  });

  // 4.5. Prepend Developer Mention
  let finalReport = rcaReport;
  if (settings.auto_detect_developer && authorEmail && authorEmail.includes('@')) {
    finalReport = `@<${authorEmail}>\n\n${rcaReport}`;
  }

  // 5. Post Comment
  await postComment(repoId, pullRequestId, finalReport, token, orgUrl, project);

  addLog('info', `RCA posted for PR #${pullRequestId}`);
  
  // 5.5. Post to Linked Work Items
  const workItems = await getWorkItems(repoId, pullRequestId, token, orgUrl, project);
  if (workItems.length > 0) {
    addLog('info', `Found ${workItems.length} linked work items. Posting RCA...`);
    
    // Extract Category
    const categoryMatch = finalReport.match(/\*\*Category\*\*: (.*)/);
    const category = categoryMatch ? categoryMatch[1].trim() : null;

    // Create a simplified HTML comment for the Work Item
    let simpleComment = finalReport
      .replace(/## 🔍 Root Cause Analysis/g, '<b>🔍 Root Cause Analysis</b>')
      .replace(/\*\*Category\*\*: (.*)/g, '<b>Category:</b> $1')
      .replace(/\*\*Summary\*\*: (.*)/g, '<br><b>Summary:</b> $1')
      .replace(/\*\*Root Cause\*\*: (.*)/g, '<br><b>Root Cause:</b> $1')
      .replace(/\*\*The Fix\*\*: (.*)/g, '<br><b>The Fix:</b> $1')
      .replace(/\*\*Recommendations\*\*: (.*)/g, '<br><b>Recommendations:</b> $1');

    if (simpleComment === finalReport) {
      simpleComment = `<div>${finalReport.replace(/\n/g, '<br>')}</div>`;
    }

    for (const wi of workItems) {
      await postWorkItemComment(wi.id, simpleComment, token, orgUrl, project);
      
      if (category) {
        const rcaField = process.env.RCA_WORK_ITEM_FIELD || 'Custom.RCA';
        addLog('info', `Attempting to update Work Item ${wi.id} field '${rcaField}' to '${category}'`);
        await updateWorkItem(wi.id, { [rcaField]: category }, token, orgUrl, project);
      }
    }
  } else {
    addLog('info', `No linked work items found for PR #${pullRequestId}`);
  }

  // 6. Send Email
  if (settings.send_emails === 0) {
    addLog('info', `Email sending disabled by user setting. Skipping email.`);
    return;
  }

  const recipients: string[] = [];
  
  // Add configured notification emails
  if (settings.notification_emails) {
    const emails = settings.notification_emails.split(',').map((e: string) => e.trim()).filter((e: string) => e.includes('@'));
    recipients.push(...emails);
  }

  // Add developer email if auto-detect is on
  if (settings.auto_detect_developer) {
    if (authorEmail && authorEmail.includes('@')) {
      recipients.push(authorEmail);
    } else {
      addLog('warn', `Could not find valid email for author ${authorName}.`);
    }
  }
  
  // Legacy fallback (if no settings found, check config)
  if (recipients.length === 0) {
    const developerEmail = getConfig('DEVELOPER_EMAIL');
    if (developerEmail) recipients.push(developerEmail);
  }

  // Deduplicate
  const uniqueRecipients = [...new Set(recipients)];

  if (uniqueRecipients.length > 0) {
    await sendRcaEmail(uniqueRecipients, rcaReport, prUrl);
    addLog('info', `Email sent to: ${uniqueRecipients.join(', ')}`);
  } else {
    addLog('warn', `No valid recipients found, skipping email.`);
  }
};

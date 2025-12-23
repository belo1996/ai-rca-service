import { getPullRequestDiff, getCommitHistory, postComment, getUserEmail, getWorkItems, postWorkItemComment, updateWorkItem } from './gitService';
import { generateRCA } from './aiService';
import { sendRcaEmail } from './emailService';
import { addLog } from './logService';
import { getRepository, getUser } from './dbService';
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

  // 4. AI Analysis
  const rcaReport = await generateRCA(diff, commits);

  // 5. Post Comment
  await postComment(repoId, pullRequestId, rcaReport, token, orgUrl, project);

  addLog('info', `RCA posted for PR #${pullRequestId}`);
  
  // 5.5. Post to Linked Work Items
  const workItems = await getWorkItems(repoId, pullRequestId, token, orgUrl, project);
  if (workItems.length > 0) {
    addLog('info', `Found ${workItems.length} linked work items. Posting RCA...`);
    
    // Extract Category
    const categoryMatch = rcaReport.match(/\*\*Category\*\*: (.*)/);
    const category = categoryMatch ? categoryMatch[1].trim() : null;

    for (const wi of workItems) {
      await postWorkItemComment(wi.id, rcaReport, token, orgUrl, project);
      
      if (category) {
        // Try to update the "Root Cause" field. 
        // Note: The field name depends on the Process (Agile, Scrum, CMMI).
        // CMMI uses 'Microsoft.VSTS.CMMI.RootCause'.
        // Custom processes might use 'Custom.RCA'.
        // We will try a few common ones or just one if we want to be safe.
        // Let's try 'Microsoft.VSTS.CMMI.RootCause' as it's the standard one.
        // If the user uses a different process, this might fail (logged but non-blocking).
        await updateWorkItem(wi.id, {
          'Microsoft.VSTS.CMMI.RootCause': category
        }, token, orgUrl, project);
      }
    }
  } else {
    addLog('info', `No linked work items found for PR #${pullRequestId}`);
  }



  // 6. Send Email
  const developerEmail = getConfig('DEVELOPER_EMAIL');
  const recipientEmail = developerEmail || authorEmail;

  if (recipientEmail && recipientEmail.includes('@')) {
    await sendRcaEmail(recipientEmail, rcaReport, prUrl);
    addLog('info', `Email sent to ${recipientEmail}`);
  } else {
    addLog('warn', `Could not find valid email for user ${authorName}, skipping email.`);
  }
};

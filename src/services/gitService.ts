import * as azdev from 'azure-devops-node-api';
import * as GitApi from 'azure-devops-node-api/GitApi';
import * as GitInterfaces from 'azure-devops-node-api/interfaces/GitInterfaces';
import { getConfig } from './configService';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const getGitApi = async (token: string, orgUrl: string): Promise<GitApi.IGitApi> => {
  if (!orgUrl || !token) {
    throw new Error('Azure DevOps Org URL or Token not provided.');
  }

  const authHandler = azdev.getPersonalAccessTokenHandler(token);
  const connection = new azdev.WebApi(orgUrl, authHandler);
  return await connection.getGitApi();
};

export const getPullRequestDiff = async (repoId: string, pullRequestId: number, token: string, orgUrl: string, project?: string): Promise<string> => {
  try {
    const gitApi = await getGitApi(token, orgUrl);
    
    // Azure DevOps doesn't give a raw diff easily via API like GitHub.
    // We usually fetch the iterations or commits and diff them.
    // For simplicity, we'll try to get the commits and their changes.
    // Or we can use the 'iterations' endpoint to get changes.
    
    // Getting the latest iteration changes
    const iterations = await gitApi.getPullRequestIterations(repoId, pullRequestId, project);
    const lastIteration = iterations[iterations.length - 1];
    
    if (!lastIteration || !lastIteration.id) return '';

    const changes = await gitApi.getPullRequestIterationChanges(repoId, pullRequestId, lastIteration.id, project);
    
    // Construct a pseudo-diff from changes (since we can't get raw diff easily without cloning)
    // This is a simplification. Real diffing requires fetching file content.
    // For the AI, we'll list modified files and maybe fetch content if needed.
    // For now, let's return a list of changed files and their change type.
    
    let diffSummary = 'Changed Files:\n';
    let totalChars = 0;
    const MAX_CHARS = 15000; // Approx 3-4k tokens

    if (changes.changeEntries) {
      // Prioritize files: Source code first, then others. Ignore locks/assets if possible.
      const sortedChanges = changes.changeEntries.sort((a, b) => {
        const isSourceA = /\.(ts|js|py|java|cs|cpp|h|go|rs)$/.test(a.item?.path || '');
        const isSourceB = /\.(ts|js|py|java|cs|cpp|h|go|rs)$/.test(b.item?.path || '');
        if (isSourceA && !isSourceB) return -1;
        if (!isSourceA && isSourceB) return 1;
        return 0;
      });

      for (const change of sortedChanges) {
        if (totalChars >= MAX_CHARS) {
          diffSummary += `\n...(Remaining files truncated due to size limit)...\n`;
          break;
        }

        const path = change.item?.path;
        const isEdit = change.changeType === GitInterfaces.VersionControlChangeType.Edit;
        const isAdd = change.changeType === GitInterfaces.VersionControlChangeType.Add;
        
        // Skip lock files or large assets
        if (path?.match(/package-lock\.json|yarn\.lock|\.png|\.jpg|\.svg/)) {
          diffSummary += `\n--- File: ${path} (Skipped large/binary file) ---\n`;
          continue;
        }

        const fileHeader = `\n--- File: ${path} (${GitInterfaces.VersionControlChangeType[change.changeType!]}) ---\n`;
        diffSummary += fileHeader;
        totalChars += fileHeader.length;

        if ((isEdit || isAdd) && change.item?.objectId) {
          try {
            // Fetch content, limiting per file to ensure we see more files
            const stream = await gitApi.getBlobContent(repoId, change.item.objectId);
            const content = await streamToString(stream);
            
            const maxFileChars = 3000; // Max chars per file
            const truncatedContent = content.substring(0, maxFileChars);
            
            diffSummary += `\`\`\`\n${truncatedContent}\n\`\`\`\n`;
            totalChars += truncatedContent.length;

            if (content.length > maxFileChars) {
              diffSummary += `...(file truncated)\n`;
            }
          } catch (err) {
            console.warn(`Failed to fetch content for ${path}:`, err);
            diffSummary += `(Content fetch failed)\n`;
          }
        }
      }
    }
    
    return diffSummary;
  } catch (error) {
    console.error('Error fetching PR diff:', error);
    throw error;
  }
};

// Helper to convert stream to string
const streamToString = (stream: NodeJS.ReadableStream): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
};

export const getCommitHistory = async (repoId: string, pullRequestId: number, token: string, orgUrl: string, project?: string): Promise<any[]> => {
  try {
    const gitApi = await getGitApi(token, orgUrl);
    const commits = await gitApi.getPullRequestCommits(repoId, pullRequestId, project);
    
    return commits.map((commit) => ({
      sha: commit.commitId,
      message: commit.comment,
      author: commit.author?.name,
      email: commit.author?.email,
      date: commit.author?.date,
    }));
  } catch (error) {
    console.error('Error fetching commit history:', error);
    throw error;
  }
};

export const postComment = async (repoId: string, pullRequestId: number, body: string, token: string, orgUrl: string, project?: string): Promise<void> => {
  try {
    const gitApi = await getGitApi(token, orgUrl);
    
    const thread: GitInterfaces.GitPullRequestCommentThread = {
      comments: [
        {
          content: body,
          commentType: GitInterfaces.CommentType.Text,
          parentCommentId: 0
        }
      ],
      status: GitInterfaces.CommentThreadStatus.Active
    };

    await gitApi.createThread(thread, repoId, pullRequestId, project);
  } catch (error) {
    console.error('Error posting comment:', error);
    throw error;
  }
};

const getWitApi = async (token: string, orgUrl: string) => {
  if (!orgUrl || !token) {
    throw new Error('Azure DevOps Org URL or Token not provided.');
  }
  const authHandler = azdev.getPersonalAccessTokenHandler(token);
  const connection = new azdev.WebApi(orgUrl, authHandler);
  return await connection.getWorkItemTrackingApi();
};

export const getWorkItems = async (repoId: string, pullRequestId: number, token: string, orgUrl: string, project?: string): Promise<any[]> => {
  try {
    console.log(`[WorkItem] Fetching linked items for PR #${pullRequestId} in repo ${repoId}...`);
    const gitApi = await getGitApi(token, orgUrl);
    const refs = await gitApi.getPullRequestWorkItemRefs(repoId, pullRequestId, project);
    
    console.log(`[WorkItem] Found ${refs?.length || 0} linked items.`);
    
    if (!refs || refs.length === 0) return [];

    // Fetch details to get the Work Item Type
    const ids = refs.map(ref => parseInt(ref.id || '0')).filter(id => id > 0);
    
    if (ids.length === 0) return [];

    const witApi = await getWitApi(token, orgUrl);
    const workItems = await witApi.getWorkItems(ids, ['System.WorkItemType', 'System.Title'], undefined, undefined, undefined, project);

    return workItems.map(wi => ({
      id: wi.id,
      url: wi.url,
      type: wi.fields?.['System.WorkItemType'],
      title: wi.fields?.['System.Title']
    }));
  } catch (error: any) {
    console.error('Error fetching linked work items:', error.message);
    if (error.response) {
      console.error('Azure DevOps Error Response (GetLinks):', JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
};

export const postWorkItemComment = async (workItemId: string, comment: string, token: string, orgUrl: string, project?: string): Promise<void> => {
  try {
    // Work Item comments API: POST https://dev.azure.com/{organization}/{project}/_apis/wit/workItems/{id}/comments?api-version=7.1-preview
    const apiUrl = `${orgUrl.replace(/\/$/, '')}/${project ? project + '/' : ''}_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview`;
    console.log(`[WorkItem] Posting comment to: ${apiUrl}`);

    await axios.post(apiUrl, {
      text: comment
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Posted comment to Work Item #${workItemId}`);
  } catch (error: any) {
    console.error(`Error posting comment to Work Item ${workItemId}:`, error.message);
    if (error.response) {
      console.error('Azure DevOps Error Response (Comment):', JSON.stringify(error.response.data, null, 2));
    }
  }
};

export const updateWorkItem = async (workItemId: string, fields: any, token: string, orgUrl: string, project?: string): Promise<void> => {
  try {
    // Work Item Update API: PATCH https://dev.azure.com/{organization}/{project}/_apis/wit/workItems/{id}?api-version=7.1
    // Content-Type must be 'application/json-patch+json'
    const apiUrl = `${orgUrl.replace(/\/$/, '')}/${project ? project + '/' : ''}_apis/wit/workItems/${workItemId}?api-version=7.1`;
    
    // Convert simple object to JSON Patch format
    const patchDocument = Object.keys(fields).map(key => ({
      op: 'add',
      path: `/fields/${key}`,
      value: fields[key]
    }));

    await axios.patch(apiUrl, patchDocument, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json-patch+json'
      }
    });
    
    console.log(`Updated Work Item #${workItemId} fields:`, Object.keys(fields));
  } catch (error: any) {
    console.error(`Error updating Work Item ${workItemId}:`, error.message);
    if (error.response) {
      console.error('Azure DevOps Error Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
};

export const getPullRequestComments = async (repoId: string, pullRequestId: number, token: string, orgUrl: string, project?: string): Promise<string[]> => {
  try {
    const gitApi = await getGitApi(token, orgUrl);
    const threads = await gitApi.getThreads(repoId, pullRequestId, project);
    
    if (!threads) return [];

    const comments: string[] = [];
    
    for (const thread of threads) {
      if (!thread.comments || thread.isDeleted) continue;
      
      for (const comment of thread.comments) {
        if (!comment.content || comment.commentType === 1) continue; // Skip system comments (type 1) if needed, usually type 1 is text
        // Actually type 1 is text, type 2 is code change, type 3 is system. We want text.
        // Let's just take content if it exists and is not empty.
        
        const author = comment.author?.displayName || 'Unknown';
        comments.push(`[${author}]: ${comment.content}`);
      }
    }
    
    return comments;
  } catch (error) {
    console.error('Error fetching PR comments:', error);
    return [];
  }
};

export const getUserEmail = async (userId: string): Promise<string | null> => {
  // Azure DevOps usually provides email in the commit or PR object directly.
  // We might not need a separate call if we rely on what's in the PR/Commit.
  return null; 
};

export const deleteWebhook = async (token: string, orgUrl: string, webhookId: string): Promise<void> => {
  try {
    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    
    // The node-api doesn't have a direct ServiceHooksApi helper easily accessible or typed in some versions,
    // but we can use the rest client if needed, or try to find it.
    // However, since we used axios for creation, let's use axios for deletion to be consistent and safe.

    // Let's add it or use the connection's rest client.
    // Actually, let's just use the connection to get a generic client or use the one from repoService logic.
    // To keep it simple and avoid adding axios import here if not needed, let's try to use the library if possible.
    // But wait, repoService used axios. Let's stick to that pattern for hooks.
    // We need to import axios.
    
    // Since I cannot easily add import to top without reading file again or assuming, 
    // I will use a dynamic import or just assume I can add it. 
    // Wait, I can use the `multi_replace` to add import. 
    // For now, let's just use the `repoService` to handle the API call? 
    // No, the plan said `gitService`.
    
    // Let's use axios for deletion to be consistent and safe.
    const apiUrl = `${orgUrl.replace(/\/$/, '')}/_apis/hooks/subscriptions/${webhookId}?api-version=7.1`;
    
    await axios.delete(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
  } catch (error) {
    console.error('Error deleting webhook:', error);
    // Don't throw, just log. We want to proceed with DB deletion even if webhook fails (orphan cleanup).
  }
};

export const getPreviousCommits = async (repoId: string, branchName: string, token: string, orgUrl: string, project?: string, top: number = 10): Promise<any[]> => {
  try {
    const gitApi = await getGitApi(token, orgUrl);
    
    // branchName usually comes as 'refs/heads/main', we might need to strip refs/heads or pass as is.
    // getCommits searchCriteria takes itemVersion.
    
    const searchCriteria: GitInterfaces.GitQueryCommitsCriteria = {
      itemVersion: {
        version: branchName.replace('refs/heads/', ''),
        versionType: GitInterfaces.GitVersionType.Branch
      },
      $top: top
    };

    const commits = await gitApi.getCommits(repoId, searchCriteria, project);
    
    return commits.map((commit) => ({
      sha: commit.commitId,
      message: commit.comment,
      author: commit.author?.name,
      date: commit.author?.date,
    }));
  } catch (error) {
    console.error('Error fetching previous commits:', error);
    return [];
  }
};

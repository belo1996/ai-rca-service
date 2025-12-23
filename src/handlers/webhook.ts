import { Request, Response } from 'express';
import { analyzePullRequest } from '../services/rcaService';
import { addLog } from '../services/logService';

const processedPRs = new Set<string>();

export const handleWebhook = async (req: Request, res: Response) => {
  const payload = req.body;
  const eventType = payload.eventType; // Azure DevOps event type

  // Only trigger on creation to avoid duplicate comments
  if (eventType === 'git.pullrequest.created') {
    const pr = payload.resource;
    const prId = pr.pullRequestId;
    const repoId = pr.repository.id;
    const uniqueKey = `${repoId}-${prId}`;

    // Deduplication check
    if (processedPRs.has(uniqueKey)) {
      console.log(`[Webhook] Duplicate event ignored for PR #${prId}`);
      return res.status(200).send('Duplicate ignored');
    }

    processedPRs.add(uniqueKey);
    // Clear from cache after 5 minutes to allow manual re-trigger if needed later
    setTimeout(() => processedPRs.delete(uniqueKey), 5 * 60 * 1000);

    const title = pr.title || '';
    const description = pr.description || '';
    const sourceRef = pr.sourceRefName || '';

    const isBug = 
      title.toLowerCase().includes('bug') ||
      description.toLowerCase().includes('bug') ||
      sourceRef.toLowerCase().includes('bug');
    
    if (isBug) {
      addLog('info', `Bug PR detected (Azure): #${prId} - ${title}`);
      
      // Trigger analysis asynchronously
      analyzePullRequest(payload).catch(err => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : '';
        const errorResponse = (err as any).response?.data ? JSON.stringify((err as any).response.data) : '';
        
        addLog('error', `Error analyzing PR: ${errorMessage}`, { stack: errorStack, response: errorResponse });
        console.error('Full Analysis Error:', err);
      });

      return res.status(200).send('Analysis triggered');
    } else {
      addLog('info', `PR #${prId} is not identified as a bug.`);
    }
  }

  res.status(200).send('Ignored');
};

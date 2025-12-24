import OpenAI, { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import { getConfig } from './configService';

dotenv.config();

const getOpenAI = () => {
  // Check if we are using Azure OpenAI.
  const isAzure = !!process.env.AZURE_OPENAI_ENDPOINT;
  
  const apiKey = isAzure 
    ? process.env.AZURE_OPENAI_API_KEY 
    : (getConfig('OPENAI_API_KEY') || process.env.OPENAI_API_KEY);

  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (isAzure) {
    console.log(`[AI Service] Azure Config: Endpoint=${endpoint}, Deployment=${deployment}, Version=${apiVersion}`);
    return new AzureOpenAI({
      apiKey: apiKey,
      apiVersion: apiVersion,
      endpoint: endpoint,
      deployment: deployment
    });
  }

  return new OpenAI({
    apiKey: apiKey,
  });
};

export const generateRCA = async (diff: string, commits: any[], options: { model?: string, deepThinking?: boolean, comments?: string[], previousCommits?: any[] } = {}): Promise<string> => {
  try {
    const client = getOpenAI();
    const isAzure = client instanceof AzureOpenAI;

    const deploymentName = options.model || process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'rca-gpt-4';
    
    if (options.deepThinking) {
      console.log(`[AI Service] Deep Thinking Enabled. Analyzing ${options.comments?.length || 0} comments.`);
    }

    const commitSummaries = commits.map(c => `- ${c.comment} (by ${c.author?.name})`).join('\n');
    const commentsContext = options.deepThinking && options.comments?.length 
      ? `\n\nHere are the discussions/comments on this PR:\n${options.comments.join('\n')}`
      : '';

    const previousCommitsContext = options.deepThinking && options.previousCommits?.length
      ? `\n\n**Previous Commit History (Context from Target Branch):**\n${options.previousCommits.map(c => `- ${c.message} (by ${c.author})`).join('\n')}`
      : '';

    const prompt = `
You are a Senior Site Reliability Engineer (SRE) and an expert in Root Cause Analysis (RCA).
Your task is to analyze the following Git Pull Request (Diff and Commit History)${options.deepThinking ? ' and related discussions/history' : ''} to determine the root cause of the bug it fixes.

**Context:**
- The PR likely fixes a bug.
- You have the file changes (Diff) and the commit messages.
${options.deepThinking ? '- You also have the team\'s discussion comments and previous commit history which may contain clues.' : ''}

**Input Data:**

**Commit History:**
${commitSummaries}
${commentsContext}
${previousCommitsContext}

**Code Changes (Diff):**
${diff}

Based on this, please provide a comprehensive Root Cause Analysis (RCA) report in Markdown format.
Start with the **Category** of the bug. Choose exactly one from: [Code, Configuration, Design, Deployment].

Structure the report as follows:
**Category**: [One of Code, Configuration, Design, Deployment]

## 🔍 Root Cause Analysis

**Summary**: 
[Brief summary of the bug and the fix]

**Root Cause**:
[Detailed explanation of why the bug occurred. Was it a logic error? Missing validation? Race condition? etc.]

**The Fix**:
[Explain how the code changes fix the issue]

**Recommendations**:
[Suggestions to prevent this in the future, e.g., add a test case, improve logging, refactor code]
`;

    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: isAzure ? deploymentName : (options.model || 'gpt-4o'),
    });

    return completion.choices[0].message.content || 'Failed to generate RCA.';
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    console.error('Error generating RCA:', error);
    
    // Log to UI logs via logService (dynamically imported to avoid circular dep if needed)
    try {
      const { addLog } = require('./logService');
      addLog('error', `AI Generation Failed: ${errorMessage}`, { stack: error.stack });
    } catch (e) {
      console.error('Failed to log error to DB:', e);
    }

    return `Error generating RCA. Please check logs. Details: ${errorMessage}`;
  }
};

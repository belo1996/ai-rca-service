import OpenAI from 'openai';
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
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: isAzure ? `${endpoint}/openai/deployments/${deployment}` : undefined,
    defaultQuery: isAzure ? { 'api-version': apiVersion } : undefined,
    defaultHeaders: isAzure ? { 'api-key': process.env.AZURE_OPENAI_API_KEY } : undefined,
  });
};

export const generateRCA = async (diff: string, commits: any[]): Promise<string> => {
  const commitMessages = commits.map(c => `- ${c.message} (by ${c.author})`).join('\n');
  
  const prompt = `
You are an expert software engineer and debugger.
A Pull Request has been opened to fix a bug.
Your task is to analyze the code changes and the commit history to determine the Root Cause of the bug.

Here is the Commit History of this PR:
${commitMessages}

Here is the Diff of the changes (The Fix):
\`\`\`diff
${diff.substring(0, 10000)} // Truncate to avoid token limits if necessary
\`\`\`

Based on this, please provide a Root Cause Analysis (RCA) report.
Structure your response as follows:
## 🔍 Root Cause Analysis
**Category**: [Code | Configuration | Deployment | Design]
**Summary**: A brief summary of what the bug was.
**Root Cause**: Explain the specific logic error, missing validation, or race condition that caused the issue.
**The Fix**: Explain how the changes in this PR fix the issue.
**Recommendations**: (Optional) Any suggestions to prevent this in the future.
`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: process.env.AZURE_OPENAI_ENDPOINT ? '' : 'gpt-4o', 
    });

    return completion.choices[0].message.content || 'Failed to generate RCA.';
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    // Log to both console and UI logs
    console.error('Error generating RCA:', error);
    
    // We need to import addLog dynamically to avoid circular dependencies if any, 
    // or just assume it's safe. Since aiService is a leaf, it should be fine.
    // But let's use console for now and ensure the caller logs it too.
    // Actually, the caller (rcaService) doesn't catch this error because we return a string.
    // So we MUST log it here to see it in the UI.
    
    const { addLog } = require('../services/logService');
    addLog('error', `AI Generation Failed: ${errorMessage}`, { stack: error.stack, response: error.response?.data });

    return `Error generating RCA. Please check logs. Details: ${errorMessage}`;
  }
};

import axios from 'axios';

export const discoverNgrokUrl = async (): Promise<string | null> => {
  // Only run if we are likely in Docker (or if NGROK_AUTHTOKEN is set)
  if (!process.env.NGROK_AUTHTOKEN) {
    return null;
  }

  const ngrokApiUrl = 'http://ngrok:4040/api/tunnels';
  const maxRetries = 10;
  const delay = 2000; // 2 seconds

  console.log('Attempting to discover Ngrok URL...');

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(ngrokApiUrl);
      const tunnels = (response.data as any).tunnels;

      if (tunnels && tunnels.length > 0) {
        // Find the https tunnel
        const httpsTunnel = tunnels.find((t: any) => t.public_url.startsWith('https'));
        if (httpsTunnel) {
          console.log(`Ngrok URL discovered: ${httpsTunnel.public_url}`);
          return httpsTunnel.public_url;
        }
      }
    } catch (error) {
      // Ignore connection errors, ngrok might not be ready yet
    }
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  console.warn('Failed to discover Ngrok URL after multiple attempts.');
  return null;
};

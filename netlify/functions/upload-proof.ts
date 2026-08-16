import type { Handler } from '@netlify/functions';
import { google } from 'googleapis';

const SERVICE_ACCOUNT_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const getFolderId = () => {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID');
  }
  return folderId;
};

const getDriveClient = async () => {
  const folderId = getFolderId();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return { drive: google.drive({ version: 'v3', auth }), folderId };
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (clientEmail && privateKeyRaw) {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKeyRaw.replace(/\\n/g, '\n'),
      scopes: [SERVICE_ACCOUNT_SCOPE],
      subject: clientEmail
    });
    return { drive: google.drive({ version: 'v3', auth }), folderId };
  }

  throw new Error(
    'Missing Google Drive auth. For a personal Gmail bot, set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GOOGLE_DRIVE_FOLDER_ID. A Gmail password will not work.'
  );
};

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing request body' })
    };
  }

  try {
    const { base64Data, mimeType, fileName, metadata } = JSON.parse(event.body) as {
      base64Data?: string;
      mimeType?: string;
      fileName?: string;
      metadata?: Record<string, string | number | null | undefined>;
    };

    if (!base64Data || !mimeType || !fileName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    const { drive, folderId } = await getDriveClient();

    const fileMetadata: Record<string, any> = {
      name: fileName,
      parents: [folderId]
    };

    if (metadata) {
      fileMetadata.description = JSON.stringify(metadata);
    }

    const buffer = Buffer.from(base64Data, 'base64');

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType,
        body: buffer
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        fileId: response.data.id,
        webViewLink: response.data.webViewLink
      })
    };
  } catch (error) {
    console.error('Google Drive upload failed:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to upload file to Google Drive',
        details: error instanceof Error ? error.message : String(error)
      })
    };
  }
};

export { handler };

import type { Handler } from '@netlify/functions';
import { google } from 'googleapis';

const REQUIRED_ENV_VARS = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'GOOGLE_DRIVE_FOLDER_ID'
] as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const getDriveClient = async () => {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL as string;
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY as string;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID as string;

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    subject: clientEmail
  });

  const drive = google.drive({ version: 'v3', auth });

  return { drive, folderId };
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

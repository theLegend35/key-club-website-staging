export type DriveProofInfo = {
  fileId: string;
  webViewLink: string;
  fileName: string;
  mimeType: string;
};

export type StorageProofInfo = {
  bucket: string;
  path: string;
  mimeType: string;
  fileName: string;
};

const DRIVE_TOKEN_REGEX = /\[PHOTO_DRIVE:([^\]]+)\]/;
const STORAGE_TOKEN_REGEX = /\[PHOTO_STORAGE:([^\]]+)\]/;
const PHOTO_DATA_REGEX = /\[PHOTO_DATA:(.*?)\]/s;
const DATA_URL_REGEX = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/;

export function createDriveToken(info: DriveProofInfo): string {
  const parts = [info.fileId, info.webViewLink, info.fileName, info.mimeType].map((part) =>
    encodeURIComponent(part ?? '')
  );
  return `[PHOTO_DRIVE:${parts.join('|')}]`;
}

export function createStorageToken(info: StorageProofInfo): string {
  const parts = [info.bucket, info.path, info.mimeType, info.fileName].map((part) =>
    encodeURIComponent(part ?? '')
  );
  return `[PHOTO_STORAGE:${parts.join('|')}]`;
}

export function parseDriveToken(description?: string | null): DriveProofInfo | null {
  if (!description) return null;
  const match = description.match(DRIVE_TOKEN_REGEX);
  if (!match?.[1]) return null;
  const [fileId, webViewLink, fileName, mimeType] = match[1].split('|').map((part) => {
    try {
      return decodeURIComponent(part || '');
    } catch {
      return part || '';
    }
  });
  if (!fileId) return null;
  return {
    fileId,
    webViewLink: webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    fileName: fileName || 'proof.jpg',
    mimeType: mimeType || 'image/jpeg'
  };
}

export function parseStorageToken(description?: string | null): StorageProofInfo | null {
  if (!description) return null;
  const match = description.match(STORAGE_TOKEN_REGEX);
  if (!match?.[1]) return null;
  const [bucket, path, mimeType, fileName] = match[1].split('|').map((part) => {
    try {
      return decodeURIComponent(part || '');
    } catch {
      return part || '';
    }
  });
  if (!bucket || !path) return null;
  return {
    bucket,
    path,
    mimeType: mimeType || 'image/jpeg',
    fileName: fileName || 'proof.jpg'
  };
}

export function extractLegacyPhotoDataUrl(description?: string | null): string | null {
  if (!description) return null;

  const dataUrlMatch = description.match(DATA_URL_REGEX);
  if (dataUrlMatch?.[0]) {
    return dataUrlMatch[0];
  }

  const embeddedMatch = description.match(PHOTO_DATA_REGEX);
  if (embeddedMatch?.[1]) {
    const token = embeddedMatch[1].trim();
    if (token.startsWith('data:image/')) {
      return token.replace(/\s+/g, '');
    }
    if (token.length > 100) {
      return `data:image/jpeg;base64,${token.replace(/\s+/g, '')}`;
    }
  }

  return null;
}

export function hasDriveProof(description?: string | null): boolean {
  return Boolean(parseDriveToken(description));
}

export function hasOffloadedProof(description?: string | null): boolean {
  return Boolean(parseDriveToken(description) || parseStorageToken(description));
}

export function cleanProofDescription(description?: string | null): string {
  if (!description) return '';
  return description
    .replace(/Photo: [^|\n]+/g, '')
    .replace(PHOTO_DATA_REGEX, '')
    .replace(STORAGE_TOKEN_REGEX, '')
    .replace(DRIVE_TOKEN_REGEX, '')
    .replace(DATA_URL_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function driveViewUrl(info: DriveProofInfo): string {
  return info.webViewLink || `https://drive.google.com/file/d/${info.fileId}/view`;
}

/**
 * Shrink a proof photo enough to stay under Netlify's function payload limit.
 * Falls back to the original file if canvas conversion fails.
 */
export async function fileToProofPayload(file: File): Promise<{
  mimeType: string;
  base64Data: string;
  dataUrl: string;
  fileName: string;
}> {
  const original = await readFileAsDataUrl(file);
  const parsed = parseDataUrl(original);
  if (!parsed) {
    throw new Error('Could not read the proof photo. Please try a different image.');
  }

  try {
    const resized = await resizeImageDataUrl(original, 1600, 0.85);
    const resizedParsed = parseDataUrl(resized);
    if (resizedParsed) {
      return {
        mimeType: resizedParsed.mimeType,
        base64Data: resizedParsed.base64Data,
        dataUrl: resized,
        fileName: replaceExtension(file.name || 'proof.jpg', resizedParsed.mimeType)
      };
    }
  } catch (error) {
    console.warn('Proof photo resize skipped, using original file:', error);
  }

  return {
    mimeType: parsed.mimeType,
    base64Data: parsed.base64Data,
    dataUrl: original,
    fileName: file.name || 'proof.jpg'
  };
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { mimeType: match[1], base64Data: match[2] };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function resizeImageDataUrl(dataUrl: string, maxEdge: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const longest = Math.max(image.width, image.height);
      const scale = longest > maxEdge ? maxEdge / longest : 1;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas is not available'));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => reject(new Error('Could not decode image for resize'));
    image.src = dataUrl;
  });
}

function replaceExtension(fileName: string, mimeType: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'proof';
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  return `${base}.${ext}`;
}

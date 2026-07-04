// src/utils/imageLoader.ts
export async function getBase64Image(url: string) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const type = response.headers.get('content-type') || 'image/png';
    return `data:${type};base64,${base64}`;
  } catch (e) {
    console.error("Failed to convert to base64:", e);
    return null;
  }
}
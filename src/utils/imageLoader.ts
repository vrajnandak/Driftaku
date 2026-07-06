// // src/utils/imageLoader.ts
// export async function getBase64Image(url: string) {
//   try {
//     const response = await fetch(url);
//     const buffer = await response.arrayBuffer();
//     const base64 = Buffer.from(buffer).toString('base64');
//     const type = response.headers.get('content-type') || 'image/png';
//     return `data:${type};base64,${base64}`;
//   } catch (e) {
//     console.error("Failed to convert to base64:", e);
//     return null;
//   }
// }

// src/utils/imageLoader.ts

export async function getBase64Image(url: string) {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    
    // Convert ArrayBuffer to Base64 using standard Web APIs (Cloudflare-safe)
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    const type = response.headers.get('content-type') || 'image/png';
    return `data:${type};base64,${base64}`;
  } catch (e) {
    console.error(`Failed to convert to base64 for ${url}:`, e);
    return null;
  }
}
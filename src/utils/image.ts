export const getProxyUrl = (url: string) => {
  if (!url) return '';
  
  // Using AllOrigins in 'raw' mode. 
  // It fetches the image and attaches the Access-Control-Allow-Origin: * header without altering the image.
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
};
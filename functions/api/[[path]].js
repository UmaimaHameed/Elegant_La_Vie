export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  const workerUrl = 'https://elegant-la-vie1.bsai25108143.workers.dev';
  const newUrl = workerUrl + url.pathname + url.search;
  
  const newRequest = new Request(newUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
  
  return fetch(newRequest);
}

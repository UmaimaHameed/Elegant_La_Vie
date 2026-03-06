// Cloudflare Pages Function - API proxy
// This file routes all /api/* requests to the Hono worker

export async function onRequest(context) {
  // The worker handles all API routes via the same D1 binding
  // In Pages + Workers setup, the worker is deployed separately
  // and Pages Functions proxy to it
  
  const { request, env } = context;
  
  // Forward the request to the worker
  // The worker handles authentication, D1 queries, and Stripe
  return await env.WORKER.fetch(request);
}

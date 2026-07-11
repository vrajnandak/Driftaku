export const prerender = false; // Runs dynamically on the server (Cloudflare Worker)

import type { APIRoute } from 'astro';
import { contact_supabase } from '../../lib/contactsupabase';

export const POST: APIRoute = async ({ request }) => {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  try {
    // 1. Parse JSON payload (Much more stable than FormData on Cloudflare)
    const data = await request.json();
    
    const botcheck = data.botcheck;
    const name = data.name?.trim();
    const contact_info = data.contact?.trim(); // Maps to name="contact" in HTML
    const topic = data.topic;
    const location = data.location;
    const message = data.message?.trim();

    // 2. Honeypot check (Bots get a fake success)
    if (botcheck) {
      return new Response(JSON.stringify({ success: true }), { 
        status: 200, 
        headers: jsonHeaders 
      });
    }

    // 3. Validation
    if (!name || !contact_info || !message) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), { 
        status: 400, 
        headers: jsonHeaders 
      });
    }

    // 4. Insert into Supabase
    const { error } = await contact_supabase.from('contact_messages').insert({
      name,
      contact_info,
      topic,
      location,
      message
    });

    if (error) {
      console.error("Supabase Insertion Error:", error);
      return new Response(JSON.stringify({ success: false, error: "Database transmission failed" }), { 
        status: 500, 
        headers: jsonHeaders 
      });
    }

    // 5. Success Response
    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      headers: jsonHeaders 
    });

  } catch (error) {
    console.error("API Server Error:", error);
    return new Response(JSON.stringify({ success: false, error: "Server communication error" }), { 
      status: 500, 
      headers: jsonHeaders 
    });
  }
};
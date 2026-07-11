export const prerender = false; // This specific invisible route runs on the server

import type { APIRoute } from 'astro';
import { contact_supabase } from '../../lib/contactsupabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.formData();
    
    const botcheck = data.get("botcheck");
    const name = data.get("name")?.toString().trim();
    const contact_info = data.get("contact")?.toString().trim();
    const topic = data.get("topic")?.toString();
    const location = data.get("location")?.toString();
    const message = data.get("message")?.toString().trim();

    // 1. Honeypot check (Bots get a fake success)
    if (botcheck) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // 2. Validation
    if (!name || !contact_info || !message) {
      return new Response(JSON.stringify({ success: false, error: "Missing fields" }), { status: 400 });
    }

    // 3. Insert into Supabase
    const { error } = await contact_supabase.from('contact_messages').insert({
      name,
      contact_info,
      topic,
      location,
      message
    });

    if (error) {
      return new Response(JSON.stringify({ success: false, error: "Database error" }), { status: 500 });
    }

    // 4. Return actual success
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: "Server error" }), { status: 500 });
  }
};
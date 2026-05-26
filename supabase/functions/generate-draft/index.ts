import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VOYAGE_API_KEY        = Deno.env.get('VOYAGE_API_KEY')!
const GEMINI_API_KEY        = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'voyage-multilingual-2', input: [text.slice(0, 16000)] }),
  })
  if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`)
  return (await res.json()).data[0].embedding
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
      }),
    }
  )
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { customer_text, language } = await req.json()

    if (!customer_text?.trim()) {
      return new Response(JSON.stringify({ error: 'customer_text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Embed the customer message
    const embedding = await embed(customer_text)

    // Retrieve top 5 similar historical Q&A pairs
    const { data: examples, error: matchError } = await supabase.rpc('match_historical_qa', {
      query_embedding: embedding,
      match_count: 5,
      filter_language: language || null,
    })
    if (matchError) throw new Error(`match error: ${matchError.message}`)

    // Build prompt with examples
    const examplesBlock = (examples || []).map((ex: any, i: number) =>
      `Example ${i + 1}:\nCustomer: ${ex.customer_text}\nDSA Reply: ${ex.rep_text}`
    ).join('\n\n')

    const prompt = `You are a customer service representative for DSA Seat Factory, a European car seat cover brand (part of United Seat Factory / USF). DSA sells only in Europe (UK, Germany, France, Italy, Spain) — never mention US shipping or US customers.

Your tone is professional, friendly, and concise. Always reply in the same language the customer used.

Here are similar past customer inquiries and DSA's replies for reference:

${examplesBlock}

Now write a reply to this new customer message:
"""
${customer_text}
"""

Write only the reply text. No subject line. Start naturally (e.g. "Hello," / "Bonjour," / "Hallo,").`

    const draft = await callGemini(prompt)

    return new Response(JSON.stringify({ draft, examples: examples || [] }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})

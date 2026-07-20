// Voyage AI voyage-multilingual-2 embeddings (1024 dims).
// Reads VOYAGE_API_KEY from process.env.
const VOYAGE_KEY = process.env.VOYAGE_API_KEY;

export async function embed(text) {
  if (!VOYAGE_KEY) throw new Error('VOYAGE_API_KEY not set');
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VOYAGE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-multilingual-2',
      input: [text.slice(0, 16000)],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

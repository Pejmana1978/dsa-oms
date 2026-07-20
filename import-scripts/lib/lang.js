// Simple language detector for DSA's 5 EU languages.
// Swap for `franc` npm package if accuracy becomes an issue.
export function detectLanguage(text) {
  const sample = text.toLowerCase().slice(0, 500);
  const scores = { fr: 0, de: 0, it: 0, es: 0, en: 0 };

  if (/\b(bonjour|merci|cordialement|housse|voiture|siège|svp|s'il vous plaît)\b/.test(sample)) scores.fr += 3;
  if (/\b(je|vous|nous|est|avec|pour|dans)\b/.test(sample)) scores.fr += 1;

  if (/\b(hallo|danke|fahrzeug|sitz|bezüge|bitte|grüße|guten)\b/.test(sample)) scores.de += 3;
  if (/\b(ich|sie|wir|ist|mit|für|und|der|die|das)\b/.test(sample)) scores.de += 1;

  if (/\b(buongiorno|grazie|cordiali|sedile|coprisedile|saluti|prego)\b/.test(sample)) scores.it += 3;
  if (/\b(sono|siete|abbiamo|con|per|nel|della)\b/.test(sample)) scores.it += 1;

  if (/\b(hola|gracias|saludos|funda|asiento|coche|por favor)\b/.test(sample)) scores.es += 3;
  if (/\b(soy|estás|tenemos|con|para|en|de la)\b/.test(sample)) scores.es += 1;

  if (/\b(hello|thanks|regards|cover|seat|please|vehicle)\b/.test(sample)) scores.en += 3;
  if (/\b(i|you|we|is|with|for|the|and)\b/.test(sample)) scores.en += 1;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'unknown';
}

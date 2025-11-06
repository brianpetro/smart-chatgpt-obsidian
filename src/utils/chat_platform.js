/**
 * Determine chat platform from a thread URL.
 * @param {string} url - Chat thread URL.
 * @returns {string} - Platform key: chatgpt, claude, grok, or unknown.
 */
export function chat_platform_from_url(url) {
  if (typeof url !== 'string') return 'unknown';
  const patterns = [
    { key: 'chatgpt', re: /chatgpt\.com|chat\.openai\.com/ },
    { key: 'claude', re: /claude\.ai/ },
    { key: 'grok', re: /grok\.com/ },
  ];
  const match = patterns.find(p => p.re.test(url));
  return match ? match.key : 'unknown';
}

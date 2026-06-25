interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
}

export function extractPlainText(content: Record<string, unknown>): string {
  const parts: string[] = [];

  function walk(node: TiptapNode) {
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  walk(content as TiptapNode);
  return parts.join(' ').trim().replace(/\s+/g, ' ');
}

export function calculateReadingTime(content: Record<string, unknown>): number {
  const text = extractPlainText(content).trim();
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function calculateExcerpt(content: Record<string, unknown>): string {
  return extractPlainText(content).slice(0, 160);
}

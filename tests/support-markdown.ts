/** A rough stand-in for Obsidian's htmlToMarkdown in tests: headings, list items, and block breaks. */
export function roughMarkdown(root: Element): string {
	const out: string[] = [];
	const walk = (node: Node) => {
		if (node.nodeType === 3) {
			out.push((node.textContent ?? '').replace(/\s+/g, ' '));
			return;
		}
		if (node.nodeType !== 1) return;
		const el = node as Element;
		const tag = el.tagName.toLowerCase();
		const heading = /^h([1-6])$/.exec(tag);
		if (heading) out.push(`\n\n${'#'.repeat(Number(heading[1]))} `);
		else if (tag === 'li') out.push(el.parentElement?.tagName.toLowerCase() === 'ol' ? '\n1. ' : '\n- ');
		else if (tag === 'br') out.push('\n');
		else if (/^(?:p|div|section|ul|ol|table|tr|article|header|main|aside|blockquote|dl|dt|dd)$/.test(tag))
			out.push('\n\n');
		for (const child of Array.from(el.childNodes)) walk(child);
		if (heading || /^(?:p|div|section|ul|ol|tr|li)$/.test(tag)) out.push('\n');
	};
	walk(root);
	return out
		.join('')
		.split('\n')
		.map((line) => line.trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

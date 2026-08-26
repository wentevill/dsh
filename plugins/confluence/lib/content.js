import { convert } from 'html-to-text';
import MarkdownIt from 'markdown-it';
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false, xhtmlOut: true });
export function markdownToStorage(value) {
    if (value.length > 500_000)
        throw new Error('confluence: Markdown exceeds 500000 characters');
    return markdown.render(value).trim().replace(/<br>/gu, '<br />').replace(/<hr>/gu, '<hr />');
}
export function storageToText(value, maxChars = 100_000) {
    const text = convert(value, {
        wordwrap: false,
        selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' },
            { selector: 'h1', options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false } },
            { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        ],
    }).replace(/\n{3,}/gu, '\n\n').trim();
    return text.length > maxChars
        ? { text: text.slice(0, maxChars), truncated: true }
        : { text, truncated: false };
}

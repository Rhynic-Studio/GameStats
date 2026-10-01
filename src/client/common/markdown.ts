/**
 * 够用的那几种：**粗**、*斜*、`代码`、[文字](链接)、换行。
 *
 * 先转义再替换，所以正文里的尖括号永远不会变成标签；
 * 反引号排在最前面，代码里的星号就不会再被当成强调。
 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function md(src: string): string {
  return src
    .replace(/[&<>"]/g, (c) => ESCAPES[c])
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

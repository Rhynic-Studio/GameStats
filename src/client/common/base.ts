/**
 * 部署在子路径下时，服务端会在 index.html 里注入 <base href="/xxx/">。
 * 这里所有的请求地址都相对它拼，改前缀不用重新构建。
 */
const basePath = new URL(document.baseURI).pathname.replace(/\/+$/, '');

export const BASE = basePath;

export const apiUrl = (path: string) => `${basePath}/${path.replace(/^\/+/, '')}`;

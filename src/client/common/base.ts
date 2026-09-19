/**
 * 部署在子路径下时，前端要知道自己被挂在哪个前缀下。
 *
 * 唯一可靠的来源是服务端注入的 <base href="/前缀/">：
 * 资源是相对路径，深层链接下（/前缀/crash/stats）光看地址栏分不出哪段是前缀。
 * 服务端没注入 <base> 时就是根部署，地址栏本身就是前缀（首页为 /）。
 */
const basePath = new URL(document.baseURI).pathname.replace(/\/+$/, '');

export const BASE = basePath;

export const apiUrl = (path: string) => `${BASE}/${path.replace(/^\/+/, '')}`;

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 相对路径，配合服务端注入的 <base> 支持部署在任意子路径下
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});

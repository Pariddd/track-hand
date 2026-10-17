import { defineConfig } from 'vite';

export default defineConfig({
  // base '' agar bisa di-deploy di subpath apapun
  base: './',
  server: {
    // HTTPS diperlukan untuk getUserMedia di production,
    // tapi localhost dev server dikecualikan oleh browser (secure context exception)
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});

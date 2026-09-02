/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/QuarterMasterGeneralWW2/',
  test: {
    environment: 'node',
    globals: false,
  },
});

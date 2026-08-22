import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,js}'],
    exclude: ['lib/**', 'node_modules/**'],
  },
});

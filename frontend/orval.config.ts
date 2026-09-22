import { defineConfig } from 'orval';

export default defineConfig({
  irisops: {
    input: '../spec/mainspec_v2.with-ids.json',
    output: {
      target: './src/api/generated',
      client: 'react-query',
      httpClient: 'axios',
      mode: 'tags-split',
      clean: true,
      override: {
        mutator: {
          path: './src/api/axios-instance.ts',
          name: 'customInstance',
        },

      },
    },
  },
});

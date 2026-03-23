import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default defineConfig({
  input: 'src/action.ts',
  output: {
    file: 'dist/action/index.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    typescript({
      compilerOptions: {
        declaration: false,
        declarationMap: false,
        sourceMap: true,
      },
    }),
    resolve({ preferBuiltins: true }),
    commonjs(),
    json(),
  ],
});

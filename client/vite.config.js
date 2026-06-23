import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'

function replaceFs() {
  return {
    name: 'replace-fs',
    transform(code, id) {
      if (code.includes('require("fs")')) {
        return code.replace(/require\("fs"\)/g, '({ readFileSync: () => new Uint8Array() })');
      }
      return code;
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    replaceFs()
  ]
})

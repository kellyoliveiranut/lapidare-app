import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, __BUILD_TIME__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // O service worker roda fora da janela: 'self' e 'caches' ja vem de
  // globals.browser, mas 'clients' so existe no escopo de service worker.
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },

  // Funcoes Netlify sao CommonJS rodando em Node — require, exports e
  // process nao sao globais do browser. Confere com netlify/functions/
  // package.json, que declara { "type": "commonjs" }.
  {
    files: ['netlify/functions/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])

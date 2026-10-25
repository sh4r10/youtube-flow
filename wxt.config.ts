import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'YouTube Flow',
    description: 'Send YouTube videos to pipelines instead of tabs, then decide one card at a time.',
    permissions: ['storage', 'tabs', 'contextMenus', 'alarms', 'notifications'],
    host_permissions: [
      'https://www.youtube.com/*',
      // AI providers, called directly from the extension with the user's own key.
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://api.deepseek.com/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    browser_specific_settings: { gecko: { id: 'youtube-flow@shariq.dev', data_collection_permissions: { required: ['none'] } } },
  },
});

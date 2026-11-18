import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { rankingTemplateForm } from './ranking-template-files.js';
import { filesFromFormData } from './storage.js';

vi.stubEnv('EVENTS_JWT_SECRET', 'ranking-template-test-secret-at-least-32-characters');

describe('ranking template bundles', () => {
  it.each(['rankings', 'ranking-wealth', 'ranking-charm', 'ranking-agency', 'ranking-cp', 'ranking-game', 'ranking-weekly-star'])('%s includes nested reward assets and passes upload validation', async slug => {
    const form = await rankingTemplateForm(path.resolve('event-templates', slug));
    const paths = form.getAll('paths');
    expect(paths).toContain('index.html');
    expect(paths.some(name => name.startsWith('assets/rewards/'))).toBe(true);
    expect(paths).not.toContain('assets/rewards');
    const result = await filesFromFormData(form);
    expect(result.files.length).toBe(paths.length);
  });
});

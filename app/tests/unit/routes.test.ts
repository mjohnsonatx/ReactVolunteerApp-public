import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRoute, pathForAdminTab, pathForPage } from '../../src/router/routes';

const featureFlags = vi.hoisted(() => ({ documents: true }));
vi.mock('../../src/features', () => ({
  get PUBLIC_DOCUMENTS_ENABLED() { return featureFlags.documents; },
}));

beforeEach(() => { featureFlags.documents = true; });

describe('clean URL routes', () => {
  it('parses collection and detail pages without hashes', () => {
    expect(parseRoute('/about')).toMatchObject({ page: 'about', params: {}, path: '/about' });
    expect(parseRoute('/documents')).toMatchObject({ page: 'documents', params: {}, path: '/documents' });
    expect(parseRoute('/documents/doc-123')).toMatchObject({
      page: 'documentDetail',
      params: { documentId: 'doc-123' },
      path: '/documents/doc-123',
    });
    expect(parseRoute('/events/event-123')).toMatchObject({ page: 'eventDetail', params: { eventId: 'event-123' } });
    expect(parseRoute('/polls/poll-123')).toMatchObject({ page: 'pollDetail', params: { pollId: 'poll-123' } });
  });

  it('builds encoded-free app paths only for safe record ids', () => {
    expect(pathForPage('documentDetail', { documentId: 'doc_123' })).toBe('/documents/doc_123');
    expect(parseRoute('/documents/%E0%A4%A')).toMatchObject({ page: 'documents', params: {} });
  });

  it('routes administrators directly to the combined logs panel', () => {
    expect(pathForAdminTab('logs')).toBe('/admin/logs');
    expect(parseRoute('/admin/logs')).toMatchObject({ view: 'admin', adminTab: 'logs', path: '/admin/logs' });
  });

  it('blocks document routes and generated links when the public feature is gated', () => {
    featureFlags.documents = false;
    for (const path of ['/documents', '/documents/doc-123', '/documents/?source=old#page=2', '/documentDetail']) {
      expect(parseRoute(path)).toMatchObject({ view: 'user', page: 'home', params: {}, path: '/' });
    }
    expect(pathForPage('documents')).toBe('/');
    expect(pathForPage('documentDetail', { documentId: 'doc-123' })).toBe('/');
  });

  it('keeps admin document/storage maintenance available with the public feature gated', () => {
    featureFlags.documents = false;
    expect(parseRoute('/admin/documents')).toMatchObject({ view: 'admin', adminTab: 'documents', path: '/admin/documents' });
    expect(pathForAdminTab('documents')).toBe('/admin/documents');
    expect(pathForPage('events')).toBe('/events');
  });
});

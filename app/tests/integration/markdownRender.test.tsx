// tests/integration/markdownRender.test.jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Markdown from '../../src/components/shared/Markdown';

describe('<Markdown> output safety', () => {
  it('does not create a <script> element from injected text', () => {
    const { container } = render(<Markdown>{'**ok** <script>alert(1)</script>'}</Markdown>);
    expect(container.querySelector('script')).toBeNull();
  });
  it('renders emphasis as real markup', () => {
    const { container } = render(<Markdown>{'**bold**'}</Markdown>);
    expect(container.querySelector('strong')).not.toBeNull();
  });
  it('forces external links to rel=noopener', () => {
    const { container } = render(<Markdown>{'[x](https://example.com)'}</Markdown>);
    const a = container.querySelector('a');
    expect(a.getAttribute('rel')).toContain('noopener');
  });
});
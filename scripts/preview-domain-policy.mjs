function unique(values) {
  return [...new Set(values)];
}

export function isPreviewDomain(domain, project) {
  return typeof domain === 'string'
    && domain.startsWith(`${project}--`)
    && domain.endsWith('.web.app');
}

export function activePreviewDomainsFromChannels(channels, project) {
  return unique((channels || [])
    .map(channel => {
      try {
        return new URL(channel.url).hostname;
      } catch {
        return '';
      }
    })
    .filter(hostname => isPreviewDomain(hostname, project)))
    .sort();
}

export function synchronizeAuthorizedDomains(currentDomains, activePreviewDomains, project) {
  const active = new Set(activePreviewDomains);
  const obsolete = (currentDomains || [])
    .filter(domain => isPreviewDomain(domain, project) && !active.has(domain));
  const domains = unique([
    ...(currentDomains || []).filter(domain => !obsolete.includes(domain)),
    ...activePreviewDomains,
  ]);
  return { domains, obsolete };
}

function previewDomainFromOrigin(origin, project) {
  if (typeof origin !== 'string') return '';
  try {
    const hostname = new URL(origin).hostname;
    return isPreviewDomain(hostname, project) ? hostname : '';
  } catch {
    return '';
  }
}

export function synchronizeStorageCors(currentCors, activePreviewDomains, project) {
  const active = new Set(activePreviewDomains);
  const activeOrigins = activePreviewDomains.map(domain => `https://${domain}`);
  return (currentCors || []).map(entry => ({
    ...entry,
    origin: unique([
      ...(entry.origin || []).filter(origin => {
        const previewDomain = previewDomainFromOrigin(origin, project);
        return !previewDomain || active.has(previewDomain);
      }),
      ...activeOrigins,
    ]),
  }));
}

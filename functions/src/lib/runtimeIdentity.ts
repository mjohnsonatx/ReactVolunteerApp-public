// Explicit identities keep runtime access separate from the build account.
// Use full emails: the CLI's secret-IAM path does not expand short account names.
import { projectId } from './environment';
const domain = `${projectId}.iam.gserviceaccount.com`;
export const runtimeIdentity = {
  data: `tsv-data@${domain}`,
  identity: `tsv-identity@${domain}`,
  media: `tsv-media@${domain}`,
  polls: `tsv-polls@${domain}`,
  appCheck: `tsv-appcheck@${domain}`,
  notify: `tsv-notify@${domain}`,
} as const;

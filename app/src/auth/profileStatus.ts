export type ProfileStatus = 'missing' | 'incomplete' | 'active' | 'deleting';

export function profileStatus(exists: boolean, data: Record<string, unknown>): ProfileStatus {
  if (!exists) return 'missing';
  if (data.accountStatus === 'deleting') return 'deleting';
  return typeof data.userName === 'string' && data.userName.trim() ? 'active' : 'incomplete';
}

export function needsProfileSetup(user: { emailVerified?: boolean; profileStatus?: ProfileStatus } | null): boolean {
  return user?.emailVerified === true
    && (user.profileStatus === 'missing' || user.profileStatus === 'incomplete');
}

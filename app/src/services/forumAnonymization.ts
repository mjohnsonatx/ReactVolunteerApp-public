import { adminAnonymizeForumPostsFn } from '../libs/callables';

export const DELETED_FORUM_AUTHOR = '[Deleted User]';
export const DELETED_FORUM_AUTHOR_ID = 'deleted';
export const DELETED_FORUM_USER_NAME = 'deleted-user';

export function buildForumPostAnonymizationUpdate(post: any, uid: string): Record<string, any> | null {
  if (!post || !uid) return null;

  let changed = false;
  const update: Record<string, any> = {};

  if (post.authorId === uid) {
    update.author = DELETED_FORUM_AUTHOR;
    update.authorId = DELETED_FORUM_AUTHOR_ID;
    update.authorUserName = DELETED_FORUM_USER_NAME;
    changed = true;
  }

  if (Array.isArray(post.replies)) {
    const replies = post.replies.map((reply: any) => {
      if (reply?.authorId !== uid) return reply;
      changed = true;
      return {
        ...reply,
        author: DELETED_FORUM_AUTHOR,
        authorId: DELETED_FORUM_AUTHOR_ID,
        authorUserName: DELETED_FORUM_USER_NAME,
      };
    });
    if (changed) update.replies = replies;
  }

  return changed ? update : null;
}

export async function anonymizeForumPostsForUser(
  uid: string,
  knownPosts?: any[],
  options: { includeReplyOnlyPosts?: boolean } = {},
): Promise<number> {
  void knownPosts;
  void options;
  if (!uid) return 0;
  const res = await adminAnonymizeForumPostsFn({ uid });
  return (res.data as { changed?: number }).changed ?? 0;
}

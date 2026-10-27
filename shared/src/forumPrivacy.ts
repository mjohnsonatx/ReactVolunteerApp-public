import { ANONYMOUS_COMMENT_LABEL } from './eventComments';

// Encode both components so arbitrary valid Firestore IDs cannot collide.
export function forumAuthorKey(postId: string, replyId = ''): string {
  return `${encodeURIComponent(postId)}:${encodeURIComponent(replyId)}`;
}

export function publicForumIdentity(anonymous: boolean, uid: string, userName: string, anonymousLabel = ANONYMOUS_COMMENT_LABEL) {
  return anonymous
    ? { anonymous: true, anonymousLabel, author: anonymousLabel }
    : { anonymous: false, author: userName || 'Member', authorUserName: userName, authorId: uid };
}

// These helpers are for MFA-authorized admin views ONLY. Never write merged
// objects back to the public forumPosts collection.
export function mergeForumAuthors(posts: any[], authors: any[]): any[] {
  const identities = new Map(authors.map(a => [forumAuthorKey(a.postId, a.replyId), a]));
  const merge = (item: any, key: string) => {
    const identity = identities.get(key);
    return item.anonymous === true && identity
      ? { ...item, authorId: identity.authorId, author: identity.author, authorUserName: identity.authorUserName }
      : item;
  };
  return posts.map(post => ({
    ...merge(post, forumAuthorKey(post.id)),
    replies: (post.replies || []).map((reply: any) => merge(reply, forumAuthorKey(post.id, reply.id))),
  }));
}

export function mergePendingForumAuthors(pending: any[], authors: any[]): any[] {
  return pending.map(item => ({
    ...item,
    reply: mergeForumAuthors([{ id: item.postId, replies: [item.reply || {}] }], authors)[0].replies[0],
  }));
}

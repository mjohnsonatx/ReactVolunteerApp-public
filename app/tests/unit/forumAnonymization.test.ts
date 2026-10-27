import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/libs/callables', () => ({
  adminAnonymizeForumPostsFn: vi.fn(),
}));

import {
  buildForumPostAnonymizationUpdate,
  DELETED_FORUM_AUTHOR,
  DELETED_FORUM_AUTHOR_ID,
  DELETED_FORUM_USER_NAME,
} from '../../src/services/forumAnonymization';

describe('buildForumPostAnonymizationUpdate', () => {
  it('anonymizes authored posts and matching replies', () => {
    const update = buildForumPostAnonymizationUpdate({
      id: 'post-1',
      author: 'Jane',
      authorUserName: 'jane',
      authorId: 'user-1',
      replies: [
        { id: 'r1', author: 'Jane', authorUserName: 'jane', authorId: 'user-1', text: 'same user' },
        { id: 'r2', author: 'Sam', authorUserName: 'sam', authorId: 'user-2', text: 'other user' },
      ],
    }, 'user-1');

    expect(update).toMatchObject({
      author: DELETED_FORUM_AUTHOR,
      authorId: DELETED_FORUM_AUTHOR_ID,
      authorUserName: DELETED_FORUM_USER_NAME,
    });
    expect(update?.replies[0]).toMatchObject({
      author: DELETED_FORUM_AUTHOR,
      authorId: DELETED_FORUM_AUTHOR_ID,
      authorUserName: DELETED_FORUM_USER_NAME,
    });
    expect(update?.replies[1]).toMatchObject({ author: 'Sam', authorId: 'user-2' });
  });

  it('returns null when the user has no activity in the post', () => {
    expect(buildForumPostAnonymizationUpdate({
      id: 'post-1',
      authorId: 'user-2',
      replies: [{ id: 'r1', authorId: 'user-3' }],
    }, 'user-1')).toBeNull();
  });
});

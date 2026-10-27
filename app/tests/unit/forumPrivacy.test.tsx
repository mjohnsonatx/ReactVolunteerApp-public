import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forumAuthorKey, mergeForumAuthors, mergePendingForumAuthors, publicAuthorLabel, publicForumIdentity } from '@watershed/shared';
import ForumPostContent from '../../src/components/shared/ForumPostContent';

const h = vi.hoisted(() => ({ ctx: {} as any }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => h.ctx }));
import AdminForum from '../../src/components/admin/AdminForum';

const post = { id: 'post', anonymous: true, anonymousLabel: 'Anonymous 1', author: 'Anonymous 1', title: 'Question', content: 'Help?', date: 'today', status: 'approved', replies: [
  { id: 'reply', anonymous: true, anonymousLabel: 'Anonymous 2', author: 'Anonymous 2', text: 'Sure', date: 'today' },
] };
const authors = [
  { postId: 'post', replyId: '', authorId: 'uid-one', author: 'one', authorUserName: 'one' },
  { postId: 'post', replyId: 'reply', authorId: 'uid-two', author: 'two', authorUserName: 'two' },
];

describe('forum privacy', () => {
  it('omits private identity in anonymous public payloads', () => {
    expect(publicForumIdentity(true, 'secret-uid', 'private-name', 'Anonymous 2')).toEqual({ anonymous: true, author: 'Anonymous 2', anonymousLabel: 'Anonymous 2' });
    expect(publicForumIdentity(false, 'uid', 'name')).toMatchObject({ authorId: 'uid', authorUserName: 'name' });
    expect(forumAuthorKey('a:b', 'c')).not.toBe(forumAuthorKey('a', 'b:c'));
  });

  it('joins identities for admin moderation without mutating public data or losing handles', () => {
    const [adminPost] = mergeForumAuthors([post], authors);
    expect(adminPost).toMatchObject({ authorId: 'uid-one', anonymousLabel: 'Anonymous 1' });
    expect(adminPost.replies[0]).toMatchObject({ authorId: 'uid-two', anonymousLabel: 'Anonymous 2' });
    expect(post).not.toHaveProperty('authorId');
    expect(post.replies[0]).not.toHaveProperty('authorId');
    expect(mergePendingForumAuthors([{ postId: 'post', reply: post.replies[0] }], authors)[0].reply.authorId).toBe('uid-two');
    expect(publicAuthorLabel({ anonymous: true, anonymousLabel: 'Anonymous 2', authorUserName: 'private' })).toBe('Anonymous 2');
  });

  it('public rendering hides even an admin-joined identity', () => {
    render(<ForumPostContent post={mergeForumAuthors([post], authors)[0]} />);
    expect(screen.getByText('Anonymous 1')).toBeInTheDocument();
    expect(screen.queryByText('@one')).not.toBeInTheDocument();
    expect(screen.queryByText(/uid-one/)).not.toBeInTheDocument();
  });

  it('the shared web/desktop admin thread shows both handles and real IDs with profile links', async () => {
    const posts = mergeForumAuthors([post], authors);
    h.ctx = { forumPosts: posts, forumReports: [], pendingForumReplies: [], adminViewThread: posts[0], openProfileForUser: vi.fn() };
    render(<AdminForum />);
    expect(screen.getByText('@one')).toBeInTheDocument();
    expect(screen.getByText('@two')).toBeInTheDocument();
    expect(screen.getByText(/Anonymous 1 to public/)).toBeInTheDocument();
    expect(screen.getByText(/Anonymous 2 to public/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Author ID: uid-two' }));
    expect(h.ctx.openProfileForUser).toHaveBeenCalledWith('uid-two');
  });
});

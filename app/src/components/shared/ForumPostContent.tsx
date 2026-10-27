import type { ReactNode } from 'react';
import { User } from 'lucide-react';
import { publicAuthorLabel } from '@watershed/shared';

type Post = { title: string; author: string; authorUserName?: string; anonymous?: boolean; anonymousLabel?: string; date: string; content: string };

/** Shared by the published detail view and the pre-publication preview. */
export default function ForumPostContent({ post, children }: { post: Post; children?: ReactNode }) {
  return <>
    <div className="border-b pb-4 mb-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-2 break-words">{post.title}</h2>
      <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
        <span className="flex items-center gap-1 break-words"><User size={14} />{publicAuthorLabel({ anonymous: post.anonymous, anonymousLabel: post.anonymousLabel, authorName: post.author, authorUserName: post.authorUserName })}</span>
        <span>{post.date}</span>
        {children}
      </div>
    </div>
    <p className="text-gray-700 mb-6 whitespace-pre-wrap break-words">{post.content}</p>
  </>;
}

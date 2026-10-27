// components/shared/VoteButtons.jsx
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';

type VoteButtonsProps = {
  postId: string;
  replyId?: string;
  upvotes?: number;
  downvotes?: number;
};

export default function VoteButtons({ postId, replyId, upvotes, downvotes }: VoteButtonsProps) {
  const { handleVote, userVotes } = useApp();
  const score = (upvotes || 0) - (downvotes || 0);
  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        onClick={(e) => { e.stopPropagation(); handleVote(postId, replyId, 'up'); }}
        className={`p-1 rounded hover:bg-emerald-100 ${userVotes[`${postId}_${replyId || 'post'}_up`] ? 'text-emerald-600' : 'text-gray-400'}`}
      >
        <ThumbsUp size={14} />
      </button>
      <span className={`min-w-6 text-center ${score > 0 ? 'text-emerald-600' : score < 0 ? 'text-red-500' : 'text-gray-400'}`}>{score}</span>
      <button
        onClick={(e) => { e.stopPropagation(); handleVote(postId, replyId, 'down'); }}
        className={`p-1 rounded hover:bg-red-100 ${userVotes[`${postId}_${replyId || 'post'}_down`] ? 'text-red-500' : 'text-gray-400'}`}
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  );
}

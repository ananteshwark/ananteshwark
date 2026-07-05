import { useState, useEffect } from 'react';
import { Megaphone, Heart, MessageCircle, Pin, Trash2, BarChart2, Send } from 'lucide-react';
import { engagementApi } from '../../api/engagement';
import { useAuthStore } from '../../store/authStore';

function PostCard({ post, onChanged }: { post: any; onChanged: () => void }) {
  const user = useAuthStore(s => s.user);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [likeState, setLikeState] = useState<{ liked: boolean; likeCount: number }>({
    liked: (post.likedBy || []).includes(user?.id),
    likeCount: (post.likedBy || []).length,
  });

  const loadComments = async () => {
    const r = await engagementApi.getComments(post.id);
    setComments(r.data || []);
  };

  const toggleComments = async () => {
    if (!showComments) await loadComments();
    setShowComments(!showComments);
  };

  const like = async () => {
    const r = await engagementApi.toggleLike(post.id);
    setLikeState(r.data);
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    await engagementApi.addComment(post.id, comment);
    setComment('');
    await loadComments();
    onChanged();
  };

  const vote = async (optionId: string) => {
    await engagementApi.vote(post.id, optionId);
    onChanged();
  };

  const remove = async () => {
    if (!confirm('Delete this post?')) return;
    try {
      await engagementApi.deleteOwnPost(post.id);
    } catch {
      try { await engagementApi.moderatePost(post.id); } catch { alert('You cannot delete this post.'); return; }
    }
    onChanged();
  };

  const votes: Record<string, string> = post.pollVotes || {};
  const totalVotes = Object.keys(votes).length;
  const myVote = user ? votes[user.id] : undefined;

  return (
    <div className={`bg-white rounded-xl border p-4 ${post.type === 'ANNOUNCEMENT' ? 'border-amber-300 bg-amber-50/40' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {post.type === 'ANNOUNCEMENT' && <Megaphone className="h-4 w-4 text-amber-600" />}
          {post.pinned && <Pin className="h-3.5 w-3.5 text-gray-400" />}
          <div>
            <span className="text-sm font-medium">{post.authorName}</span>
            <span className="text-xs text-gray-400 ml-2">{new Date(post.createdAt).toLocaleString()}</span>
          </div>
        </div>
        {(post.authorUserId === user?.id || post.type !== 'ANNOUNCEMENT') && (
          <button onClick={remove} className="text-gray-300 hover:text-red-500 p-1" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {post.title && <h3 className="font-semibold mt-2">{post.title}</h3>}
      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{post.body}</p>

      {post.type === 'POLL' && post.pollOptions && (
        <div className="mt-3 space-y-1.5">
          {post.pollOptions.map((o: any) => {
            const count = Object.values(votes).filter(v => v === o.id).length;
            const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
            return (
              <button key={o.id} onClick={() => vote(o.id)}
                className={`w-full text-left relative border rounded-lg px-3 py-1.5 text-sm hover:border-blue-400 ${myVote === o.id ? 'border-blue-500' : ''}`}>
                <div className="absolute inset-y-0 left-0 bg-blue-100 rounded-lg" style={{ width: `${pct}%` }} />
                <span className="relative">{o.text} <span className="text-xs text-gray-500 ml-1">{pct}% ({count})</span></span>
              </button>
            );
          })}
          <p className="text-xs text-gray-400">{totalVotes} vote{totalVotes === 1 ? '' : 's'}{myVote ? ' — you voted' : ''}</p>
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <button onClick={like} className={`flex items-center gap-1 hover:text-red-500 ${likeState.liked ? 'text-red-500' : ''}`}>
          <Heart className="h-4 w-4" fill={likeState.liked ? 'currentColor' : 'none'} /> {likeState.likeCount}
        </button>
        <button onClick={toggleComments} className="flex items-center gap-1 hover:text-blue-600">
          <MessageCircle className="h-4 w-4" /> {post.commentCount || 0}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 border-t pt-3 space-y-2">
          {comments.map(c => (
            <div key={c.id} className="text-sm">
              <span className="font-medium">{c.authorName}</span>
              <span className="text-xs text-gray-400 ml-2">{new Date(c.createdAt).toLocaleString()}</span>
              <p className="text-gray-700">{c.body}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={comment} onChange={e => setComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendComment()}
              placeholder="Write a comment…" className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={sendComment} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeedPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'POST' | 'POLL' | 'ANNOUNCEMENT'>('POST');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [posting, setPosting] = useState(false);

  const load = () => {
    setLoading(true);
    engagementApi.getFeed(1, 50)
      .then(r => setPosts(r.data?.items || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const publish = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      if (mode === 'ANNOUNCEMENT') {
        await engagementApi.createAnnouncement({ title: title || 'Announcement', body, pinned: true });
      } else if (mode === 'POLL') {
        await engagementApi.createPost({
          type: 'POLL', title: title || undefined, body,
          pollOptions: options.filter(o => o.trim()).map(o => ({ id: '', text: o })),
        });
      } else {
        await engagementApi.createPost({ type: 'POST', title: title || undefined, body });
      }
      setTitle(''); setBody(''); setOptions(['', '']);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not publish');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Company Feed</h1>
        <p className="text-sm text-gray-500 mt-0.5">Announcements, posts, and polls across the company</p>
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-2">
        <div className="flex gap-2 text-xs">
          {(['POST', 'POLL', 'ANNOUNCEMENT'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full border ${mode === m ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              {m === 'POST' ? 'Post' : m === 'POLL' ? <span className="flex items-center gap-1"><BarChart2 className="h-3 w-3" />Poll</span> : <span className="flex items-center gap-1"><Megaphone className="h-3 w-3" />Announcement</span>}
            </button>
          ))}
        </div>
        {(mode !== 'POST') && (
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        )}
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
          placeholder={mode === 'POLL' ? 'Poll question…' : 'Share something with the company…'}
          className="w-full border rounded-lg px-3 py-2 text-sm" />
        {mode === 'POLL' && (
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <input key={i} value={o} onChange={e => setOptions(prev => prev.map((p, j) => j === i ? e.target.value : p))}
                placeholder={`Option ${i + 1}`} className="w-full border rounded-lg px-3 py-1.5 text-sm" />
            ))}
            <button onClick={() => setOptions([...options, ''])} className="text-xs text-blue-600 hover:underline">+ Add option</button>
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={publish} disabled={posting || !body.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {posting ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="p-8 text-center text-gray-400">Nothing here yet — start the conversation!</div>
      ) : (
        posts.map(p => <PostCard key={p.id} post={p} onChanged={load} />)
      )}
    </div>
  );
}

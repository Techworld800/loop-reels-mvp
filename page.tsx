'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import NotifyButton from './notify-button';
import { REACTIONS } from '@/lib/reactions';

type Reel = {
  id: string;
  platform: string;
  url: string;
  caption: string;
  shared_by: string;
  created_at: string;
  reactions?: Record<string, number>;
  mine?: string[];
};
type Burst = { id: number; reelId: string; emoji: string; x: number; r: number; d: number };

function parse(raw:string){try{const u=new URL(raw.trim());if(!['https:','http:'].includes(u.protocol))return null;const h=u.hostname.toLowerCase().replace(/^www\./,'');let platform='Link',embed:string|null=null;if(['youtube.com','m.youtube.com','youtu.be'].includes(h)){platform='YouTube';const id=h==='youtu.be'?u.pathname.split('/').filter(Boolean)[0]:(u.pathname==='/watch'?u.searchParams.get('v'):(u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)||[])[1]);if(id)embed='https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&rel=0';}else if(['instagram.com','instagr.am'].includes(h)){platform='Instagram';const m=u.pathname.match(/^\/(?:[^/]+\/)?(reel|reels|p|tv)\/([^/?#]+)/);if(m)embed='https://www.instagram.com/'+(m[1]==='reels'?'reel':m[1])+'/'+m[2]+'/embed';}else if(['facebook.com','m.facebook.com','fb.watch','web.facebook.com'].includes(h)){platform='Facebook';if(h.endsWith('facebook.com')&&/\/(reel|watch|videos|share\/v)\//.test(u.pathname))embed='https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(u.href)+'&show_text=false&width=500';}return{url:u.href,platform,embed};}catch{return null}}

function getDeviceId() {
  try {
    let id = localStorage.getItem('loop_device');
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'd' + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem('loop_device', id);
    }
    return id;
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2, 12);
  }
}

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function Home() {
  const [items, setItems] = useState<Reel[]>([]);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [toast, setToast] = useState<{ m: string; k: number } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const deviceRef = useRef('');
  const inflight = useRef(0);
  const parsed = useMemo(() => parse(url), [url]);

  const say = useCallback((m: string) => setToast({ m, k: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    deviceRef.current = getDeviceId();
    const q = new URLSearchParams(location.search);
    const sharedUrl = q.get('url') || '';
    const sharedText = q.get('text') || '';
    const sharedTitle = q.get('title') || '';
    const found = sharedUrl || sharedText.match(/https?:\/\/[^\s]+/)?.[0] || '';
    if (found && parse(found)) {
      setUrl(found);
      setCaption(sharedTitle || sharedText.replace(found, '').trim());
      history.replaceState({}, '', location.pathname);
    }
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current > 0) return; // don't overwrite a reaction that is still being saved
    try {
      const r = await fetch('/api/reels?device=' + encodeURIComponent(deviceRef.current), { cache: 'no-store' });
      const j = await r.json();
      if (inflight.current > 0) return;
      if (r.ok) {
        setItems(j.reels || []);
        setFeedError('');
        setLoaded(true);
      } else if (r.status === 503) setFeedError('Database setup is not finished yet.');
      else setFeedError(j.error || 'Could not load the feed.');
    } catch {
      setFeedError('Could not connect to the feed.');
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    refresh();
    const id = window.setInterval(refresh, 6000);
    return () => window.clearInterval(id);
  }, [ready, refresh]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!parsed) {
      say('Paste a valid reel URL.');
      return;
    }
    setBusy(true);
    try {
      let sender_endpoint: string | undefined;
      try {
        const reg = await navigator.serviceWorker.ready;
        sender_endpoint = (await reg.pushManager.getSubscription())?.endpoint;
      } catch {}
      const r = await fetch('/api/reels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: parsed.url, caption, shared_by: name || 'A friend', sender_endpoint }),
      });
      const j = await r.json();
      if (!r.ok) {
        say(j.error || 'Could not share this reel.');
        return;
      }
      setUrl('');
      setCaption('');
      say('Reel shared with your group ✨');
      await refresh();
    } catch {
      say('Connection issue. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function shareSite() {
    const publicUrl = location.origin + location.pathname;
    try {
      await navigator.share({ title: 'loop. — reels with your people', text: 'Share reels with your circle', url: publicUrl });
    } catch {
      try {
        await navigator.clipboard.writeText(publicUrl);
        say('Loop link copied. Send it to your friends.');
      } catch {
        say('Copy the website address to share it with friends.');
      }
    }
  }

  function applyReaction(id: string, emoji: string, on: boolean) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const reactions = { ...(it.reactions || {}) };
        reactions[emoji] = Math.max(0, (reactions[emoji] || 0) + (on ? 1 : -1));
        if (!reactions[emoji]) delete reactions[emoji];
        const mine = on ? [...(it.mine || []).filter((x) => x !== emoji), emoji] : (it.mine || []).filter((x) => x !== emoji);
        return { ...it, reactions, mine };
      })
    );
  }

  function burst(reelId: string, emoji: string) {
    const base = Date.now() + Math.random();
    const parts: Burst[] = Array.from({ length: 6 }, (_, i) => ({
      id: base + i,
      reelId,
      emoji,
      x: Math.round(Math.random() * 130 - 40),
      r: Math.round(Math.random() * 60 - 30),
      d: i * 55,
    }));
    setBursts((b) => [...b, ...parts]);
    window.setTimeout(() => setBursts((b) => b.filter((p) => !parts.includes(p))), 1500);
    try {
      navigator.vibrate?.(8);
    } catch {}
  }

  async function react(reel: Reel, emoji: string) {
    const on = !(reel.mine || []).includes(emoji);
    applyReaction(reel.id, emoji, on);
    if (on) burst(reel.id, emoji);
    inflight.current++;
    try {
      const r = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reel_id: reel.id, emoji, device_id: deviceRef.current, on }),
      });
      if (!r.ok) throw new Error('failed');
    } catch {
      applyReaction(reel.id, emoji, !on); // undo
      say('Could not save your reaction.');
    } finally {
      inflight.current--;
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <div className="brand">▣ loop<span className="dot">.</span></div>
        <div className="topbtns">
          <NotifyButton onNotice={say} />
          <button className="invite" onClick={shareSite}>↗ Share loop.</button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow rise" style={{ '--i': 0 } as CSSProperties}>✦ THE GROUP CHAT, BUT BETTER</div>
        <h1 className="rise" style={{ '--i': 1 } as CSSProperties}>Your people.<br /><span>Your kind of feed.</span></h1>
        <p className="rise" style={{ '--i': 2 } as CSSProperties}>Drop a reel. Keep scrolling. Let the group chat do its thing.</p>
        <div className="tags rise" style={{ '--i': 3 } as CSSProperties}>
          <span>♧ No accounts</span>
          <span>↗ Just share a link</span>
          <span>♡ Made for your circle</span>
        </div>
      </section>

      <section className="panel rise" style={{ '--i': 4 } as CSSProperties} id="share-panel">
        <h2>＋ Drop something good</h2>
        <p className="sub">Instagram, Facebook or YouTube Shorts</p>
        <form onSubmit={submit}>
          <label className="label" htmlFor="url">REEL LINK</label>
          <input className="url" id="url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste or share a reel link here…" />
          {url && (
            <div className={'detected' + (parsed ? ' ok' : '')}>
              {parsed ? '✓ ' + parsed.platform + ' link ready. The preview may not load, but sharing still works.' : 'Paste a complete valid URL.'}
            </div>
          )}
          <label className="label" htmlFor="caption">ADD A NOTE · OPTIONAL</label>
          <input className="caption" id="caption" maxLength={180} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. literally us 💀" />
          <div className="bottom">
            <input className="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" />
            <button className="share" disabled={busy}>{busy ? 'Sharing…' : '➤ Share reel'}</button>
          </div>
        </form>
        <div className="notice">Anyone with the website link can view and share reels. Posts sync automatically.</div>
      </section>

      <div className="feedhead">
        <div>
          <div className="eyebrow">FRESH FROM YOUR FRIENDS</div>
          <h2>The feed <span className="count">{items.length}</span></h2>
        </div>
        <span className="sub">Latest first</span>
      </div>

      {feedError && !items.length && <div className="feed-error" role="alert">{feedError}</div>}

      <section className="grid">
        {!loaded && !feedError && [0, 1].map((k) => (
          <div className="card skel" key={'s' + k} aria-hidden="true">
            <div className="meta"><div className="avatar sk" /><div className="sk-lines"><i /><i /></div></div>
            <div className="frame sk" />
          </div>
        ))}

        {items.map((it, idx) => {
          const p = parse(it.url);
          const counts = it.reactions || {};
          const mine = it.mine || [];
          return (
            <article className="card" key={it.id} style={{ animationDelay: Math.min(idx, 6) * 60 + 'ms' }}>
              <div className="meta">
                <div className="avatar">{(it.shared_by || 'A').slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="person">{it.shared_by || 'A friend'}</div>
                  <div className="time" title={new Date(it.created_at).toLocaleString()}>{ago(it.created_at)}</div>
                </div>
                <div className="platform">{p?.platform || it.platform}</div>
              </div>
              {it.caption && <p className="note">{it.caption}</p>}
              <div className={p?.platform === 'Instagram' && p?.embed ? 'frame ig' : 'frame'}>
                {p?.embed ? (
                  <iframe
                    loading="lazy"
                    title="Shared reel"
                    src={p.embed}
                    {...(p.platform === 'Instagram' ? { sandbox: 'allow-scripts allow-same-origin allow-presentation' } : {})}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <div className="fallback">
                    <strong>Open this reel</strong>
                    <p>This post may not support inline playback.</p>
                    <a href={it.url} target="_blank" rel="noopener noreferrer">Watch original ↗</a>
                  </div>
                )}
              </div>

              <div className="reactbar" role="group" aria-label="Reactions">
                {REACTIONS.map((emoji) => {
                  const n = counts[emoji] || 0;
                  const on = mine.includes(emoji);
                  return (
                    <button key={emoji} className={'react' + (on ? ' on' : '')} aria-pressed={on} aria-label={`React ${emoji}${n ? ', ' + n : ''}`} onClick={() => react(it, emoji)}>
                      <span className="emo" key={on ? 'on' : 'off'}>{emoji}</span>
                      {n > 0 && <span className="n" key={n}>{n}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="actions">
                <a className="original-link" href={it.url} target="_blank" rel="noopener noreferrer">{p?.platform === 'Instagram' ? 'Open in Instagram ↗' : 'Open original link ↗'}</a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(it.url);
                      say('Reel link copied.');
                    } catch {
                      say('Could not copy the link.');
                    }
                  }}
                >
                  Copy link
                </button>
              </div>

              <div className="burst" aria-hidden="true">
                {bursts.filter((b) => b.reelId === it.id).map((b) => (
                  <span key={b.id} style={{ '--x': b.x + 'px', '--r': b.r + 'deg', animationDelay: b.d + 'ms' } as CSSProperties}>{b.emoji}</span>
                ))}
              </div>
            </article>
          );
        })}

        {loaded && items.length === 0 && <div className="empty">No reels yet. Share the first one with your group ✨</div>}
      </section>

      <footer>
        <b>loop<span className="dot">.</span></b>
        <span>Less forwarding. More laughing. ✨</span>
        <span>FRIENDS-ONLY FEED</span>
      </footer>

      {toast && <div className="toast" key={toast.k} role="status">{toast.m}</div>}
    </main>
  );
}

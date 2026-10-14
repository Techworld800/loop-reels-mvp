'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Reel = { id: string; platform: string; url: string; caption: string; shared_by: string; created_at: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function parse(raw: string) {
  try {
    const u = new URL(raw.trim());
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    let platform = 'Link';
    let embed: string | null = null;
    if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(h)) {
      platform = 'YouTube';
      const id = h === 'youtu.be'
        ? u.pathname.split('/').filter(Boolean)[0]
        : (u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/) || [])[1]);
      if (id) embed = 'https://www.youtube-nocookie.com/embed/' + id;
    } else if (['instagram.com', 'instagr.am'].includes(h)) {
      platform = 'Instagram';
      const m = u.pathname.match(/^\/(reel|reels|p|tv)\/([^/]+)/);
      if (m) embed = 'https://www.instagram.com/' + m[1] + '/' + m[2] + '/embed';
    } else if (['facebook.com', 'm.facebook.com', 'fb.watch', 'web.facebook.com'].includes(h)) {
      platform = 'Facebook';
      if (h.endsWith('facebook.com') && /\/(reel|watch|videos|share\/v)\//.test(u.pathname)) {
        embed = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(u.href) + '&show_text=false&width=500';
      }
    }
    return { url: u.href, platform, embed };
  } catch {
    return null;
  }
}

export default function Home() {
  const [items, setItems] = useState<Reel[]>([]);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const parsed = useMemo(() => parse(url), [url]);

  useEffect(() => {
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

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setShowInstallHelp(false);
      setNotice('Loop is installed on your phone. Welcome in ✨');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/reels', { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) {
        const nextItems: Reel[] = j.reels || [];
        setItems(current => {
          if (current.length === nextItems.length && current.every((item, index) => {
            const next = nextItems[index];
            return item.id === next.id && item.url === next.url && item.caption === next.caption &&
              item.shared_by === next.shared_by && item.created_at === next.created_at && item.platform === next.platform;
          })) return current;
          return nextItems;
        });
      }
      else if (r.status === 503) setNotice('Database setup is not finished yet.');
      else setNotice(j.error || 'Could not load the feed.');
    } catch {
      setNotice('Could not connect to the feed.');
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    let id: number | undefined;
    const startPolling = () => {
      if (document.visibilityState === 'visible' && id === undefined) {
        void refresh();
        id = window.setInterval(refresh, 20000);
      }
    };
    const stopPolling = () => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };
    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [ready, refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) { setNotice('Paste a valid reel URL.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/reels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: parsed.url, caption, shared_by: name || 'A friend' }),
      });
      const j = await r.json();
      if (!r.ok) { setNotice(j.error || 'Could not share this reel.'); return; }
      setUrl('');
      setCaption('');
      setNotice('Reel shared with your group ✨');
      await refresh();
    } catch {
      setNotice('Connection issue. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function shareSite() {
    const publicUrl = location.origin + location.pathname;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'loop. — reels with your people', text: 'Share reels with your circle', url: publicUrl });
      } else {
        await navigator.clipboard.writeText(publicUrl);
        setNotice('Loop link copied. Send it to your friends.');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(publicUrl);
        setNotice('Loop link copied. Send it to your friends.');
      } catch {
        setNotice('Copy the website address to share it with friends.');
      }
    }
  }

  async function installApp() {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setNotice('Installing Loop on your phone…');
    else setNotice('No worries — you can install Loop whenever you like.');
    setInstallPrompt(null);
  }

  return (
    <main className="shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="top">
        <a className="brand" href="/" aria-label="Loop home"><span className="brand-mark">↗</span> loop<span className="dot">.</span></a>
        <div className="top-actions">
          <button className="install-button" onClick={installApp}><span aria-hidden="true">↓</span> Install app</button>
          <button className="invite" onClick={shareSite}><span aria-hidden="true">↗</span> Share loop</button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="pulse-dot" /> YOUR CIRCLE. YOUR CULTURE.</div>
        <h1>Good reels.<br /><span>Better together.</span></h1>
        <p>Your group chat has a home now. Drop the reel, add a little context, let the chaos begin.</p>
        <div className="hero-orbit" aria-hidden="true">
          <span className="orbit-chip chip-one">✦ no algorithm</span>
          <span className="orbit-chip chip-two">♡ just your people</span>
          <span className="orbit-chip chip-three">↗ pass the vibe</span>
          <div className="orbit-core"><span>loop<span className="dot">.</span></span><i>✳</i></div>
        </div>
        <div className="tags"><span>✳ No accounts</span><span>↗ One link to share</span><span>♡ Made for your circle</span></div>
      </section>

      {showInstallHelp && (
        <section className="install-help" role="dialog" aria-labelledby="install-title">
          <button className="close-help" aria-label="Close installation help" onClick={() => setShowInstallHelp(false)}>×</button>
          <div className="help-icon">↓</div>
          <div className="help-copy">
            <h2 id="install-title">Add Loop to your home screen</h2>
            <p><strong>Android / Chrome:</strong> tap the browser menu ⋮, then choose <em>Install app</em> or <em>Add to Home screen</em>.</p>
            <p><strong>iPhone / Safari:</strong> tap Share ↑, then <em>Add to Home Screen</em>.</p>
            <p className="help-note">If the install option is missing, open the site directly in Chrome (Android) or Safari (iPhone), not inside an Instagram or WhatsApp browser.</p>
          </div>
        </section>
      )}

      <section className="panel" id="share-panel">
        <div className="panel-heading">
          <div className="panel-icon">＋</div>
          <div><h2>Drop something good</h2><p className="sub">A little something for the group chat.</p></div>
          <span className="live-pill"><span /> OPEN</span>
        </div>
        <form onSubmit={submit}>
          <label className="label" htmlFor="url">THE REEL LINK</label>
          <input className="url" id="url" type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste an Instagram, Facebook or YouTube link…" />
          {url && <div className="detected">{parsed ? '✓ ' + parsed.platform + ' link detected — ready to share.' : 'Paste a complete valid URL.'}</div>}
          <label className="label" htmlFor="caption">ADD A NOTE <span>· OPTIONAL</span></label>
          <input className="caption" id="caption" maxLength={180} value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. literally us 💀" />
          <div className="bottom">
            <input className="name" maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" aria-label="Your name (optional)" />
            <button className="share" disabled={busy}>{busy ? <><span className="button-spinner" /> Sharing…</> : <>Share reel <span>↗</span></>}</button>
          </div>
        </form>
        <div className="notice" role="status">{notice || 'Anyone with the link can join the fun. New reels sync automatically.'}</div>
      </section>

      <div className="feedhead">
        <div><div className="eyebrow">FRESH FROM YOUR FRIENDS</div><h2>The feed <span className="count">{items.length}</span></h2></div>
        <span className="feed-sort"><span className="pulse-dot" /> LIVE · LATEST FIRST</span>
      </div>

      <section className="grid">
        {items.map((it, index) => {
          const p = parse(it.url);
          return (
            <article className="card" key={it.id} style={{ animationDelay: Math.min(index * 75, 450) + 'ms' }}>
              <div className="meta">
                <div className="avatar">{(it.shared_by || 'A').slice(0, 1).toUpperCase()}</div>
                <div className="person-block"><div className="person">{it.shared_by || 'A friend'}</div><div className="time">{new Date(it.created_at).toLocaleString()}</div></div>
                <div className="platform">{p?.platform || it.platform}</div>
              </div>
              {it.caption && <p className="note">{it.caption}</p>}
              <div className="frame">
                {p?.embed ? <iframe loading="lazy" title="Shared reel" src={p.embed} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div className="fallback"><span className="fallback-play">↗</span><strong>Open this reel</strong><p>This post may not support inline playback.</p><a href={it.url} target="_blank" rel="noopener noreferrer">Watch original ↗</a></div>}
              </div>
              <div className="actions"><a className="original-link" href={it.url} target="_blank" rel="noopener noreferrer">{p?.platform === 'Instagram' ? 'Open on Instagram ↗' : 'Open original ↗'}</a><button onClick={async () => { try { await navigator.clipboard.writeText(it.url); setNotice('Reel link copied.'); } catch { setNotice('Could not copy the link.'); } }}>Copy link</button></div>
            </article>
          );
        })}
        {items.length === 0 && <div className="empty"><div className="empty-art">✳</div><strong>It’s a little quiet in here.</strong><p>Be the first to drop a reel and set the vibe.</p><a href="#share-panel">Share the first reel ↗</a></div>}
      </section>

      <footer><a className="footer-brand" href="/">loop<span className="dot">.</span></a><span>Less forwarding. More laughing. ✨</span><span>BUILT FOR YOUR INNER CIRCLE</span></footer>
    </main>
  );
}

/**
 * BrandLore Audio Player
 * Floating sticky documentary-style audio narration for brand story pages.
 * Uses Web Speech API — zero dependencies, zero cost, works offline.
 */

(function () {
  'use strict';

  /* ─── CONFIG ─── */
 const BRAND_VOICES = {
  rate: 0.88,
  pitch: 0.92,
  volume: 1.0
};
  
  const SECTION_INTROS = {
    timeline : '... The journey. ...',
    strategies: '... The playbook. The specific strategies that built this company. ...',
    lesson   : '... What this story teaches every founder. ...',
    quote    : '... A defining quote. ...'
  };

  /* ─── EXTRACT NARRATION FROM PAGE ─── */
  function buildScript() {
    const lines = [];

    // Brand name + tagline
    const titleEl = document.querySelector('.story-title');
    const tagEl   = document.querySelector('.story-tagline');
    const catEl   = document.querySelector('.story-cat');

    if (catEl)   lines.push(catEl.innerText.trim() + '. ...');
    if (titleEl) lines.push(titleEl.innerText.replace(/\n/g, '. ').trim() + '. ...');
    if (tagEl)   lines.push(tagEl.innerText.trim() + ' ...');

    // Founding facts
    const facts = document.querySelectorAll('.founding-fact');
    if (facts.length) {
      lines.push('... The founding facts. ...');
      facts.forEach(f => {
        const label = f.querySelector('.ff-label');
        const val   = f.querySelector('.ff-val');
        if (label && val) lines.push(label.innerText.trim() + ': ' + val.innerText.trim() + '. ...');
      });
    }

    // Timeline
    const tlEntries = document.querySelectorAll('.tl-entry');
    if (tlEntries.length) {
      lines.push(SECTION_INTROS.timeline);
      tlEntries.forEach(entry => {
        const yr   = entry.querySelector('.tl-year-text');
        const ttl  = entry.querySelector('.tl-event-title');
        const txt  = entry.querySelector('.tl-event-text');
        if (yr && ttl) {
          lines.push('... ' + yr.innerText.trim() + '. ' + ttl.innerText.trim() + '. ...');
          if (txt) lines.push(txt.innerText.trim() + ' ...');
        }
      });
    }

    // Milestone banners (amazon.html style)
    const milestones = document.querySelectorAll('.tl-milestone-text');
    milestones.forEach(m => lines.push('... Key milestone. ' + m.innerText.trim() + ' ...'));

    // Strategies
    const stratCards = document.querySelectorAll('.strategy-card');
    if (stratCards.length) {
      lines.push(SECTION_INTROS.strategies);
      stratCards.forEach(card => {
        const num  = card.querySelector('.strategy-num');
        const ttl  = card.querySelector('.strategy-title');
        const txt  = card.querySelector('.strategy-text');
        const imp  = card.querySelector('.strategy-impact');
        if (ttl) {
          lines.push('... Strategy ' + (num ? num.innerText.trim() : '') + '. ' + ttl.innerText.trim() + '. ...');
          if (txt) lines.push(txt.innerText.trim() + ' ...');
          if (imp) lines.push(imp.innerText.replace('→', 'Result:').trim() + ' ...');
        }
      });
    }

    // Pull quote
    const quote = document.querySelector('.pull-quote');
    const attr  = document.querySelector('.quote-attr');
    if (quote) {
      lines.push(SECTION_INTROS.quote);
      lines.push(quote.innerText.trim() + ' ...');
      if (attr) lines.push(attr.innerText.trim() + ' ...');
    }

    // Lessons
    const lessonCards = document.querySelectorAll('.lesson-card');
    if (lessonCards.length) {
      lines.push(SECTION_INTROS.lesson);
      lessonCards.forEach(card => {
        const ttl = card.querySelector('.lesson-title');
        const txt = card.querySelector('.lesson-text');
        if (ttl) {
          lines.push('... ' + ttl.innerText.trim() + '. ...');
          if (txt) lines.push(txt.innerText.trim() + ' ...');
        }
      });
    }

    return lines.join(' ');
  }

  /* ─── PLAYER STATE ─── */
  let synth       = window.speechSynthesis;
  let utterance   = null;
  let isPlaying   = false;
  let isPaused    = false;
  let currentTime = 0;        // estimated seconds elapsed
  let totalTime   = 0;        // estimated seconds total
  let ticker      = null;
  let scriptText  = '';
  let charIndex   = 0;        // track position for resume

  /* ─── INJECT PLAYER HTML ─── */
  function createPlayer() {
    const player = document.createElement('div');
    player.id = 'bl-audio-player';
    player.innerHTML = `
      <div class="bl-player-inner">

        <!-- LEFT: brand info -->
        <div class="bl-info">
          <div class="bl-icon">🎙️</div>
          <div class="bl-text">
            <div class="bl-brand" id="bl-brand-name">Loading story…</div>
            <div class="bl-label">BrandLore Audio · Documentary</div>
          </div>
        </div>

        <!-- CENTER: controls + progress -->
        <div class="bl-center">
          <div class="bl-controls">
            <button class="bl-btn bl-skip" id="bl-rewind" title="Rewind 15s">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.51"></path><text x="8" y="16" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">15</text></svg>
            </button>
            <button class="bl-btn bl-play-pause" id="bl-playpause" title="Play">
              <svg class="bl-icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg class="bl-icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
            <button class="bl-btn bl-skip" id="bl-forward" title="Forward 15s">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-.49-3.51"></path><text x="8" y="16" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">15</text></svg>
            </button>
          </div>
          <div class="bl-progress-wrap">
            <span class="bl-time" id="bl-current">0:00</span>
            <div class="bl-progress-bar" id="bl-bar">
              <div class="bl-progress-fill" id="bl-fill"></div>
              <div class="bl-progress-thumb" id="bl-thumb"></div>
            </div>
            <span class="bl-time" id="bl-total">0:00</span>
          </div>
        </div>

        <!-- RIGHT: speed + close -->
        <div class="bl-right">
          <button class="bl-speed-btn" id="bl-speed" title="Playback speed">1×</button>
          <button class="bl-btn bl-close-btn" id="bl-close" title="Close player">✕</button>
        </div>

      </div>
      <!-- waveform bars (decorative) -->
      <div class="bl-wave" id="bl-wave">
        ${Array.from({length: 28}, (_,i) => `<div class="bl-bar" style="animation-delay:${(i*0.07).toFixed(2)}s"></div>`).join('')}
      </div>
    `;
    document.body.appendChild(player);
    return player;
  }

  /* ─── INJECT STYLES ─── */
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── FLOATING PLAYER ── */
      #bl-audio-player {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 9999;
        background: #0f0f0f;
        border-top: 1px solid rgba(192,57,43,0.4);
        box-shadow: 0 -8px 40px rgba(0,0,0,0.5);
        transform: translateY(100%);
        transition: transform 0.45s cubic-bezier(0.16,1,0.3,1);
        font-family: 'DM Sans', sans-serif;
        user-select: none;
      }
      #bl-audio-player.bl-visible {
        transform: translateY(0);
      }

      .bl-player-inner {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        padding: 0.85rem 2rem;
        position: relative;
        z-index: 2;
      }

      /* LEFT */
      .bl-info { display: flex; align-items: center; gap: 0.75rem; min-width: 180px; }
      .bl-icon { font-size: 1.4rem; flex-shrink: 0; }
      .bl-brand { font-size: 0.88rem; font-weight: 500; color: #f7f3ee; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
      .bl-label { font-size: 0.68rem; color: rgba(247,243,238,0.35); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 2px; }

      /* CENTER */
      .bl-center { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }

      .bl-controls { display: flex; align-items: center; gap: 0.6rem; }
      .bl-btn {
        background: none; border: none; cursor: pointer; color: rgba(247,243,238,0.7);
        display: flex; align-items: center; justify-content: center;
        transition: color 0.2s, transform 0.15s;
        padding: 0.3rem;
      }
      .bl-btn:hover { color: #f7f3ee; transform: scale(1.12); }
      .bl-play-pause {
        width: 44px; height: 44px; border-radius: 50%;
        background: #c0392b !important; color: #fff !important;
        box-shadow: 0 0 20px rgba(192,57,43,0.4);
        transition: background 0.2s, transform 0.15s, box-shadow 0.2s !important;
      }
      .bl-play-pause:hover { background: #a93224 !important; transform: scale(1.08) !important; box-shadow: 0 0 28px rgba(192,57,43,0.6) !important; }
      .bl-skip svg text { dominant-baseline: middle; }

      /* PROGRESS */
      .bl-progress-wrap { width: 100%; display: flex; align-items: center; gap: 0.6rem; }
      .bl-time { font-size: 0.7rem; color: rgba(247,243,238,0.4); font-variant-numeric: tabular-nums; min-width: 30px; }
      #bl-current { text-align: right; }
      #bl-total   { text-align: left; }
      .bl-progress-bar {
        flex: 1; height: 4px; background: rgba(255,255,255,0.1);
        border-radius: 2px; position: relative; cursor: pointer;
        transition: height 0.2s;
      }
      .bl-progress-bar:hover { height: 6px; }
      .bl-progress-fill {
        height: 100%; background: #c0392b; border-radius: 2px;
        width: 0%; transition: width 0.5s linear;
        pointer-events: none;
      }
      .bl-progress-thumb {
        position: absolute; top: 50%; right: 0;
        transform: translate(50%, -50%);
        width: 12px; height: 12px; border-radius: 50%;
        background: #c0392b; opacity: 0;
        transition: opacity 0.2s; pointer-events: none;
      }
      .bl-progress-bar:hover .bl-progress-thumb { opacity: 1; }

      /* RIGHT */
      .bl-right { display: flex; align-items: center; gap: 0.5rem; }
      .bl-speed-btn {
        background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
        color: rgba(247,243,238,0.65); font-family: 'DM Sans', sans-serif;
        font-size: 0.75rem; padding: 0.3rem 0.6rem; cursor: pointer;
        transition: all 0.2s; letter-spacing: 0.04em; font-weight: 500;
      }
      .bl-speed-btn:hover { background: rgba(255,255,255,0.14); color: #f7f3ee; }
      .bl-close-btn { font-size: 0.85rem; opacity: 0.4; }
      .bl-close-btn:hover { opacity: 1; transform: none !important; }

      /* WAVEFORM */
      .bl-wave {
        position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
        display: flex; align-items: flex-end; gap: 2px; padding: 0 2rem;
        overflow: hidden; opacity: 0; transition: opacity 0.4s;
        pointer-events: none;
      }
      #bl-audio-player.bl-playing .bl-wave { opacity: 1; }
      .bl-bar {
        flex: 1; background: rgba(192,57,43,0.5); border-radius: 1px;
        height: 3px; transform-origin: bottom;
      }
      #bl-audio-player.bl-playing .bl-bar {
        animation: blWave 0.8s ease-in-out infinite alternate;
      }
      @keyframes blWave {
        0%   { height: 2px; opacity: 0.3; }
        100% { height: 14px; opacity: 0.9; }
      }

      /* LISTEN BUTTON injected into each story page */
      .bl-listen-trigger {
        display: inline-flex; align-items: center; gap: 0.6rem;
        padding: 0.7rem 1.4rem;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15);
        color: rgba(247,243,238,0.8); font-family: 'DM Sans', sans-serif;
        font-size: 0.8rem; font-weight: 500; letter-spacing: 0.08em;
        text-transform: uppercase; cursor: pointer;
        transition: all 0.25s; margin-top: 1.8rem;
      }
      .bl-listen-trigger:hover { background: rgba(192,57,43,0.15); border-color: rgba(192,57,43,0.5); color: #f7f3ee; }
      .bl-listen-trigger .bl-pulse {
        width: 8px; height: 8px; border-radius: 50%; background: #c0392b;
        animation: blPulse 1.5s ease-in-out infinite;
      }
      @keyframes blPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.5); opacity: 0.5; }
      }

      /* HIGHLIGHT scrolling section */
      .bl-reading {
        outline: 2px solid rgba(192,57,43,0.25);
        outline-offset: 6px;
        background: rgba(192,57,43,0.04) !important;
        border-radius: 2px;
        transition: outline 0.3s, background 0.3s;
      }

      /* RESPONSIVE */
      @media(max-width:700px) {
        .bl-player-inner { padding: 0.75rem 1rem; gap: 0.8rem; }
        .bl-info { min-width: 0; }
        .bl-brand { max-width: 90px; font-size: 0.78rem; }
        .bl-label { display: none; }
        .bl-skip { display: none; }
        .bl-speed-btn { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ─── HELPERS ─── */
  function fmtTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function estimateDuration(text) {
    // Documentary pace ~120 words/min
    const words = text.split(/\s+/).length;
    return Math.ceil((words / 120) * 60);
  }

  function getBrandName() {
    const el = document.querySelector('.story-title');
    if (!el) return 'Brand Story';
    return el.innerText.split('\n')[0].trim();
  }

  /* ─── PLAYBACK ─── */
  let speedSteps = [0.75, 0.88, 1.0, 1.15, 1.3];
  let speedIdx   = 1; // default 0.88 (documentary)

  function getVoice() {
  const voices = synth.getVoices();

  // Prefer the most natural sounding voices
  const preferred = [
    'Google UK English Male',
    'Google UK English Female',
    'Microsoft Aria Online (Natural)',
    'Microsoft Guy Online (Natural)',
    'Alex'
  ];

  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }

  // fallback
  return voices.find(v => v.lang.includes('en-IN')) ||
         voices.find(v => v.lang.startsWith('en')) ||
         voices[0];
}

  function speak(fromChar = 0) {
    synth.cancel();
    const text = fromChar > 0 ? scriptText.slice(fromChar) : scriptText;
    utterance = new SpeechSynthesisUtterance(text);
   utterance.rate   = speedSteps[speedIdx] * BRAND_VOICES.rate;
    utterance.pitch  = BRAND_VOICES.pitch;
    utterance.volume = BRAND_VOICES.volume;

    const voice = getVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      isPlaying = true; isPaused = false;
      updateUI();
      startTicker();
    };
    utterance.onend = () => {
      isPlaying = false; isPaused = false;
      currentTime = totalTime;
      updateUI();
      stopTicker();
      document.getElementById('bl-fill').style.width = '100%';
    };
    utterance.onerror = () => {
      isPlaying = false; stopTicker(); updateUI();
    };
    utterance.onboundary = (e) => {
      if (e.name === 'word') {
        charIndex = fromChar + e.charIndex;
        highlightSection(charIndex);
      }
    };

    synth.speak(utterance);
  }

  function startTicker() {
    stopTicker();
    ticker = setInterval(() => {
      if (isPlaying && !isPaused) {
        currentTime = Math.min(currentTime + 1, totalTime);
        updateProgress();
      }
    }, 1000);
  }

  function stopTicker() {
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function updateProgress() {
    const pct = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;
    document.getElementById('bl-fill').style.width = pct + '%';
    document.getElementById('bl-current').textContent = fmtTime(currentTime);
    // Move thumb
    const thumb = document.getElementById('bl-thumb');
    thumb.style.left = pct + '%';
    thumb.style.right = 'auto';
    thumb.style.transform = 'translate(-50%, -50%)';
  }

  function updateUI() {
    const player = document.getElementById('bl-audio-player');
    const playBtn = document.getElementById('bl-playpause');
    const iconPlay  = playBtn.querySelector('.bl-icon-play');
    const iconPause = playBtn.querySelector('.bl-icon-pause');

    if (isPlaying && !isPaused) {
      player.classList.add('bl-playing');
      iconPlay.style.display  = 'none';
      iconPause.style.display = 'block';
    } else {
      player.classList.remove('bl-playing');
      iconPlay.style.display  = 'block';
      iconPause.style.display = 'none';
    }
  }

  /* ─── SECTION HIGHLIGHT ─── */
  const allSections = [];
  function buildSectionMap() {
    // Map text positions to DOM elements for scroll tracking
    const els = document.querySelectorAll('.tl-body, .strategy-card, .lesson-card');
    els.forEach(el => allSections.push(el));
  }

  let lastHighlighted = null;
  function highlightSection(charPos) {
    // Simple heuristic: every ~400 chars = next section
    const sectionIdx = Math.floor(charPos / 400) % allSections.length;
    const el = allSections[sectionIdx];
    if (el && el !== lastHighlighted) {
      if (lastHighlighted) lastHighlighted.classList.remove('bl-reading');
      el.classList.add('bl-reading');
      lastHighlighted = el;
      // Soft scroll into view
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearHighlight() {
    if (lastHighlighted) { lastHighlighted.classList.remove('bl-reading'); lastHighlighted = null; }
  }

  /* ─── SEEK ─── */
  function seekTo(pct) {
    const targetTime = totalTime * pct;
    const targetChar = Math.floor(scriptText.length * pct);
    currentTime = targetTime;
    charIndex = targetChar;
    updateProgress();
    if (isPlaying || isPaused) {
      synth.cancel(); stopTicker();
      speak(targetChar);
    }
  }

  /* ─── SKIP ─── */
  function skip(seconds) {
    const pct = Math.max(0, Math.min(1, (currentTime + seconds) / totalTime));
    seekTo(pct);
  }

  /* ─── LISTEN TRIGGER BUTTON ─── */
  function injectListenButton() {
    const tagline = document.querySelector('.story-tagline, .story-hero-left .stat-row');
    if (!tagline) return;
    const btn = document.createElement('button');
    btn.className = 'bl-listen-trigger';
    btn.innerHTML = `<span class="bl-pulse"></span> Listen to this story`;
    btn.onclick = () => openPlayer();
    tagline.insertAdjacentElement('afterend', btn);
  }

  /* ─── OPEN / CLOSE ─── */
  function openPlayer() {
    const player = document.getElementById('bl-audio-player');
    player.classList.add('bl-visible');
    // Auto-play
    if (!isPlaying && !isPaused) {
      currentTime = 0; charIndex = 0;
      speak(0);
    }
  }

  function closePlayer() {
    synth.cancel(); stopTicker(); clearHighlight();
    isPlaying = false; isPaused = false; currentTime = 0;
    const player = document.getElementById('bl-audio-player');
    player.classList.remove('bl-visible', 'bl-playing');
    updateUI();
  }

  /* ─── INIT ─── */
  function init() {
    injectStyles();
    createPlayer();
    injectListenButton();
    buildSectionMap();

    // Build script
    scriptText = buildScript();
    totalTime  = estimateDuration(scriptText);

    // Set brand name
    document.getElementById('bl-brand-name').textContent = getBrandName();
    document.getElementById('bl-total').textContent = fmtTime(totalTime);

    // Voices may load async
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => {}; // trigger voice load
    }

    // ── EVENTS ──

    // Play/Pause
    document.getElementById('bl-playpause').onclick = () => {
      if (!isPlaying && !isPaused) {
        // Fresh start
        currentTime = 0; charIndex = 0; speak(0);
      } else if (isPlaying && !isPaused) {
        // Pause
        synth.pause(); isPaused = true; isPlaying = false;
        stopTicker(); updateUI();
      } else if (isPaused) {
        // Resume
        synth.resume(); isPlaying = true; isPaused = false;
        updateUI(); startTicker();
      }
    };

    // Rewind 15s
    document.getElementById('bl-rewind').onclick = () => skip(-15);

    // Forward 15s
    document.getElementById('bl-forward').onclick = () => skip(15);

    // Progress bar click / drag
    const bar = document.getElementById('bl-bar');
    bar.addEventListener('click', e => {
      const rect = bar.getBoundingClientRect();
      const pct  = (e.clientX - rect.left) / rect.width;
      seekTo(Math.max(0, Math.min(1, pct)));
    });

    // Speed toggle
    const speedBtn = document.getElementById('bl-speed');
    const speedLabels = ['0.75×', '0.9×', '1×', '1.15×', '1.3×'];
    speedBtn.onclick = () => {
      speedIdx = (speedIdx + 1) % speedSteps.length;
      speedBtn.textContent = speedLabels[speedIdx];
      if (isPlaying || isPaused) {
        const pos = charIndex;
        const wasPlaying = isPlaying;
        synth.cancel(); stopTicker();
        if (wasPlaying) speak(pos);
        else { isPaused = false; isPlaying = false; updateUI(); }
      }
    };

    // Close
    document.getElementById('bl-close').onclick = () => closePlayer();

    // Stop speech when navigating away
    window.addEventListener('beforeunload', () => synth.cancel());
  }

  // Wait for DOM + voices
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
(function (global) {
  'use strict';

  function BrandLoreAudio(config = {}) {

    /* ─── DEFAULT CONFIG ─── */
    const settings = {
      rate: 0.78,
      pitch: 0.85,
      volume: 1,
      speedSteps: [0.75, 0.88, 1.0, 1.15, 1.3],

      selectors: {
        title: '.story-title',
        tagline: '.story-tagline',
        category: '.story-cat',
        sections: '.tl-body, .strategy-card, .lesson-card'
      },

      autoPlay: false,

      ...config
    };

    /* ─── STATE ─── */
    let synth = window.speechSynthesis;
    let utterance = null;

    let isPlaying = false;
    let isPaused = false;

    let scriptText = '';
    let charIndex = 0;

    let totalTime = 0;
    let currentTime = 0;

    let speedIdx = 1;

    let sectionMap = [];
    let lastHighlighted = null;

    let playerEl = null;

    /* ─── HELPERS ─── */
    const clean = str => str.replace(/\s+/g, ' ').trim();

    function estimateDuration(text) {
      const words = text.split(/\s+/).length;
      return Math.ceil((words / 120) * 60);
    }

    function fmtTime(secs) {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ─── SCRIPT BUILDER ─── */
    function buildScript() {
      const lines = [];

      const title = document.querySelector(settings.selectors.title);
      const tagline = document.querySelector(settings.selectors.tagline);
      const cat = document.querySelector(settings.selectors.category);

      if (cat) lines.push(clean(cat.innerText) + '.');
      if (title) lines.push(clean(title.innerText));
      if (tagline) lines.push(clean(tagline.innerText));

      return lines.join(' ');
    }

    /* ─── SECTION MAP ─── */
    function buildSectionMap() {
      sectionMap = [];
      let cursor = 0;

      const elements = document.querySelectorAll(settings.selectors.sections);

      elements.forEach(el => {
        const text = el.innerText || '';
        const len = text.length;

        sectionMap.push({
          start: cursor,
          end: cursor + len,
          el
        });

        cursor += len;
      });
    }

    function highlight(charPos) {
      const match = sectionMap.find(s => charPos >= s.start && charPos < s.end);
      if (!match) return;

      if (lastHighlighted) lastHighlighted.classList.remove('bl-reading');

      match.el.classList.add('bl-reading');
      lastHighlighted = match.el;

      match.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* ─── VOICE ─── */
    function getVoice() {
      const voices = synth.getVoices();
      return voices.find(v => v.lang.includes('en')) || voices[0];
    }

    /* ─── SPEAK ─── */
    function speak(from = 0) {
      synth.cancel();

      const text = scriptText.slice(from);
      utterance = new SpeechSynthesisUtterance(text);

      utterance.rate = settings.rate * settings.speedSteps[speedIdx];
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;

      utterance.voice = getVoice();

      utterance.onstart = () => {
        isPlaying = true;
        isPaused = false;
        updateUI();
      };

      utterance.onend = () => {
        isPlaying = false;
        isPaused = false;
        currentTime = totalTime;
        updateUI();
      };

      utterance.onboundary = (e) => {
        if (e.name === 'word') {
          charIndex = from + e.charIndex;

          const pct = charIndex / scriptText.length;
          currentTime = totalTime * pct;

          updateProgress();
          highlight(charIndex);
        }
      };

      synth.speak(utterance);
    }

    /* ─── UI ─── */
    function createUI() {
      playerEl = document.createElement('div');
      playerEl.id = 'bl-player';

      playerEl.innerHTML = `
        <div class="bl-inner">
          <button id="bl-play">▶</button>
          <button id="bl-pause">⏸</button>
          <span id="bl-time">0:00</span>
        </div>
      `;

      document.body.appendChild(playerEl);

      document.getElementById('bl-play').onclick = play;
      document.getElementById('bl-pause').onclick = pause;
    }

    function updateProgress() {
      const timeEl = document.getElementById('bl-time');
      if (timeEl) timeEl.textContent = fmtTime(currentTime);
    }

    function updateUI() {
      // extend later
    }

    /* ─── CONTROLS ─── */
    function play() {
      if (!isPlaying && !isPaused) {
        speak(0);
      } else if (isPaused) {
        synth.resume();
        isPaused = false;
        isPlaying = true;
      }
    }

    function pause() {
      synth.pause();
      isPaused = true;
      isPlaying = false;
    }

    function stop() {
      synth.cancel();
      isPlaying = false;
      isPaused = false;
      charIndex = 0;
    }

    function seek(pct) {
      const char = Math.floor(scriptText.length * pct);
      charIndex = char;
      speak(char);
    }

    function setSpeed(idx) {
      speedIdx = idx;
      if (isPlaying) {
        speak(charIndex);
      }
    }

    /* ─── INIT ─── */
    function init() {
      if (!('speechSynthesis' in window)) {
        console.warn('Speech API not supported');
        return;
      }

      scriptText = buildScript();
      totalTime = estimateDuration(scriptText);

      buildSectionMap();
      createUI();

      if (settings.autoPlay) play();
    }

    /* ─── PUBLIC API ─── */
    return {
      init,
      play,
      pause,
      stop,
      seek,
      setSpeed,
      getState: () => ({
        isPlaying,
        isPaused,
        currentTime,
        totalTime
      })
    };
  }

  /* ─── EXPORT ─── */
  global.BrandLoreAudio = {
    create: (config) => BrandLoreAudio(config)
  };

})(window);

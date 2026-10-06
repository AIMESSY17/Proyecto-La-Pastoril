const GAME_SECONDS = 30;
const RECORD_KEY = 'lapastoril-game-record';
const SECRET_WORD = 'huevo';

const readRecord = () => { try { return Number(localStorage.getItem(RECORD_KEY)) || 0; } catch { return 0; } };
const writeRecord = (value) => { try { localStorage.setItem(RECORD_KEY, String(value)); } catch { /* sin storage */ } };

export function initEggGame() {
  const trigger = document.getElementById('eggTrigger');
  const modal = document.getElementById('gameModal');
  const canvas = document.getElementById('eggGame');
  const startBtn = document.getElementById('gameStart');
  const closeBtn = document.getElementById('gameClose');
  const scoreEl = document.getElementById('gameScore');
  const timeEl = document.getElementById('gameTime');
  const resultEl = document.getElementById('gameResult');
  if (!trigger || !modal || !canvas || !startBtn || !closeBtn) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const basket = { x: W / 2, w: 96 };
  let eggs = [];
  let score = 0;
  let seconds = GAME_SECONDS;
  let running = false;
  let raf = 0;
  let timer = 0;
  let clicks = 0;
  let clickTimer = 0;
  let typed = '';

  const clampBasket = () => { basket.x = Math.max(basket.w / 2, Math.min(W - basket.w / 2, basket.x)); };

  function draw() {
    const night = document.documentElement.dataset.theme === 'night';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = night ? '#0f1b2d' : '#f4ebd6';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7a4b2a';
    ctx.fillRect(basket.x - basket.w / 2, H - 40, basket.w, 22);
    ctx.fillStyle = '#5e6b4a';
    ctx.fillRect(basket.x - basket.w / 2 - 4, H - 44, basket.w + 8, 8);
    eggs.forEach((egg) => {
      ctx.fillStyle = '#fffdf7';
      ctx.strokeStyle = '#7a4b2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(egg.x, egg.y, 11, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function tick() {
    if (!running) return;
    if (Math.random() < 0.055) eggs.push({ x: 20 + Math.random() * (W - 40), y: -15, speed: 2 + Math.random() * 2.2 });
    eggs = eggs.filter((egg) => {
      egg.y += egg.speed;
      const caught = egg.y > H - 52 && egg.y < H - 20 && Math.abs(egg.x - basket.x) < basket.w / 2;
      if (caught) {
        score += 1;
        scoreEl.textContent = `Puntos: ${score}`;
        return false;
      }
      return egg.y < H + 20;
    });
    draw();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    clearInterval(timer);
    startBtn.disabled = false;
    startBtn.textContent = 'Jugar de nuevo';
  }

  function finish() {
    stop();
    const record = Math.max(score, readRecord());
    writeRecord(record);
    resultEl.textContent = `¡Atrapaste ${score} huevos! Tu récord: ${record}.`;
  }

  function start() {
    if (running) return;
    score = 0;
    seconds = GAME_SECONDS;
    eggs = [];
    running = true;
    startBtn.disabled = true;
    resultEl.textContent = '';
    scoreEl.textContent = 'Puntos: 0';
    timeEl.textContent = `${seconds} s`;
    timer = setInterval(() => {
      seconds -= 1;
      timeEl.textContent = `${Math.max(seconds, 0)} s`;
      if (seconds <= 0) finish();
    }, 1000);
    tick();
  }

  function open() {
    modal.hidden = false;
    document.body.classList.add('game-open');
    startBtn.textContent = 'Empezar';
    startBtn.disabled = false;
    resultEl.textContent = '';
    scoreEl.textContent = 'Puntos: 0';
    timeEl.textContent = `${GAME_SECONDS} s`;
    eggs = [];
    basket.x = W / 2;
    draw();
    startBtn.focus();
  }

  function close() {
    stop();
    modal.hidden = true;
    document.body.classList.remove('game-open');
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => {
    clicks += 1;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { clicks = 0; }, 1200);
    if (clicks >= 3) { clicks = 0; open(); }
  });

  document.addEventListener('keydown', (event) => {
    if (modal.hidden) {
      const tag = (event.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || event.target.isContentEditable) return;
      if (event.key.length === 1) {
        typed = (typed + event.key.toLowerCase()).slice(-SECRET_WORD.length);
        if (typed === SECRET_WORD) { typed = ''; open(); }
      }
      return;
    }
    if (event.key === 'Escape') close();
    if (running && event.key === 'ArrowLeft') { basket.x -= 28; clampBasket(); }
    if (running && event.key === 'ArrowRight') { basket.x += 28; clampBasket(); }
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === closeBtn) { event.preventDefault(); startBtn.focus(); }
      else if (!event.shiftKey && document.activeElement === startBtn) { event.preventDefault(); closeBtn.focus(); }
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    basket.x = (event.clientX - rect.left) * (W / rect.width);
    clampBasket();
  });

  startBtn.addEventListener('click', start);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
}

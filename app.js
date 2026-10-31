/* Delitto a Villa Malanotte — schermo del narratore + telefoni dei giocatori.
   Sync in tempo reale via ntfy.sh: il narratore pubblica lo stato su <topic>-s,
   i telefoni pubblicano gli eventi (pronto, indizi, missioni, voti) su <topic>-e. */
(() => {
  'use strict';
  const D = window.DATA;
  const app = document.getElementById('app');
  const HASH = location.hash.slice(1);
  const TEST = /(^|&)test\b/.test(HASH);
  const TOPIC = D.topic + (TEST ? '-test' : '');
  const NTFY = 'https://ntfy.sh/';
  const IDS = Object.keys(D.pub);

  // ---------------------------------------------------------------- utilità
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const nameOf = (id) => (D.pub[id] ? D.pub[id].name : id === 'calogero' ? 'Calogero (il maggiordomo)' : id);
  const imgOf = (id) => (D.pub[id] ? D.pub[id].img : D.npc[id] ? D.npc[id].img : '');
  const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function dec(b64, key) {
    const bin = atob(b64);
    const data = new Uint8Array(bin.length);
    const k = new TextEncoder().encode(key + '·malanotte');
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i) ^ k[i % k.length] ^ ((i * 31) & 255);
    return JSON.parse(new TextDecoder().decode(data));
  }
  async function unlock(map, key) {
    const blob = map[(await sha('vmn:' + key)).slice(0, 16)];
    return blob ? dec(blob, key) : null;
  }

  // ------------------------------------------------------------------- rete
  const send = (sub, obj) =>
    fetch(NTFY + TOPIC + '-' + sub, { method: 'POST', body: JSON.stringify(obj) }).catch(() => {});
  function listen(sub, since, onMsg, onStatus) {
    const es = new EventSource(`${NTFY}${TOPIC}-${sub}/sse?since=${since}`);
    es.onopen = () => onStatus && onStatus(true);
    es.onerror = () => onStatus && onStatus(false);
    es.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.event && m.event !== 'message') return;
        onMsg(JSON.parse(m.message), m);
      } catch {}
    };
    return es;
  }

  // ------------------------------------------------------------- effetti audio
  let AC = null;
  const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
  function noiseBuf(sec) {
    const c = ac(), b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return b;
  }
  function thunder(vol = 1) {
    const c = ac(), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf(6); f.type = 'lowpass'; f.frequency.value = 600;
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.6 * vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.8); g.gain.exponentialRampToValueAtTime(0.001, t + 5.5);
    f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(220, t + 4);
    src.connect(f).connect(g).connect(c.destination); src.start();
  }
  let rain = null;
  function rainOn(level = 0.12) {
    const c = ac();
    if (!rain) {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      const b = c.createBuffer(1, c.sampleRate * 4, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      src.buffer = b; src.loop = true; f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.4; g.gain.value = 0;
      src.connect(f).connect(g).connect(c.destination); src.start(); rain = g;
    }
    rain.gain.setTargetAtTime(level, c.currentTime, 0.8);
  }
  function chime() {
    const c = ac(), t = c.currentTime;
    [659, 784, 988, 1319].forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.18, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 1.6);
      o.connect(g).connect(c.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 1.7);
    });
  }
  function bell() {
    const c = ac(), t = c.currentTime;
    [0, 1.2, 2.4].forEach((d) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = 196;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.4, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + d + 1.15);
      o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + 1.2);
    });
  }
  function speak(text, onend) {
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/…/g, '...'));
      u.lang = 'it-IT'; u.rate = 0.95;
      const v = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('it'));
      if (v) u.voice = v;
      u.onend = onend; speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch { onend && setTimeout(onend, 1500); }
  }
  // Sottotitolo che segue l'audio frase per frase
  const sentences = (t) => t.match(/[^.!?…]+[.!?…]+["»”]?\s*|[^.!?…]+$/g) || [t];
  function karaoke(el, text, audio) {
    const parts = sentences(text);
    const total = parts.reduce((a, p) => a + p.length, 0);
    el.innerHTML = parts.map((p, i) => `<span data-i="${i}">${esc(p)}</span>`).join('');
    const spans = $$('span', el);
    let raf;
    const tick = () => {
      if (!audio.duration || isNaN(audio.duration)) { raf = requestAnimationFrame(tick); return; }
      const pos = (audio.currentTime / audio.duration) * total;
      let acc = 0, cur = 0;
      for (let i = 0; i < parts.length; i++) { acc += parts[i].length; if (pos <= acc) { cur = i; break; } cur = i; }
      spans.forEach((s, i) => s.className = i < cur ? 'past' : i === cur ? 'now' : '');
      const now = spans[cur];
      if (now) el.scrollTo({ top: now.offsetTop - el.clientHeight * 0.3, behavior: 'smooth' });
      if (!audio.paused && !audio.ended) raf = requestAnimationFrame(tick);
    };
    audio.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
    audio.addEventListener('ended', () => spans.forEach((s) => (s.className = 'past')));
  }

  // ----------------------------------------------------------------- router
  if (HASH.startsWith('k=')) player(HASH.slice(2).split('&')[0]);
  else if (HASH.startsWith('narratore-')) host(HASH.slice(10).split('&')[0]);
  else landing();

  function landing(msg) {
    document.body.className = 'phone';
    app.innerHTML = `
      <div class="invite" style="--bg:url('${D.scene.villa}')">
        <div class="inv-bg"></div>
        <div class="inv-stage">
          <div class="seal">🎃</div>
          <h1 class="title">${esc(D.meta.title)}</h1>
          <p class="kick">${esc(D.meta.subtitle)}</p>
          <p class="lead">${esc(msg || 'Questo invito è personale: apri il link che hai ricevuto su WhatsApp.')}</p>
        </div>
      </div>`;
  }

  // =================================================================== PLAYER
  async function player(token) {
    document.body.className = 'phone';
    const me = await unlock(D.p, token);
    if (!me) return landing('Link non valido. Controlla di averlo copiato tutto.');
    const P = D.pub[me.id];
    const F = P.g === 'f';
    const o = (m, f) => (F ? f : m);
    const LS = 'vmn-p-' + me.id + (TEST ? '-t' : '');
    let L = Object.assign({ ready: false, g: null, shown: {}, done: {}, vote: null }, load(LS) || {});
    const save = () => store(LS, L);
    let S = null, online = false, tab = 'atto', hidden = false, invitePlaying = false;
    const events = [];

    send('e', { t: 'hello', k: me.id });
    listen('s', 'latest', (st) => {
      const changed = !S || S.ph !== st.ph;
      S = st;
      if (st.g && L.g !== st.g) { L.g = st.g; L.shown = {}; L.done = {}; L.vote = null; save(); }
      if (changed && st.ph >= 0) { tab = 'atto'; try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch {} }
      if (!invitePlaying) render();
    }, (ok) => { online = ok; const d = $('.dot'); if (d) d.className = 'dot ' + (ok ? 'on' : 'off'); });
    listen('e', 'all', (ev, m) => {
      if (ev.t !== 'reveal' || events.find((x) => x.mid === m.id)) return;
      events.push({ ...ev, mid: m.id, time: m.time });
      if (tab === 'indizi' && !invitePlaying) render();
    });

    function render() {
      if (!L.ready) return invite();
      if (!S || !S.g || S.ph < 0) return lobby();
      game();
    }

    // ---------- invito con voce
    function invite() {
      app.innerHTML = `
        <div class="invite" style="--bg:url('${D.scene.villa}')">
          <div class="inv-bg"></div>
          <div class="inv-stage" id="stage">
            <div class="seal">🎃</div>
            <h1 class="title">${o('Sei stato scelto', 'Sei stata scelta')}</h1>
            <p class="kick">${esc(D.meta.title)} · Halloween</p>
            <button class="btn big pulse" id="open">Apri il tuo invito 🔊</button>
            <p class="hint">Alza il volume, o metti le cuffie</p>
          </div>
        </div>`;
      $('#open').onclick = playInvite;
    }
    function playInvite() {
      invitePlaying = true;
      const stage = $('#stage');
      stage.innerHTML = `
        <div class="inv-cards">
          <img class="inv-card c1" src="${D.npc.saverio.img}" alt="">
          <img class="inv-card c2" src="${P.img}" alt="">
        </div>
        <div class="inv-name hide" id="iname"><small>Tu sarai</small><b>${esc(P.name)}</b><span>${esc(P.title)}</span></div>
        <div class="karaoke" id="sub"></div>
        <div class="inv-actions"><button class="link" id="skip">Salta ⏭</button></div>`;
      const a = new Audio(me.introAudio);
      karaoke($('#sub'), me.intro, a);
      const done = () => {
        invitePlaying = false;
        $('.inv-actions').innerHTML = `<button class="btn big" id="ready">${o('Sono pronto', 'Sono pronta')} ✋</button>`;
        $('#ready').onclick = () => { L.ready = true; save(); send('e', { t: 'ready', k: me.id }); render(); };
      };
      a.addEventListener('timeupdate', () => {
        if (a.duration && a.currentTime / a.duration > 0.55) { $('.c1')?.classList.add('out'); $('.c2')?.classList.add('in'); $('#iname')?.classList.remove('hide'); }
      });
      a.onended = done;
      a.onerror = () => { $('#sub').textContent = me.intro; $('.c2')?.classList.add('in'); $('#iname')?.classList.remove('hide'); done(); };
      a.play().catch(() => a.onerror());
      $('#skip').onclick = () => { a.pause(); a.onerror(); };
    }

    // ---------- attesa
    function header(extra = '') {
      return `<header class="ph-head">
        <img src="${P.img}" alt=""><div><b>${esc(P.name)}</b><small>${esc(P.title)}</small></div>
        <span class="dot ${online ? 'on' : 'off'}" title="connessione"></span>${extra}</header>`;
    }
    function profile(id, big) {
      const p = D.pub[id];
      return `<div class="prof ${big ? 'big' : ''}"><img src="${p.img}" alt="">
        <div><h3>${esc(p.name)} <em>${esc(p.title)}</em></h3><p>${esc(p.blurb)}</p>
        <p class="cost">🎭 ${esc(p.costume)}</p></div></div>`;
    }
    function lobby() {
      app.innerHTML = `${header()}
        <main class="ph-main">
          <div class="wait"><div class="candle"><i></i></div>
            <h2>La cena non è ancora iniziata</h2>
            <p>Quando sarete tutti a tavola, il narratore la farà partire dal computer. Tieni aperta questa pagina: il tuo telefono si aggiornerà da solo.</p>
          </div>
          <h4 class="sec">Il tuo personaggio</h4>
          ${profile(me.id, true)}
          <p class="dress">👗 Dress code facoltativo: ${esc(P.dress)}</p>
          <button class="btn ghost" id="again">Riascolta l'invito 🔊</button>
        </main>`;
      $('#again').onclick = () => { L.ready = false; save(); invite(); };
    }

    // ---------- gioco
    function game() {
      const act = S.act;
      app.innerHTML = `${header('<button class="eye" id="eye">🙈</button>')}
        <div class="actbar"><span>${esc(S.kicker || '')}</span><b>${esc(S.n || '')}</b></div>
        <main class="ph-main" id="main">${tabHtml(act)}</main>
        <nav class="tabs">${[['atto', '🎬', 'Atto'], ['segreti', '🤫', 'Segreti'], ['indizi', '🔎', 'Indizi'], ['chi', '🎭', 'Personaggi']]
          .map(([k, i, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}"><i>${i}</i>${l}</button>`).join('')}</nav>
        <div class="cover ${hidden ? 'show' : ''}" id="cover"><div>🙈<p>Schermo nascosto<br><small>tocca per mostrare</small></p></div></div>`;
      $$('.tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; game(); window.scrollTo(0, 0); }));
      $('#eye').onclick = () => { hidden = true; $('#cover').classList.add('show'); };
      $('#cover').onclick = () => { hidden = false; $('#cover').classList.remove('show'); };
      bind();
    }
    const list = (cls, title, items) => (items && items.length ? `<section class="box ${cls}"><h4>${title}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>` : '');
    function tabHtml(act) {
      if (tab === 'segreti') return secretsHtml();
      if (tab === 'indizi') return cluesHtml();
      if (tab === 'chi') return IDS.map((id) => profile(id)).join('') +
        Object.values(D.npc).map((n) => `<div class="prof"><img src="${n.img}" alt=""><div><h3>${esc(n.name)}</h3><p>${esc(n.blurb)}</p></div></div>`).join('');
      // tab atto
      if (act === 'a0') {
        const A = me.acts.a0;
        return `<section class="box role ${me.role === 'assassina' ? 'killer' : ''}"><h4>${me.role === 'assassina' ? '🔪 Il tuo ruolo' : '🎭 Il tuo ruolo'}</h4><p>${esc(me.roleLine)}</p></section>
          ${list('todo', '🗣️ Presentazione', A.todo)}
          ${list('', '📜 Come giocare', me.play)}
          <button class="btn" data-go="segreti">Leggi i tuoi segreti 🤫</button>`;
      }
      if (act === 'vote') return voteHtml();
      if (act === 'reveal' || act === 'end') return endHtml();
      const A = me.acts[act];
      if (!A) return '';
      return `${A.mood ? `<section class="box mood"><p>${esc(A.mood)}</p></section>` : ''}
        ${list('todo', '✅ Cosa fare', A.todo)}
        ${list('reveal', '⚠️ Devi confessare in questo atto', A.reveal)}
        ${list('hide', '🤐 Nascondi (puoi mentire)', A.hide)}
        <h4 class="sec">Le tue prove</h4>
        ${(A.clues || []).map(clueCard).join('')}
        ${A.mission ? `<section class="box mission ${L.done[A.mission.id] ? 'done' : ''}"><h4>🎯 Missione segreta (+1 punto)</h4><p>${esc(A.mission.text)}</p>
          <button class="btn small ${L.done[A.mission.id] ? 'ok' : 'ghost'}" data-m="${A.mission.id}">${L.done[A.mission.id] ? 'Fatto ✓' : 'Segna come fatta'}</button></section>` : ''}`;
    }
    function clueCard(c) {
      const shown = L.shown[c.id];
      return `<div class="clue ${shown ? 'shown' : ''}"><p>${esc(c.text)}</p>
        ${c.src ? `<button class="btn small ghost" data-play="${c.src}">▶ Ascolta tu (piano)</button>` : ''}
        <button class="btn small ${shown ? 'ok' : ''}" data-c="${c.id}">${shown ? '✓ Mostrato a tutti' : '📢 Mostra a tutti'}</button></div>`;
    }
    function secretsHtml() {
      return `<section class="box role ${me.role === 'assassina' ? 'killer' : ''}"><h4>${me.role === 'assassina' ? '🔪 SEI L\'ASSASSINA' : '🎭 Il tuo ruolo'}</h4><p>${esc(me.roleLine)}</p></section>
        ${me.alibi ? `<section class="box hide"><h4>🧥 Il tuo alibi</h4><p>${esc(me.alibi)}</p></section>` : ''}
        ${me.secrets.map((s) => `<section class="box secret"><h4>${esc(s.t)}</h4><p>${esc(s.d)}</p></section>`).join('')}
        ${list('', '📜 Come giocare', me.play)}`;
    }
    function cluesHtml() {
      const mine = events.filter((e) => S && e.g === S.g).sort((a, b) => b.time - a.time);
      return `${S.board && S.board.length ? list('board', '🔎 Sulla scena', S.board) : ''}
        <h4 class="sec">Indizi mostrati a tutti</h4>
        ${mine.length ? mine.map((e) => `<div class="feed"><img src="${imgOf(e.k)}" alt=""><div><b>${esc(nameOf(e.k))}</b><p>${esc(e.text)}</p></div></div>`).join('') : '<p class="muted">Ancora nessuno. Usa "📢 Mostra a tutti" sulle tue prove.</p>'}
        ${list('', '🕰️ La serata', D.facts)}`;
    }
    function voteHtml() {
      const v = L.vote || {};
      const opt = (q, ids) => `<div class="q" data-q="${q.id}"><h4>${esc(q.q)}</h4><div class="chips">${ids
        .map((id) => `<button data-v="${id}" class="${v[q.id] === id ? 'on' : ''}"><img src="${imgOf(id)}" alt="">${esc(D.pub[id] ? D.pub[id].name : 'Calogero')}</button>`).join('')}</div></div>`;
      return `<section class="box vote"><h4>🗳️ L'accusa</h4><p>Vota in segreto. Puoi cambiare idea finché non si rivela la verità.</p></section>
        ${D.vote.questions.map((q) => opt(q, q.players ? IDS.filter((id) => id !== me.id) : D.vote.suspects)).join('')}
        <button class="btn big" id="sendvote">${L.vote ? 'Aggiorna il voto' : 'Invia il voto'} 🗳️</button>
        ${L.vote ? '<p class="okmsg">✓ Voto inviato</p>' : ''}`;
    }
    function endHtml() {
      const r = S.res;
      if (!r) return `<div class="wait"><div class="candle"><i></i></div><h2>Guardate lo schermo grande 👀</h2><p>La verità sta per essere svelata.</p></div>`;
      const rank = Object.entries(r.score).sort((a, b) => b[1] - a[1]);
      const pos = rank.findIndex(([id]) => id === me.id) + 1;
      return `<div class="wait"><h2>${pos === 1 ? '🏆 Hai vinto!' : `Sei ${pos}° in classifica`}</h2><p>Hai fatto <b>${r.score[me.id] || 0}</b> punti.</p></div>
        <section class="box"><h4>Classifica</h4><ol class="rank">${rank.map(([id, s]) => `<li class="${id === me.id ? 'me' : ''}"><img src="${imgOf(id)}" alt="">${esc(nameOf(id))}<b>${s}</b></li>`).join('')}</ol></section>`;
    }
    function bind() {
      $$('[data-go]').forEach((b) => (b.onclick = () => { tab = b.dataset.go; game(); }));
      $$('[data-c]').forEach((b) => (b.onclick = () => {
        const A = me.acts[S.act]; const c = A.clues.find((x) => x.id === b.dataset.c);
        if (L.shown[c.id] && !confirm('Lo hai già mostrato. Rimandarlo sullo schermo?')) return;
        if (!L.shown[c.id] && !confirm('Mostrare questa prova a tutti sullo schermo grande?')) return;
        send('e', { t: 'reveal', g: S.g, k: me.id, id: c.id, text: c.text, src: c.src || null });
        L.shown[c.id] = 1; save(); game();
      }));
      $$('[data-play]').forEach((b) => (b.onclick = () => { const a = new Audio(b.dataset.play); a.volume = 0.5; a.play(); }));
      $$('[data-m]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.m; L.done[id] = !L.done[id]; save();
        send('e', { t: 'mission', g: S.g, k: me.id, id, done: !!L.done[id] }); game();
      }));
      $$('.q').forEach((q) => $$('button', q).forEach((b) => (b.onclick = () => {
        $$('button', q).forEach((x) => x.classList.remove('on')); b.classList.add('on');
      })));
      const sv = $('#sendvote');
      if (sv) sv.onclick = () => {
        const v = {};
        $$('.q').forEach((q) => { const on = $('button.on', q); if (on) v[q.dataset.q] = on.dataset.v; });
        if (!v.killer) return alert('Scegli almeno chi ha ucciso Don Saverio.');
        L.vote = v; save(); send('e', { t: 'vote', g: S.g, k: me.id, v }); game();
      };
    }

    render();
  }

  // ==================================================================== HOST
  async function host(code) {
    document.body.className = 'host';
    const H = await unlock(D.h, code);
    if (!H) return landing('Link del narratore non valido.');
    const PH = H.phases;
    const LS = 'vmn-host' + (TEST ? '-t' : '');
    const fresh = () => ({ g: Math.random().toString(36).slice(2, 8), ph: -1, shown: [], votes: {}, missions: {}, res: null });
    let G = Object.assign(fresh(), load(LS) || {});
    const lobbyInfo = load(LS + '-lobby') || { ready: {}, seen: {} };
    const save = () => { store(LS, G); store(LS + '-lobby', lobbyInfo); };
    const T0 = Date.now() / 1000;
    let started = false, audio = null, lineIdx = 0, playToken = 0, ambient = true;
    let timer = { left: 0, run: false, total: 0 }, popQ = [], popOn = false;

    // --- rete
    const publish = () => {
      const p = PH[G.ph];
      send('s', { g: G.g, ph: G.ph, act: p ? p.act : null, n: p ? p.title : '', kicker: p ? p.kicker : '', board: p && p.board ? p.board : null, res: G.res ? { score: G.res.score } : null, ts: Date.now() });
    };
    listen('e', 'all', (ev, m) => {
      const k = ev.k; if (!D.pub[k]) return;
      if (ev.t === 'hello') lobbyInfo.seen[k] = m.time;
      if (ev.t === 'ready') { lobbyInfo.ready[k] = m.time; lobbyInfo.seen[k] = m.time; }
      if (ev.g !== G.g) { save(); refreshPlayers(); return; }
      if (ev.t === 'reveal') {
        const dup = G.shown.find((s) => s.mid === m.id);
        if (!dup) { G.shown.push({ k, id: ev.id, text: ev.text, src: ev.src, mid: m.id, time: m.time }); if (m.time > T0 - 3) pop(ev); }
      }
      if (ev.t === 'mission') { (G.missions[k] ||= {})[ev.id] = ev.done; }
      if (ev.t === 'vote') G.votes[k] = ev.v;
      save(); refreshSide(); refreshPlayers();
    });

    // --- layout
    app.innerHTML = `
      <div class="stage" id="stage"><div class="bg" id="bg"></div><div class="shade"></div>
        <div class="flash" id="flash"></div>
        <div class="top"><span class="kicker" id="kicker"></span><h1 id="title"></h1></div>
        <div class="center" id="center"></div>
        <aside class="side" id="side"></aside>
        <div class="subs" id="subs"></div>
        <div class="cue" id="cue"></div>
      </div>
      <div class="dark" id="dark"><p id="darktext"></p></div>
      <div class="popup" id="popup"></div>
      <div class="bar" id="bar">
        <button id="prev" title="Indietro (←)">◀</button>
        <div class="dots" id="dots"></div>
        <button id="next" class="nx" title="Avanti (→)">Avanti ▶</button>
        <span class="sep"></span>
        <button id="pause" title="Pausa voce (spazio)">⏯</button>
        <button id="replay" title="Ripeti la voce (R)">🔁</button>
        <span class="timer" id="timer" title="Timer (T)"></span>
        <button id="plus5" title="+5 minuti">+5′</button>
        <button id="amb" title="Pioggia e tuoni">🌧️</button>
        <button id="fs" title="Schermo intero (F)">⛶</button>
        <button id="reset" title="Nuova partita">↺</button>
      </div>`;
    $('#prev').onclick = () => go(G.ph - 1);
    $('#next').onclick = () => go(G.ph + 1);
    $('#pause').onclick = togglePause;
    $('#replay').onclick = () => playLines(G.ph, 0);
    $('#plus5').onclick = () => { timer.left += 300; timer.total += 300; timer.run = true; };
    $('#timer').onclick = () => { timer.run = !timer.run; };
    $('#amb').onclick = () => { ambient = !ambient; rainOn(ambient ? 0.1 : 0); $('#amb').classList.toggle('off', !ambient); };
    $('#fs').onclick = fullscreen;
    $('#reset').onclick = () => {
      if (!confirm('Ricominciare da zero? Voti, indizi e missioni verranno azzerati.')) return;
      stopAudio(); G = fresh(); save(); publish(); renderPhase();
    };
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(G.ph + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(G.ph - 1);
      else if (e.key === ' ') { e.preventDefault(); togglePause(); }
      else if (e.key === 'r' || e.key === 'R') playLines(G.ph, 0);
      else if (e.key === 'f' || e.key === 'F') fullscreen();
      else if (e.key === 't' || e.key === 'T') timer.run = !timer.run;
      else if (e.key === 'Escape') closePop();
    });
    let idle; document.addEventListener('mousemove', () => { $('#bar').classList.remove('hid'); clearTimeout(idle); idle = setTimeout(() => $('#bar').classList.add('hid'), 3500); });

    function fullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
    function setBg(src) { const bg = $('#bg'); if (!src || bg.dataset.src === src) return; bg.dataset.src = src; bg.classList.remove('kb'); void bg.offsetWidth; bg.style.backgroundImage = `url('${src}')`; bg.classList.add('kb'); }

    // --- fasi
    function go(i) {
      if (i < -1 || i >= PH.length) return;
      ac();
      if (!started) { started = true; rainOn(0.1); }
      G.ph = i;
      if (PH[i] && PH[i].results) G.res = computeResults();
      save(); publish(); renderPhase(); playLines(i, 0);
      const p = PH[i];
      timer = { left: p && p.timer ? p.timer * 60 : 0, total: p && p.timer ? p.timer * 60 : 0, run: false };
    }
    function renderPhase() {
      const p = PH[G.ph];
      $('#dots').innerHTML = PH.map((x, i) => `<i class="${i < G.ph ? 'past' : i === G.ph ? 'now' : ''}" title="${esc(x.title)}"></i>`).join('');
      $('#cue').className = 'cue'; $('#subs').innerHTML = ''; $('#subs').className = 'subs';
      $('#stage').className = 'stage';
      if (!p) return lobby();
      setBg(p.img);
      $('#kicker').textContent = p.kicker; $('#title').textContent = p.title;
      $('#next').textContent = G.ph === PH.length - 1 ? 'Fine' : PH[G.ph + 1].vote ? 'Al voto ▶' : PH[G.ph + 1].reveal ? 'Rivela la verità ▶' : 'Avanti ▶';
      const C = $('#center');
      C.innerHTML = ''; C.className = 'center';
      if (p.gallery) { C.className = 'center gallery'; C.innerHTML = IDS.map(card).join('') + ['saverio', 'calogero'].map((n) => `<div class="pc npc"><img src="${D.npc[n].img}" alt=""><b>${esc(D.npc[n].name)}</b></div>`).join(''); }
      if (p.intro) { C.className = 'center gallery'; C.innerHTML = IDS.map(card).join(''); $$('.pc', C).forEach((el) => (el.onclick = () => spotlight(el.dataset.id))); }
      if (p.vote) { C.className = 'center votes'; refreshVotes(); }
      if (p.results) { C.className = 'center results'; C.innerHTML = resultsHtml(); }
      refreshSide();
    }
    const card = (id) => `<div class="pc" data-id="${id}"><img src="${D.pub[id].img}" alt=""><b>${esc(D.pub[id].name)}</b><small>${esc(D.pub[id].title)}</small></div>`;
    function spotlight(id) {
      const p = D.pub[id];
      popRaw(`<div class="spot"><img src="${p.img}" alt=""><div><span class="kicker">${esc(p.title)}</span><h2>${esc(p.name)}</h2><p>${esc(p.blurb)}</p><p class="cost">🎭 ${esc(p.costume)}</p></div></div>`);
    }
    function lobby() {
      setBg(D.scene.villa);
      $('#kicker').textContent = D.meta.subtitle; $('#title').textContent = D.meta.title;
      $('#side').className = 'side'; $('#side').innerHTML = '';
      const C = $('#center'); C.className = 'center lobby';
      C.innerHTML = `<div class="players" id="players"></div>
        <button class="btn big pulse" id="start">🕯️ Inizia la serata</button>
        <p class="muted">${TEST ? '🧪 MODALITÀ PROVA · ' : ''}Tasti: → avanti · ← indietro · spazio pausa · F schermo intero</p>`;
      $('#start').onclick = () => go(0);
      $('#next').textContent = 'Inizia ▶';
      refreshPlayers();
    }
    function refreshPlayers() {
      const el = $('#players'); if (!el) return;
      el.innerHTML = IDS.map((id) => {
        const r = lobbyInfo.ready[id], s = lobbyInfo.seen[id];
        return `<div class="pc ${r ? 'ok' : s ? 'seen' : ''}"><img src="${D.pub[id].img}" alt=""><b>${esc(D.pub[id].name)}</b><small>${r ? '✓ pronto' : s ? '👀 ha aperto il link' : '… in attesa'}</small></div>`;
      }).join('');
    }
    function refreshVotes() {
      const C = $('#center'); if (!C || !PH[G.ph] || !PH[G.ph].vote) return;
      const n = Object.keys(G.votes).length;
      C.innerHTML = `<div class="players">${IDS.map((id) => `<div class="pc ${G.votes[id] ? 'ok' : ''}"><img src="${D.pub[id].img}" alt=""><b>${esc(D.pub[id].name)}</b><small>${G.votes[id] ? '✓ ha votato' : '… sta votando'}</small></div>`).join('')}</div>
        <p class="big-n">${n} / ${IDS.length} voti</p>`;
    }
    function refreshSide() {
      const p = PH[G.ph], side = $('#side');
      if (!side) return;
      if (p && p.vote) refreshVotes();
      if (!p || !p.facts) { side.className = 'side'; side.innerHTML = ''; return; }
      const shown = G.shown.slice().sort((a, b) => b.time - a.time);
      side.className = 'side on';
      side.innerHTML = `<h3>🔎 Sulla scena</h3><ul>${p.board.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <h3>📢 Indizi mostrati <em>${shown.length}</em></h3>
        <div class="feedlist">${shown.map((s) => `<div class="feed" data-mid="${s.mid}"><img src="${imgOf(s.k)}" alt=""><div><b>${esc(nameOf(s.k))}</b><p>${esc(s.text)}</p></div></div>`).join('') || '<p class="muted">Dai telefoni: "📢 Mostra a tutti"</p>'}</div>`;
      $$('.feed', side).forEach((f) => (f.onclick = () => { const s = G.shown.find((x) => x.mid === f.dataset.mid); if (s) pop(s); }));
    }

    // --- voce narrante
    function stopAudio() { playToken++; if (audio) { audio.pause(); audio.onended = null; } try { speechSynthesis.cancel(); } catch {} }
    function togglePause() { if (!audio) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }
    function playLines(ph, from) {
      stopAudio();
      const tok = playToken, p = PH[ph];
      if (!p) return;
      lineIdx = from;
      const next = () => {
        if (tok !== playToken) return;
        const l = p.lines[lineIdx];
        if (!l) return linesDone(p);
        before(p, l, () => {
          if (tok !== playToken) return;
          if (l.img) setBg(l.img);
          const subs = $('#subs');
          subs.className = 'subs on v-' + l.v;
          subs.innerHTML = `<span class="who">${l.v === 's' ? 'Don Saverio' : l.v === 'c' ? 'Calogero' : ''}</span><div class="karaoke" id="kar"></div>`;
          const target = p.blackout && lineIdx === 1 ? $('#darktext') : $('#kar');
          audio = new Audio(l.src);
          karaoke(target, l.t, audio);
          const after = () => { if (tok !== playToken) return; lineIdx++; setTimeout(next, gap(p, l)); };
          audio.onended = after;
          audio.onerror = () => speak(l.t, after);
          audio.play().catch(() => speak(l.t, after));
        });
      };
      next();
    }
    const gap = (p, l) => (p.blackout && l.a === 'p4b' ? 7000 : p.blackout && l.a === 'p4a' ? 500 : 900);
    function before(p, l, go) {
      if (p.cue && lineIdx === 0) { $('#cue').textContent = p.cue; $('#cue').className = 'cue on'; }
      if (!p.blackout) return go();
      if (l.a === 'p4b') { $('#dark').classList.add('on'); $('#darktext').textContent = ''; thunder(1); if (ambient) rainOn(0.25); return setTimeout(go, 2600); }
      if (l.a === 'p4c') { $('#dark').classList.remove('on'); rainOn(ambient ? 0.1 : 0); $('#cue').textContent = '💡 Riaccendete le luci'; return go(); }
      if (l.a === 'p4d') { setBg(PH.find((x) => x.id === 'p5').img); flash(); thunder(0.6); return setTimeout(go, 400); }
      go();
    }
    function linesDone(p) {
      if (p.timer) timer.run = true;
      if (p.reveal) setTimeout(() => go(G.ph + 1), 2500);
    }
    function flash() { const f = $('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

    // --- timer
    setInterval(() => {
      const el = $('#timer'); if (!el) return;
      if (!timer.total) { el.textContent = ''; el.className = 'timer'; return; }
      if (timer.run && timer.left > 0) { timer.left -= 1; if (timer.left === 0) { bell(); timer.run = false; } }
      el.textContent = (timer.run ? '⏱ ' : '⏸ ') + fmt(timer.left);
      el.className = 'timer' + (timer.left === 0 ? ' end' : timer.left < 120 ? ' low' : '');
    }, 1000);
    // tuoni lontani ogni tanto
    setInterval(() => { if (started && ambient && G.ph >= 0 && Math.random() < 0.35) thunder(0.25); }, 45000);

    // --- popup indizi
    function pop(ev) { popQ.push(ev); if (!popOn) nextPop(); }
    function nextPop() {
      const ev = popQ.shift(); if (!ev) { popOn = false; return; }
      popOn = true; chime();
      if (audio && !audio.paused) audio.volume = 0.25;
      const box = $('#popup');
      box.innerHTML = `<div class="pcard"><img src="${imgOf(ev.k)}" alt=""><div><span class="kicker">${esc(nameOf(ev.k))} mostra una prova</span><p>${esc(ev.text)}</p>${ev.src ? '<span class="rec">🎧 In riproduzione…</span>' : ''}</div></div>`;
      box.classList.add('on');
      let t = setTimeout(closePop, 14000);
      if (ev.src) {
        clearTimeout(t);
        const a = new Audio(ev.src);
        a.onended = () => { t = setTimeout(closePop, 2500); };
        setTimeout(() => a.play().catch(() => {}), 900);
        box.dataset.audio = '1'; box._a = a;
      }
      box.onclick = closePop;
    }
    function popRaw(html) { const box = $('#popup'); box.innerHTML = html; box.classList.add('on'); box.onclick = closePop; popOn = true; }
    function closePop() {
      const box = $('#popup'); if (!box.classList.contains('on')) return;
      if (box._a) { box._a.pause(); box._a = null; }
      box.classList.remove('on'); if (audio) audio.volume = 1;
      setTimeout(nextPop, 400);
    }

    // --- risultati
    function computeResults() {
      const sol = H.solution, score = {}, killerVotes = {}, actor = {};
      IDS.forEach((id) => (score[id] = 0));
      for (const [k, v] of Object.entries(G.votes)) {
        killerVotes[v.killer] = (killerVotes[v.killer] || 0) + 1;
        if (k !== sol.killer) {
          if (v.killer === sol.killer) score[k] += 3;
          if (v.drug === sol.drug) score[k] += 1;
          if (v.thief === sol.thief) score[k] += 1;
        }
        if (v.actor && score[v.actor] !== undefined) { score[v.actor] += 1; actor[v.actor] = (actor[v.actor] || 0) + 1; }
      }
      score[sol.killer] += 2 * Object.entries(G.votes).filter(([k, v]) => k !== sol.killer && v.killer !== sol.killer).length;
      for (const [k, m] of Object.entries(G.missions)) if (score[k] !== undefined) score[k] += Object.values(m).filter(Boolean).length;
      const guessed = IDS.filter((id) => id !== sol.killer && G.votes[id] && G.votes[id].killer === sol.killer);
      return { score, killerVotes, actor, guessed };
    }
    function resultsHtml() {
      const r = G.res || computeResults(), sol = H.solution;
      const rank = Object.entries(r.score).sort((a, b) => b[1] - a[1]);
      const best = Object.entries(r.actor).sort((a, b) => b[1] - a[1])[0];
      const maxv = Math.max(1, ...Object.values(r.killerVotes));
      return `<div class="res">
        <div class="col"><h3>🔪 Chi avete accusato</h3>${Object.entries(r.killerVotes).sort((a, b) => b[1] - a[1]).map(([id, n]) =>
          `<div class="barrow ${id === sol.killer ? 'hit' : ''}"><img src="${imgOf(id)}" alt=""><span>${esc(nameOf(id))}</span><i style="width:${(n / maxv) * 100}%"></i><b>${n}</b></div>`).join('') || '<p class="muted">Nessun voto</p>'}
          <p class="guess">${r.guessed.length ? `Hanno indovinato: <b>${r.guessed.map(nameOf).join(', ')}</b>` : 'Nessuno ha indovinato. Delitto perfetto. 🩸'}</p>
          ${best ? `<p class="guess">🎭 Miglior attore: <b>${esc(nameOf(best[0]))}</b> (${best[1]} voti)</p>` : ''}</div>
        <div class="col"><h3>🏆 Classifica</h3><ol class="rank">${rank.map(([id, s], i) => `<li><span>${i + 1}</span><img src="${imgOf(id)}" alt="">${esc(nameOf(id))}<b>${s}</b></li>`).join('')}</ol>
          <p class="muted">Assassino indovinato +3 · tisana +1 · testamento +1 · missioni +1 · voti da attore +1 · l'assassina +2 per ogni accusa sbagliata</p></div></div>`;
    }

    renderPhase();
    if (G.ph >= 0) publish();
    $('#bar').classList.remove('hid');
    // al primo clic serve un gesto per sbloccare l'audio del browser
    if (G.ph >= 0) {
      const resume = () => { document.removeEventListener('click', resume); ac(); started = true; rainOn(0.1); };
      document.addEventListener('click', resume);
      $('#cue').textContent = '▶ Partita ripresa: premi → per continuare, R per riascoltare';
      $('#cue').className = 'cue on';
    }
  }
})();

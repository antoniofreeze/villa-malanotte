/* Cena con delitto — schermo del narratore + telefoni dei giocatori.
   Giri di parola: il narratore chiama una persona alla volta (round nelle fasi).
   Sync in tempo reale via ntfy.sh: il narratore pubblica lo stato su <topic>-s,
   i telefoni pubblicano gli eventi (pronto, indizi, missioni, voti) su <topic>-e. */
(() => {
  'use strict';
  const D = window.DATA;
  const app = document.getElementById('app');
  const HASH = location.hash.slice(1);
  const TEST = /(^|&)test\b/.test(HASH);
  const TOPIC = D.topic + (TEST ? '-test' : '');
  const IDS = Object.keys(D.pub);

  // ---------------------------------------------------------------- utilità
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const nameOf = (id) => (D.pub[id] ? D.pub[id].name : D.npc[id] ? D.npc[id].name : id);
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
  // Broker MQTT pubblico via WebSocket (ntfy.sh ci ha bloccati la notte di Halloween).
  // Lo stato (s) è "retained": chi si collega o ricarica riceve subito l'ultimo.
  const BROKER = 'wss://broker.emqx.io:8084/mqtt';
  const subs = {}, statusFns = [];
  let cli = null;
  const rid = () => Math.random().toString(36).slice(2, 12);
  function net() {
    if (cli) return cli;
    cli = mqtt.connect(BROKER, { clientId: 'ufv' + rid(), clean: true, reconnectPeriod: 2000, connectTimeout: 10000, keepalive: 30 });
    cli.on('connect', () => { Object.keys(subs).forEach((t) => cli.subscribe(t, { qos: 1 })); statusFns.forEach((f) => f(true)); });
    cli.on('close', () => statusFns.forEach((f) => f(false)));
    cli.on('message', (t, buf) => {
      let o; try { o = JSON.parse(buf.toString()); } catch { return; }
      (subs[t] || []).forEach((f) => { try { f(o, { id: o._id, time: o._t }); } catch (e) { console.error(e); } });
    });
    return cli;
  }
  const send = (sub, obj) =>
    net().publish(TOPIC + '/' + sub, JSON.stringify({ ...obj, _id: rid(), _t: Date.now() / 1000 }), { qos: 1, retain: sub === 's' });
  function listen(sub, since, onMsg, onStatus) {
    const t = TOPIC + '/' + sub, c = net();
    (subs[t] ||= []).push(onMsg);
    if (onStatus) statusFns.push(onStatus);
    if (c.connected) c.subscribe(t, { qos: 1 });
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
  function bang() {
      const c = ac(), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      const b = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.08));
      src.buffer = b; f.type = 'lowpass'; f.frequency.value = 2400; g.gain.value = 2.2;
      src.connect(f).connect(g).connect(c.destination); src.start();
    }
    function fireworks() {
      const c = ac();
      for (let k = 0; k < 9; k++) {
        const t = c.currentTime + 0.3 + k * 0.55 + Math.random() * 0.4;
        const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * (0.25 + Math.random() * 0.3)));
        src.buffer = b; f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 900; g.gain.value = 0.5 + Math.random() * 0.5;
        src.connect(f).connect(g).connect(c.destination); src.start(t);
      }
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
          <div class="seal">${D.meta.icon}</div>
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
    const KILLER = me.role === 'colpevole';
    const F = P.g === 'f';
    const o = (m, f) => (F ? f : m);
    const LS = 'ufv-p-' + me.id + (TEST ? '-t' : '');
    let L = Object.assign({ ready: false, g: null, shown: {}, done: {}, vote: null }, load(LS) || {});
    const save = () => store(LS, L);
    let S = null, online = false, tab = 'atto', hidden = false, invitePlaying = false;
    const events = [];

    send('e', { t: 'hello', k: me.id });
    listen('s', 'latest', (st) => {
      const changed = !S || S.ph !== st.ph;
      const myTurn = st.turn === me.id && (!S || S.turn !== me.id);
      S = st;
      if (st.g && L.g !== st.g) { L.g = st.g; L.shown = {}; L.done = {}; L.vote = null; save(); }
      if (changed) { vstep = L.vote ? -1 : 0; sheetId = null; }
      if ((changed && st.ph >= 0) || myTurn) { tab = 'atto'; try { navigator.vibrate && navigator.vibrate(myTurn ? [300, 100, 300, 100, 300] : [120, 60, 120]); } catch {} }
      if (myTurn) { mini = null; try { if (AC) chime(); } catch {} }
      if (!invitePlaying) render();
    }, (ok) => { online = ok; const d = $('.dot'); if (d) d.className = 'dot ' + (ok ? 'on' : 'off'); });
    listen('e', 'all', (ev, m) => {
      if (ev.t !== 'reveal' || events.find((x) => x.mid === m.id)) return;
      events.push({ ...ev, mid: m.id, time: m.time });
      if (!invitePlaying && L.ready && S && S.ph >= 0 && !$('.sheet')) render();
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
            <div class="seal">${D.meta.icon}</div>
            <h1 class="title">${o('Sei stato scelto', 'Sei stata scelta')}</h1>
            <p class="kick">${esc(D.meta.title)} · ${esc(D.meta.kicker)}</p>
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
          <img class="inv-card c1" src="${D.npc[D.meta.host].img}" alt="">
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
    const TABS = [['atto', '🎬', 'Atto'], ['segreti', '🤫', 'Segreti'], ['indizi', '🔎', 'Indizi'], ['chi', '🎭', 'Persone']];
    const feed = () => (S && S.sh ? S.sh.slice() : events.filter((e) => S && e.g === S.g)).sort((a, b) => b.time - a.time);
    const turnKey = () => `${S.ph}-${S.ti}`;
    let mini = null; // giro "ridotto" dall'utente (chiave del turno)
    let sheetId = null;
    let seenMark = L.seen || 0, lastTab = null;
    function game() {
      if (tab === 'indizi') { L.seen = feed().length; save(); }
      const unseen = Math.max(0, feed().length - (L.seen || 0));
      // ridisegno senza perdere la posizione e le sezioni aperte
      const same = lastTab === tab, y = window.scrollY, open = same ? $$('details.fold').map((d) => d.open) : [];
      lastTab = tab;
      app.innerHTML = `${header('<button class="eye" id="eye" aria-label="Nascondi lo schermo">🙈</button>')}
        ${nowBar()}
        <main class="ph-main" id="main">${tabHtml(S.act)}</main>
        <nav class="tabs">${TABS.map(([k, i, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}"><i>${i}${k === 'indizi' && unseen ? `<em class="badge">${unseen}</em>` : ''}</i><span>${l}</span></button>`).join('')}</nav>
        ${takeover()}
        ${sheetId ? sheet(sheetId) : ''}
        <div class="cover ${hidden ? 'show' : ''}" id="cover"><div>🙈<p>Schermo nascosto<br><small>tocca per mostrare</small></p></div></div>`;
      $$('details.fold').forEach((d, i) => { if (open[i]) d.open = true; });
      if (same) window.scrollTo(0, y);
      $$('.tabs button').forEach((b) => (b.onclick = () => { if (b.dataset.t === 'indizi') seenMark = L.seen || 0; tab = b.dataset.t; sheetId = null; game(); window.scrollTo(0, 0); }));
      $('#eye').onclick = () => { hidden = true; $('#cover').classList.add('show'); };
      $('#cover').onclick = () => { hidden = false; $('#cover').classList.remove('show'); };
      bind();
    }
    // barra "cosa succede adesso", sempre in alto
    function nowBar() {
      let chip = '';
      const live = S.rq && S.ord;
      if (live && S.turn === me.id) chip = `<button class="chip gold" id="reopen">🎤 Tocca a te</button>`;
      else if (live && S.turn) {
        const mine = S.ord.indexOf(me.id), gap = mine - S.ti;
        chip = `<span class="chip"><img src="${imgOf(S.turn)}" alt="">Parla ${esc(nameOf(S.turn))}</span><span class="chip soft">${gap > 0 ? (gap === 1 ? 'Dopo tocca a te' : `Tu tra ${gap}`) : '✓ Hai parlato'}</span>`;
      } else if (live) chip = `<span class="chip">🎤 Giro di parola in arrivo</span>`;
      else if (/^a[1-9]/.test(S.act)) chip = `<span class="chip green">🗣️ Discussione libera</span>`;
      else if (S.act === 'vote') chip = `<span class="chip gold">🗳️ Vota adesso</span>`;
      else if (S.act === 'recap') chip = `<span class="chip">👀 Riepilogo sullo schermo</span>`;
      return `<div class="nowbar"><div class="nb-t"><span>${esc(S.kicker || '')}</span><b>${esc(S.n || '')}</b></div>${chip ? `<div class="nb-c">${chip}</div>` : ''}</div>`;
    }
    // il tuo turno: schermo intero con cosa dire
    function takeover() {
      if (!S.rq || S.turn !== me.id || mini === turnKey()) return '';
      const A = me.acts[S.act] || {};
      return `<div class="take" id="take"><div class="take-in">
        <span class="take-k">🎤 Tocca a te</span>
        <h2>${esc(S.rq)}</h2>
        ${A.say && A.say.length ? `<ul class="say-big">${A.say.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${A.reveal && A.reveal.length ? `<div class="take-rev"><b>⚠️ Devi confessare</b>${A.reveal.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
        <button class="btn big" id="donebtn">Ho finito ✓</button>
        <button class="link" id="mini">Riduci (torno all'atto)</button>
      </div></div>`;
    }
    const list = (cls, title, items, ordered) => (items && items.length ? `<section class="card ${cls}"><h4>${title}</h4><${ordered ? 'ol' : 'ul'}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}></section>` : '');
    const fold = (title, inner, open) => `<details class="fold" ${open ? 'open' : ''}><summary>${title}</summary><div class="fold-in">${inner}</div></details>`;
    function roleCard() {
      return `<section class="card role ${KILLER ? 'killer' : ''}"><h4>${KILLER ? '🔪 Hai ucciso tu' : '🎭 Il tuo ruolo'}</h4><p>${esc(me.roleLine)}</p></section>`;
    }
    function tabHtml(act) {
      if (tab === 'segreti') return secretsHtml();
      if (tab === 'indizi') return cluesHtml();
      if (tab === 'chi') return peopleHtml();
      if (act === 'a0') {
        const A = me.acts.a0;
        return `${roleCard()}
          ${list('say', '🎤 Quando ti danno la parola', A.say)}
          ${fold('📜 Come si gioca', `<ul>${me.play.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)}
          <button class="btn wide" data-go="segreti">Leggi i tuoi segreti 🤫</button>`;
      }
      if (act === 'vote') return voteHtml();
      if (act === 'recap') return `<div class="wait"><h2>Guardate lo schermo 👀</h2><p>Il narratore rimette in fila i fatti. Poi si vota.</p></div>${S.board ? list('board', '🕰️ Il riepilogo', S.board) : ''}`;
      if (act === 'reveal' || act === 'end') return endHtml();
      const A = me.acts[act];
      if (!A) return '';
      const clues = A.clues || [];
      return `${list('say', '🎤 Quando ti danno la parola', A.say)}
        ${list('reveal', '⚠️ Devi confessare in questo atto', A.reveal)}
        ${list('todo', '✅ Da fare', A.todo)}
        ${list('hide', '🤐 Puoi nasconderlo (anche mentendo)', A.hide)}
        ${clues.length ? `<h4 class="sec">🔎 Le tue prove <small>${clues.filter((c) => L.shown[c.id]).length}/${clues.length} mostrate</small></h4>${clues.map(clueCard).join('')}` : ''}
        ${A.mission ? `<button class="card mission ${L.done[A.mission.id] ? 'done' : ''}" data-m="${A.mission.id}">
          <span class="tick">${L.done[A.mission.id] ? '✓' : ''}</span><span><b>🎯 Missione segreta · +1 punto</b>${esc(A.mission.text)}<small>${L.done[A.mission.id] ? 'Fatta! Tocca per annullare' : 'Tocca quando l\'hai fatta'}</small></span></button>` : ''}`;
    }
    function clueCard(c) {
      const shown = L.shown[c.id];
      return `<div class="clue ${shown ? 'shown' : ''}"><p>${esc(c.text)}</p>
        ${c.src ? `<button class="btn small ghost" data-play="${c.src}">▶ Ascolta tu (piano)</button>` : ''}
        <button class="btn wide ${shown ? 'ok' : ''}" data-c="${c.id}">${shown ? '✓ Già sullo schermo · rimanda' : '📢 Mostra a tutti'}</button></div>`;
    }
    function secretsHtml() {
      return `${roleCard()}
        ${me.alibi ? `<section class="card hide"><h4>🧥 Il tuo alibi</h4><p>${esc(me.alibi)}</p></section>` : ''}
        <h4 class="sec">🤫 I tuoi segreti <small>tocca per aprire</small></h4>
        ${me.secrets.map((s, i) => fold(`<span class="n">${i + 1}</span>${esc(s.t)}`, `<p>${esc(s.d)}</p>`)).join('')}
        ${fold('📜 Come si gioca', `<ul>${me.play.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)}`;
    }
    function cluesHtml() {
      const all = feed(), fresh = all.length - seenMark;
      return `${S.board && S.board.length ? list('board', '🔎 Sulla scena', S.board) : ''}
        <h4 class="sec">📢 Prove mostrate a tutti <small>${all.length}</small></h4>
        ${all.length ? all.map((e, i) => `<div class="bubble ${e.k === me.id ? 'mine' : ''}"><img src="${imgOf(e.k)}" alt=""><div><b>${esc(nameOf(e.k))}${i < fresh ? ' <em>nuova</em>' : ''}</b><p>${esc(e.text)}</p></div></div>`).join('') : '<p class="muted">Ancora nessuna. Quando qualcuno preme "📢 Mostra a tutti", la prova compare qui.</p>'}
        ${fold('🕰️ La serata, ora per ora', `<ul>${D.facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)}`;
    }
    function peopleHtml() {
      const all = [...IDS.map((id) => [id, D.pub[id]]), ...Object.entries(D.npc)];
      return `<p class="muted center-t">Tocca un ritratto per leggere chi è.</p>
        <div class="people">${all.map(([id, p]) => `<button class="person ${id === me.id ? 'me' : ''}" data-who="${id}"><img src="${p.img}" alt=""><b>${esc(p.name)}</b><small>${esc(p.title || (D.pub[id] ? '' : 'Personaggio'))}</small></button>`).join('')}</div>`;
    }
    function sheet(id) {
      const p = D.pub[id] || D.npc[id];
      return `<div class="sheet" id="sheet"><div class="sheet-in"><button class="sheet-x" id="sheetx" aria-label="Chiudi">✕</button>
        <img src="${p.img}" alt=""><h3>${esc(p.name)}</h3>${p.title ? `<em>${esc(p.title)}</em>` : ''}<p>${esc(p.blurb)}</p>${p.costume ? `<p class="cost">🎭 ${esc(p.costume)}</p>` : ''}</div></div>`;
    }
    // voto a passi: una domanda per schermata, come nei quiz
    let vstep = 0, vdraft = null;
    function voteHtml() {
      const Q = D.vote.questions, n = Q.length;
      if (!vdraft) vdraft = { ...(L.vote || {}) };
      if (L.vote && vstep < 0) return `<div class="wait"><div class="seal small">🗳️</div><h2>Voto inviato ✓</h2><p>Puoi cambiarlo finché non si rivela la verità.</p></div>
        ${summary()}<button class="btn wide ghost" id="vedit">Modifica il voto</button>`;
      if (vstep >= n) return `<div class="steps">${dots(n, n)}</div><h3 class="vq">Controlla e invia</h3>${summary(true)}
        <button class="btn big wide" id="sendvote">Invia il voto 🗳️</button><button class="link" id="vback">◀ Indietro</button>`;
      const q = Q[vstep], ids = q.players ? IDS.filter((id) => id !== me.id) : D.vote.suspects;
      return `<div class="steps">${dots(n, vstep)}<span>${vstep + 1} di ${n}</span></div>
        <h3 class="vq">${esc(q.q)}</h3>${q.pts ? `<p class="muted center-t">${q.pts === 3 ? '+3 punti se indovini' : '+1 punto se indovini'}</p>` : ''}
        <div class="pick">${ids.map((id) => `<button data-v="${id}" class="${vdraft[q.id] === id ? 'on' : ''}"><img src="${imgOf(id)}" alt=""><b>${esc(nameOf(id))}</b></button>`).join('')}</div>
        ${vstep > 0 ? '<button class="link" id="vback">◀ Domanda precedente</button>' : ''}`;
    }
    const dots = (n, cur) => Array.from({ length: n }, (_, i) => `<i class="${i < cur ? 'past' : i === cur ? 'now' : ''}"></i>`).join('');
    function summary(edit) {
      const v = edit ? vdraft : L.vote || {};
      return `<div class="sum">${D.vote.questions.map((q, i) => `<button class="sum-r" ${edit ? `data-step="${i}"` : 'disabled'}><span>${esc(q.q)}</span>${v[q.id] ? `<b><img src="${imgOf(v[q.id])}" alt="">${esc(nameOf(v[q.id]))}</b>` : '<b class="muted">—</b>'}</button>`).join('')}</div>`;
    }
    function endHtml() {
      const r = S.res;
      if (!r) return `<div class="wait"><div class="candle"><i></i></div><h2>Guardate lo schermo grande 👀</h2><p>La verità sta per essere svelata.</p></div>`;
      const rank = Object.entries(r.score).sort((a, b) => b[1] - a[1]);
      const pos = rank.findIndex(([id]) => id === me.id) + 1;
      return `<div class="wait"><div class="seal small">${pos === 1 ? '🏆' : '🥂'}</div><h2>${pos === 1 ? 'Hai vinto!' : `Sei ${pos}° in classifica`}</h2><p>Hai fatto <b>${r.score[me.id] || 0}</b> punti.</p></div>
        <section class="card"><h4>Classifica</h4><ol class="rank">${rank.map(([id, s]) => `<li class="${id === me.id ? 'me' : ''}"><img src="${imgOf(id)}" alt="">${esc(nameOf(id))}<b>${s}</b></li>`).join('')}</ol></section>`;
    }
    function bind() {
      $$('[data-go]').forEach((b) => (b.onclick = () => { tab = b.dataset.go; game(); window.scrollTo(0, 0); }));
      $$('[data-c]').forEach((b) => (b.onclick = () => {
        const A = me.acts[S.act]; const c = A.clues.find((x) => x.id === b.dataset.c);
        if (L.shown[c.id] && !confirm('L\'hai già mostrata. Rimandarla sullo schermo?')) return;
        if (!L.shown[c.id] && !confirm('Mostrare questa prova a tutti sullo schermo grande?')) return;
        send('e', { t: 'reveal', g: S.g, k: me.id, id: c.id, text: c.text, src: c.src || null });
        L.shown[c.id] = 1; save(); game();
      }));
      $$('[data-play]').forEach((b) => (b.onclick = () => { const a = new Audio(b.dataset.play); a.volume = 0.5; a.play(); }));
      $$('[data-m]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.m; L.done[id] = !L.done[id]; save();
        send('e', { t: 'mission', g: S.g, k: me.id, id, done: !!L.done[id] }); game();
      }));
      $$('[data-who]').forEach((b) => (b.onclick = () => { sheetId = b.dataset.who; game(); }));
      const sx = $('#sheet'); if (sx) sx.onclick = (e) => { if (e.target === sx || e.target.id === 'sheetx') { sheetId = null; game(); } };
      const db = $('#donebtn'); if (db) db.onclick = () => { send('e', { t: 'done', g: S.g, k: me.id, ph: S.ph, ti: S.ti }); mini = turnKey(); game(); };
      const mb = $('#mini'); if (mb) mb.onclick = () => { mini = turnKey(); game(); };
      const ro = $('#reopen'); if (ro) ro.onclick = () => { mini = null; game(); };
      // voto
      $$('.pick button').forEach((b) => (b.onclick = () => {
        const q = D.vote.questions[vstep]; vdraft[q.id] = b.dataset.v;
        $$('.pick button').forEach((x) => x.classList.toggle('on', x === b));
        setTimeout(() => { vstep++; game(); window.scrollTo(0, 0); }, 260);
      }));
      $$('[data-step]').forEach((b) => (b.onclick = () => { vstep = +b.dataset.step; game(); }));
      const vb = $('#vback'); if (vb) vb.onclick = () => { vstep = Math.max(0, vstep - 1); game(); };
      const ve = $('#vedit'); if (ve) ve.onclick = () => { vstep = 0; vdraft = { ...L.vote }; game(); };
      const sv = $('#sendvote');
      if (sv) sv.onclick = () => {
        if (!vdraft.killer) { vstep = 0; return game(); }
        L.vote = { ...vdraft }; save(); send('e', { t: 'vote', g: S.g, k: me.id, v: L.vote }); vstep = -1; game();
      };
    }
    if (L.vote) vstep = -1;

    // lo schermo del telefono non si spegne durante la cena
    let wl = null;
    const wake = async () => { try { if (!wl && navigator.wakeLock && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => (wl = null)); } } catch {} };
    document.addEventListener('click', wake);
    document.addEventListener('visibilitychange', wake);

    render();
  }

  // ==================================================================== HOST
  async function host(code) {
    document.body.className = 'host';
    const H = await unlock(D.h, code);
    if (!H) return landing('Link del narratore non valido.');
    const PH = H.phases;
    const LS = 'ufv-host' + (TEST ? '-t' : '');
    const fresh = () => ({ g: Math.random().toString(36).slice(2, 8), ph: -1, turn: -1, shown: [], votes: {}, missions: {}, res: null });
    let G = Object.assign(fresh(), load(LS) || {});
    const lobbyInfo = load(LS + '-lobby') || { ready: {}, seen: {} };
    const save = () => { store(LS, G); store(LS + '-lobby', lobbyInfo); };
    const T0 = Date.now() / 1000;
    let started = false, audio = null, lineIdx = 0, playToken = 0, ambient = true;
    let timer = { left: 0, run: false, total: 0 }, popQ = [], popOn = false;
    let turnT = { left: 0, total: 0, run: false }, autoNext = null;
    const RQ = () => { const p = PH[G.ph]; return p && p.round ? p.round : null; };
    const inRound = () => { const R = RQ(); return !!R && G.turn < R.order.length; };

    // --- rete
    const publish = () => {
      const p = PH[G.ph];
      const R = p && p.round, live = R && G.turn < R.order.length;
      send('s', { g: G.g, ph: G.ph, act: p ? p.act : null, n: p ? p.title : '', kicker: p ? p.kicker : '', board: p && p.board ? p.board : null,
        turn: live && G.turn >= 0 ? R.order[G.turn] : null, rq: live ? R.q : null, ord: live ? R.order : null, ti: live ? G.turn : null,
        sh: G.shown.map((x) => ({ k: x.k, text: x.text, time: x.time })), res: G.res ? { score: G.res.score } : null, ts: Date.now() });
    };
    listen('e', 'all', (ev, m) => {
      const k = ev.k; if (!D.pub[k]) return;
      if (ev.t === 'hello') lobbyInfo.seen[k] = m.time;
      if (ev.t === 'ready') { lobbyInfo.ready[k] = m.time; lobbyInfo.seen[k] = m.time; }
      if (ev.g !== G.g) { save(); refreshPlayers(); return; }
      if (ev.t === 'reveal') {
        const dup = G.shown.find((s) => s.mid === m.id);
        if (!dup) { G.shown.push({ k, id: ev.id, text: ev.text, src: ev.src, mid: m.id, time: m.time }); pop(ev); publish(); }
      }
      if (ev.t === 'mission') { (G.missions[k] ||= {})[ev.id] = ev.done; }
      if (ev.t === 'vote') G.votes[k] = ev.v;
      if (ev.t === 'done' && ev.ph === G.ph && ev.ti === G.turn && inRound() && RQ().order[G.turn] === k) nextTurn();
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
    $('#next').onclick = advance;
    $('#pause').onclick = togglePause;
    $('#replay').onclick = () => { if (inRound() && G.turn >= 0) callTurn(); else playLines(G.ph, 0); };
    $('#plus5').onclick = () => { timer.left += 300; timer.total += 300; timer.run = true; };
    $('#timer').onclick = () => { if (inRound() && G.turn >= 0) turnT.run = !turnT.run; else timer.run = !timer.run; };
    $('#amb').onclick = () => { ambient = !ambient; rainOn(ambient ? 0.1 : 0); $('#amb').classList.toggle('off', !ambient); };
    $('#fs').onclick = fullscreen;
    $('#reset').onclick = () => {
      if (!confirm('Ricominciare da zero? Voti, indizi e missioni verranno azzerati.')) return;
      stopAudio(); G = fresh(); save(); publish(); renderPhase();
    };
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') advance();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(G.ph - 1);
      else if (e.key === ' ') { e.preventDefault(); togglePause(); }
      else if (e.key === 'r' || e.key === 'R') { if (inRound() && G.turn >= 0) callTurn(); else playLines(G.ph, 0); }
      else if (e.key === 'f' || e.key === 'F') fullscreen();
      else if (e.key === 't' || e.key === 'T') { if (inRound() && G.turn >= 0) turnT.run = !turnT.run; else timer.run = !timer.run; }
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
      clearTimeout(autoNext); turnT = { left: 0, total: 0, run: false };
      $('#dark').classList.remove('on');
      G.ph = i; G.turn = -1;
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
      nextLabel();
      const C = $('#center');
      C.innerHTML = ''; C.className = 'center';
      if (p.gallery) { C.className = 'center gallery'; C.innerHTML = IDS.map(card).join('') + Object.keys(D.npc).map((n) => `<div class="pc npc"><img src="${D.npc[n].img}" alt=""><b>${esc(D.npc[n].name)}</b></div>`).join(''); }
      if (p.round) renderTurn();
      if (p.recap) { C.className = 'center recap'; C.innerHTML = `<ol class="recap">${p.board.map((b) => `<li class="on">${esc(b)}</li>`).join('')}</ol>`; }
      if (p.intro) { C.className = 'center gallery'; C.innerHTML = IDS.map(card).join(''); $$('.pc', C).forEach((el) => (el.onclick = () => spotlight(el.dataset.id))); }
      if (p.vote) { C.className = 'center votes'; refreshVotes(); }
      if (p.results) { C.className = 'center results'; C.innerHTML = resultsHtml(); }
      refreshSide();
    }
    function nextLabel() {
      const p = PH[G.ph];
      if (!p) return;
      $('#next').textContent = inRound() ? (G.turn < 0 ? 'Inizia il giro ▶' : 'Prossimo ▶') : G.ph === PH.length - 1 ? 'Fine' : PH[G.ph + 1].vote ? 'Al voto ▶' : PH[G.ph + 1].reveal ? 'Rivela la verità ▶' : 'Avanti ▶';
    }
    function advance() { if (inRound()) nextTurn(); else go(G.ph + 1); }

    // --- giro di parola
    function renderTurn() {
      const R = RQ(), C = $('#center'); if (!R || !C) return;
      const n = R.order.length, t = G.turn;
      C.className = 'center round';
      const queue = `<div class="queue">${R.order.map((id, i) => `<div class="qi ${i < t || t >= n ? 'done' : i === t ? 'now' : ''}"><img src="${D.pub[id].img}" alt=""><small>${esc(D.pub[id].name)}</small></div>`).join('')}</div>`;
      if (t >= 0 && t < n) {
        const id = R.order[t];
        C.innerHTML = `<div class="rq">🎤 ${esc(R.q)}</div>
          <div class="spk"><img src="${D.pub[id].img}" alt=""><div><span class="kicker">Ha la parola</span><h2>${esc(D.pub[id].name)}</h2><p>${esc(D.pub[id].title)}</p>
          <div class="tbar"><i id="tbar"></i></div><b class="tleft" id="tleft">${fmt(turnT.left || R.secs)}</b></div></div>${queue}`;
      } else if (t >= n) {
        C.innerHTML = `<div class="rq">🗣️ Discussione libera</div><p class="rsub">Domande, accuse e prove dal telefono (📢 Mostra a tutti).${PH[G.ph].timer ? ` Avete ${PH[G.ph].timer} minuti.` : ''}</p>${queue}`;
      } else {
        C.innerHTML = `<div class="rq">🎤 ${esc(R.q)}</div><p class="rsub">Giro di parola: ${R.secs} secondi a testa, in quest'ordine.</p>${queue}`;
      }
      tickTurn();
    }
    function tickTurn() {
      const R = RQ(); const b = $('#tbar'), l = $('#tleft');
      if (!R || !b) return;
      b.style.width = `${(turnT.total ? turnT.left / turnT.total : 1) * 100}%`;
      b.className = turnT.left <= 10 && turnT.total ? 'low' : '';
      l.textContent = (turnT.run || !turnT.total ? '' : '⏸ ') + fmt(turnT.total ? turnT.left : R.secs);
    }
    function nextTurn() {
      const R = RQ(); if (!R) return;
      clearTimeout(autoNext);
      G.turn = Math.min(G.turn + 1, R.order.length);
      callTurn();
    }
    function callTurn() {
      const p = PH[G.ph], R = p.round, n = R.order.length;
      stopAudio();
      $('#subs').className = 'subs';
      save(); publish(); renderTurn(); nextLabel(); refreshSide();
      if (G.turn >= n) {
        turnT = { left: 0, total: 0, run: false };
        if (p.timer) timer = { left: p.timer * 60, total: p.timer * 60, run: true };
        $('#cue').textContent = p.timer ? `🗣️ Discussione libera · ${p.timer} minuti` : '🗣️ Discussione libera';
        $('#cue').className = 'cue on';
        chime();
        return;
      }
      const id = R.order[G.turn], tok = playToken, c = H.calls[id];
      turnT = { left: R.secs, total: R.secs, run: false };
      tickTurn();
      const start = () => { if (tok !== playToken || turnT.run || turnT.left < R.secs) return; turnT.run = true; tickTurn(); };
      setTimeout(start, 5000); // se l'audio non parte, il tempo parte lo stesso
      audio = new Audio(c.src);
      audio.onended = start;
      audio.onerror = () => speak(c.t, start);
      audio.play().catch(() => speak(c.t, start));
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
        <button class="btn big pulse" id="start">${D.meta.icon} Inizia la serata</button>
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
    function togglePause() {
      if (inRound() && G.turn >= 0 && (!audio || audio.ended || audio.paused)) { turnT.run = !turnT.run; tickTurn(); return; }
      if (!audio) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    }
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
          subs.className = 'subs on v-' + l.v + (l.rec ? ' rec' : '');
          subs.innerHTML = `<span class="who">${l.rec ? '📼 ' : ''}${esc(D.meta.voices[l.v] || '')}${l.rec ? ' · registrazione delle 23:35' : ''}</span><div class="karaoke" id="kar"></div>`;
          const target = l.dark ? $('#darktext') : $('#kar');
          audio = new Audio(l.src);
          karaoke(target, l.t, audio);
          if (p.recap) {
            const items = $$('.recap li');
            items.forEach((li) => li.classList.remove('on'));
            audio.addEventListener('timeupdate', () => { if (!audio.duration) return; const k = Math.ceil((audio.currentTime / audio.duration) * items.length * 1.04); items.forEach((li, i) => li.classList.toggle('on', i < k)); });
            audio.addEventListener('ended', () => items.forEach((li) => li.classList.add('on')));
          }
          const after = () => { if (tok !== playToken) return; if (l.bang) bang(); lineIdx++; setTimeout(next, l.gap ?? 900); };
          audio.onended = after;
          audio.onerror = () => speak(l.t, after);
          audio.play().catch(() => speak(l.t, after));
        });
      };
      next();
    }
    function before(p, l, go) {
      if (p.cue && lineIdx === 0) { $('#cue').textContent = p.cue; $('#cue').className = 'cue on'; }
      if (l.dark) { $('#dark').classList.add('on'); $('#darktext').textContent = ''; fireworks(); if (ambient) rainOn(0.2); return setTimeout(go, 2600); }
      if (l.light) { $('#dark').classList.remove('on'); rainOn(ambient ? 0.1 : 0); $('#cue').textContent = '💡 Riaccendete le luci'; $('#cue').className = 'cue on'; return go(); }
      if (l.flash) { setBg(l.flash); flash(); thunder(0.6); return setTimeout(go, 400); }
      go();
    }
    function linesDone(p) {
      if (p.round && G.turn < 0) { const ph = G.ph; setTimeout(() => { if (G.ph === ph && G.turn < 0) nextTurn(); }, 1500); return; }
      if (p.timer && !p.round) timer.run = true;
      if (p.reveal) setTimeout(() => go(G.ph + 1), 2500);
    }
    function flash() { const f = $('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

    // --- timer
    setInterval(() => {
      const el = $('#timer'); if (!el) return;
      if (!timer.total) { el.textContent = ''; el.className = 'timer'; return; }
      if (timer.run && timer.left > 0) { timer.left -= 1; if (timer.left === 0) { bell(); timer.run = false; } }
      if (turnT.run && turnT.left > 0) {
        turnT.left -= 1; tickTurn();
        if (turnT.left === 0) { turnT.run = false; bell(); const t = G.turn; autoNext = setTimeout(() => { if (G.turn === t && inRound()) nextTurn(); }, 4000); }
      }
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
        if (k !== sol.killer) for (const q of H.vote.questions) if (q.pts && sol[q.id] && v[q.id] === sol[q.id]) score[k] += q.pts;
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
          <p class="muted">Colpevole indovinato +3 · libro nero +1 · pistola +1 · missioni +1 · voti da attore +1 · chi ha ucciso: +2 per ogni accusa sbagliata</p></div></div>`;
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

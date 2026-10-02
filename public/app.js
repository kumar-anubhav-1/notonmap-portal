'use strict';
(() => {
  // ---------- Text in both languages (plus Hinglish headings for guides and next steps) ----------
  const T = {
    en: {
      sub: 'Guide', typing: 'typing…', menu: 'Menu', forgetAsk: 'Forget everything the guide has learned about you?', homeTitle: 'Where are you today?', homeLead: 'Pick one. You can change it any time.',
      notSure: 'Not sure? Start here', soon: 'Coming soon', change: 'Change', newChat: 'New chat',
      placeholder: 'Type or speak your question', send: 'Send', speak: 'Speak', stop: 'Stop', thinking: 'Thinking',
      verify: 'Please confirm local rules with your local authority or a qualified person.',
      sopTitle: 'Print-ready guide', download: 'Download PDF', whatsapp: 'Share on WhatsApp',
      switchTo: (n) => `This looks like a better fit for: ${n}`, switchBtn: (n) => `Switch to "${n}"`,
      codeTitle: 'Enter your pilot code', codeHelp: 'This test version is open to invited hosts only.', codeBtn: 'Continue',
      codeWrong: 'That code did not work. Check it and try again.',
      forget: 'Forget what the guide remembers about me', forgetSure: 'Yes, forget everything', forgetCancel: 'Keep it',
      forgotten: 'Done. The guide has forgotten what it learned about you.',
      err: {
        rate_limit: 'You have asked many questions in a short time. Please wait a little and try again.',
        daily_cap: 'The guide is very busy today. Please try again tomorrow.',
        code: 'Your pilot code is missing or wrong.',
        upstream: 'The guide could not answer just now. Please try again in a minute.',
        too_large: 'That message is too long. Please shorten it and try again.',
        offline: 'No internet connection. Please check your connection and try again.',
        default: 'Something went wrong. Please try again.',
      },
    },
    hi: {
      sub: 'मार्गदर्शक', typing: 'लिख रहा है…', menu: 'मेनू', forgetAsk: 'गाइड ने आपके बारे में जो सीखा है, सब भुला दें?', homeTitle: 'आप आज कहाँ हैं?', homeLead: 'एक चुनें। आप इसे कभी भी बदल सकते हैं।',
      notSure: 'पक्का नहीं पता? यहाँ से शुरू करें', soon: 'जल्द आ रहा है', change: 'बदलें', newChat: 'नई बातचीत',
      placeholder: 'अपना सवाल लिखें या बोलकर बताएँ', send: 'भेजें', speak: 'बोलें', stop: 'रोकें', thinking: 'सोच रहा हूँ',
      verify: 'कृपया स्थानीय नियम अपने स्थानीय अधिकारी या जानकार व्यक्ति से पक्का कर लें।',
      sopTitle: 'प्रिंट के लिए तैयार गाइड', download: 'PDF डाउनलोड करें', whatsapp: 'WhatsApp पर भेजें',
      switchTo: (n) => `यह इस विकल्प के लिए बेहतर लगता है: ${n}`, switchBtn: (n) => `"${n}" पर जाएँ`,
      codeTitle: 'अपना पायलट कोड डालें', codeHelp: 'यह परीक्षण संस्करण केवल आमंत्रित मेज़बानों के लिए है।', codeBtn: 'आगे बढ़ें',
      codeWrong: 'यह कोड सही नहीं है। जाँचकर फिर से कोशिश करें।',
      forget: 'गाइड ने मेरे बारे में जो याद रखा है, वह भुला दें', forgetSure: 'हाँ, सब भुला दें', forgetCancel: 'रहने दें',
      forgotten: 'हो गया। गाइड ने आपके बारे में सीखी बातें भुला दी हैं।',
      err: {
        rate_limit: 'आपने थोड़े समय में बहुत सवाल पूछ लिए। कृपया थोड़ी देर रुककर फिर कोशिश करें।',
        daily_cap: 'आज मार्गदर्शक पर बहुत भीड़ है। कृपया कल फिर कोशिश करें।',
        code: 'आपका पायलट कोड नहीं है या गलत है।',
        upstream: 'मार्गदर्शक अभी जवाब नहीं दे पाया। कृपया एक मिनट बाद फिर कोशिश करें।',
        too_large: 'संदेश बहुत लंबा है। कृपया छोटा करके फिर कोशिश करें।',
        offline: 'इंटरनेट नहीं चल रहा। कृपया कनेक्शन जाँचकर फिर कोशिश करें।',
        default: 'कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।',
      },
    },
  };
  // Headings that follow the language the reply was written in (en, hi or hinglish).
  const H = {
    en: { next: 'Your next step', guide: 'HOST GUIDE', purpose: 'Purpose', items: 'What you need', steps: 'Steps', safety: 'Safety first', checks: 'Completion check', nextAction: 'Your next action', note: 'General guidance only. Please confirm local rules, prices and safety needs with your local authority.' },
    hi: { next: 'आपका अगला कदम', guide: 'मेज़बान गाइड', purpose: 'उद्देश्य', items: 'क्या चाहिए', steps: 'कदम', safety: 'पहले सुरक्षा', checks: 'पूरा होने की जाँच', nextAction: 'आपका अगला कदम', note: 'यह केवल सामान्य जानकारी है। कृपया स्थानीय नियम, दाम और सुरक्षा की ज़रूरतें अपने स्थानीय अधिकारी से पक्की करें।' },
    hinglish: { next: 'Aapka agla kadam', guide: 'HOST GUIDE', purpose: 'Maksad', items: 'Kya chahiye', steps: 'Kadam', safety: 'Pehle suraksha', checks: 'Poora hone ki jaanch', nextAction: 'Aapka agla kadam', note: 'Yeh sirf aam jaankari hai. Kripya local niyam, daam aur suraksha ki zaroorat apne local adhikari se pakki kar lein.' },
  };

  // ---------- State ----------
  const $ = (id) => document.getElementById(id);
  const PROFILE_KEY = 'nom_profile_v1';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  function loadProfile() { try { const p = JSON.parse(store.get(PROFILE_KEY) || 'null'); return p && typeof p === 'object' ? p : null; } catch { return null; } }
  const state = {
    lang: store.get('nom_lang') || ((navigator.language || '').startsWith('hi') ? 'hi' : 'en'),
    config: null, journey: null, messages: [], busy: false,
    code: store.get('nom_code') || '', chipsReply: null,
    profile: loadProfile(),
  };
  const t = () => T[state.lang];
  const pick = (obj) => (obj && (obj[state.lang] || obj.en)) || '';
  const hdr = (reply) => H[(reply && reply.reply_language) || state.lang] || H.en;

  // ---------- Safe Markdown ----------
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  function md(src) {
    const out = []; let list = null;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(src).replace(/\r/g, '').split('\n')) {
      const line = raw.trim(); let m;
      if (!line) { closeList(); continue; }
      if ((m = line.match(/^[-*•]\s+(.*)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^#{1,4}\s+(.*)$/))) { closeList(); out.push(`<p><strong>${inline(m[1])}</strong></p>`); }
      else { closeList(); out.push(`<p>${inline(line)}</p>`); }
    }
    closeList();
    return out.join('');
  }

  // ---------- Views ----------
  function show(view) {
    for (const id of ['codeView', 'homeView', 'chatView']) $(id).hidden = id !== view;
    $('composer').hidden = view !== 'chatView';
    $('backBtn').hidden = view !== 'chatView';
    $('newChatBtn').hidden = view !== 'chatView';
    $('foot').hidden = view === 'chatView';
    $('forgetBtn').hidden = !state.profile;
    closeMenu();
    setStatus();
    $('main').scrollTop = 0;
    updateAct();
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    $('langEn').setAttribute('aria-pressed', String(state.lang === 'en'));
    $('langHi').setAttribute('aria-pressed', String(state.lang === 'hi'));
    $('homeLead').textContent = t().homeTitle + ' ' + t().homeLead;
    $('notSure').textContent = t().notSure; $('newChatBtn').textContent = t().newChat;
    $('backBtn').setAttribute('aria-label', t().change);
    $('menuBtn').setAttribute('aria-label', t().menu);
    $('input').placeholder = t().placeholder;
    $('forgetAsk').textContent = t().forgetAsk;
    $('codeTitle').textContent = t().codeTitle; $('codeHelp').textContent = t().codeHelp;
    $('codeBtn').textContent = t().codeBtn; $('codeInput').setAttribute('aria-label', t().codeTitle);
    $('forgetBtn').textContent = t().forget; $('forgetYes').textContent = t().forgetSure; $('forgetNo').textContent = t().forgetCancel;
    if (state.config) { renderTiles(); if (state.journey) renderChatHeader(); }
    renderFollowups();
    setStatus(); updateAct();
    if (recog) recog.lang = state.lang === 'hi' ? 'hi-IN' : 'en-IN';
  }

  function renderTiles() {
    const wrap = $('tiles'); wrap.textContent = '';
    for (const j of state.config.journeys) {
      const b = document.createElement('button');
      b.className = 'tile'; b.type = 'button'; b.disabled = !j.live;
      b.innerHTML = `<span class="icon" aria-hidden="true">${esc(j.icon)}</span><span class="tx"><span class="t">${esc(pick(j.label))}</span><span class="h">${esc(pick(j.hint))}</span></span>${j.live ? '' : `<span class="soon">${esc(t().soon)}</span>`}`;
      if (j.live) b.addEventListener('click', () => startJourney(j.code));
      wrap.appendChild(b);
    }
  }
  const journeyOf = (code) => state.config.journeys.find((j) => j.code === code);

  // Header sub-line: the journey name, or "typing…" while the guide is answering (like a WhatsApp contact).
  function setStatus() {
    const inChat = !$('chatView').hidden;
    const j = inChat && state.config && state.journey ? journeyOf(state.journey) : null;
    $('brandSub').textContent = state.busy ? t().typing : (j ? pick(j.label) : t().sub);
  }
  const clock = () => new Date().toLocaleTimeString(state.lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const meta = (ticks) => { const m = document.createElement('div'); m.className = 'meta'; m.innerHTML = `${esc(clock())}${ticks ? '<span class="ticks">✓✓</span>' : ''}`; return m; };

  function renderChatHeader() {
    const j = journeyOf(state.journey);
    $('journeyPill').textContent = j ? `${j.icon} ${pick(j.label)}` : '';
    const starters = $('starters'); starters.textContent = '';
    if (state.messages.length === 0 && j) {
      for (const s of j.starters || []) {
        const c = document.createElement('button');
        c.type = 'button'; c.className = 'chip'; c.textContent = pick(s.label);
        c.addEventListener('click', () => send(pick(s.message) || pick(s.label)));
        starters.appendChild(c);
      }
    }
  }

  function startJourney(code) {
    state.journey = code; state.messages = []; state.chipsReply = null;
    $('thread').textContent = '';
    renderChatHeader(); show('chatView');
    $('input').focus({ preventScroll: true });
  }

  // ---------- Chat ----------
  function addUser(text) {
    const d = document.createElement('div'); d.className = 'msg user';
    const p = document.createElement('div'); p.textContent = text; d.appendChild(p); d.appendChild(meta(true));
    $('thread').appendChild(d); scrollDown();
  }
  function scrollDown() { const m = $('main'); m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' }); }

  function addBot(reply) {
    const d = document.createElement('div'); d.className = 'msg bot';
    d.lang = reply.reply_language === 'hi' ? 'hi' : 'en';
    d.innerHTML = md(reply.answer_markdown);
    if (reply.next_micro_step) {
      const n = document.createElement('div'); n.className = 'nextstep';
      n.innerHTML = `<b>${esc(hdr(reply).next)}</b>${esc(reply.next_micro_step)}`;
      d.appendChild(n);
    }
    if (reply.needs_human_verification) {
      const b = document.createElement('div'); b.className = 'banner'; b.textContent = '⚠ ' + t().verify; d.appendChild(b);
    }
    if (reply.sop) {
      const c = document.createElement('div'); c.className = 'sopcard';
      c.innerHTML = `<div class="head"><div class="pdfico">PDF</div><div><div class="st">${esc(reply.sop.title)}</div><div class="ss">${esc(t().sopTitle)}</div></div></div>`;
      const row = document.createElement('div'); row.className = 'row';
      const mk = (cls, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.addEventListener('click', fn); return b; };
      row.append(
        mk('slim', '⬇ ' + t().download, () => printSop(reply)),
        mk('slim wa', t().whatsapp, () => shareWhatsApp(reply)),
      );
      c.appendChild(row); d.appendChild(c);
    }
    const sj = reply.suggest_journey;
    if (sj && sj !== 'NONE' && sj !== state.journey && journeyOf(sj) && journeyOf(sj).live) {
      const s = document.createElement('div'); s.className = 'switch';
      const name = pick(journeyOf(sj).label);
      s.innerHTML = `<div>${esc(t().switchTo(name))}</div>`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = t().switchBtn(name);
      b.addEventListener('click', () => startJourney(sj));
      s.appendChild(b); d.appendChild(s);
    }
    d.appendChild(meta(false));
    $('thread').appendChild(d);
    state.chipsReply = reply; renderFollowups(); scrollDown();
  }

  function renderFollowups() {
    document.querySelectorAll('.followups').forEach((n) => n.remove());
    const items = (state.chipsReply && state.chipsReply.follow_ups) || [];
    if (!items.length) return;
    const f = document.createElement('div'); f.className = 'chips followups';
    for (const q of items) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = q;
      c.addEventListener('click', () => send(q)); f.appendChild(c);
    }
    $('thread').appendChild(f); scrollDown();
  }

  function addError(key) {
    const d = document.createElement('div'); d.className = 'msg bot'; d.setAttribute('role', 'alert');
    d.textContent = t().err[key] || t().err.default;
    $('thread').appendChild(d); scrollDown();
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || state.busy || !state.journey) return;
    state.busy = true; setStatus(); state.chipsReply = null;
    document.querySelectorAll('.followups').forEach((n) => n.remove());
    $('starters').textContent = '';
    addUser(text); $('input').value = ''; autosize();
    state.messages.push({ role: 'user', content: text });
    const typing = document.createElement('div'); typing.className = 'typingbubble'; typing.innerHTML = '<i></i><i></i><i></i>'; typing.setAttribute('aria-label', t().thinking);
    $('thread').appendChild(typing); scrollDown();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 35000); // the server gives up after 24 s; this is only a safety net
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pilot-code': state.code },
        body: JSON.stringify({ journey: state.journey, uiLanguage: state.lang, messages: state.messages.slice(-10), profile: state.profile }),
        signal: ctl.signal,
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok || !data.ok) {
        state.messages.pop();
        if (data.error === 'code') { store.del('nom_code'); state.code = ''; }
        return addError(data.error || 'default');
      }
      if (data.profile) { state.profile = data.profile; store.set(PROFILE_KEY, JSON.stringify(data.profile)); $('forgetBtn').hidden = false; }
      state.messages.push({ role: 'assistant', content: data.reply.answer_markdown });
      addBot(data.reply);
    } catch {
      typing.remove(); state.messages.pop();
      addError(navigator.onLine ? 'upstream' : 'offline');
    } finally {
      clearTimeout(timer);
      state.busy = false; setStatus(); updateAct();
    }
  }

  // ---------- Guide: PDF (browser print), Print, WhatsApp ----------
  function buildPrint(reply) {
    const s = reply.sop, L = hdr(reply);
    const li = (arr) => arr.map((x) => `<li><span class="box"></span><span>${esc(x)}</span></li>`).join('');
    const steps = s.steps.map((x, i) => `<li><span class="num">${i + 1}</span><span>${x.heading ? `<b>${esc(x.heading)}</b>` : ''}${esc(x.action)}</span></li>`).join('');
    const body = `
      <div class="p-title"><span class="p-tag">${esc(L.guide)}</span><h1>${esc(s.title)}</h1>${s.subtitle ? `<div class="p-sub">${esc(s.subtitle)}</div>` : ''}</div>
      ${s.purpose ? `<div class="p-purpose"><b>${esc(L.purpose)}.</b> ${esc(s.purpose)}</div>` : ''}
      ${s.required_items.length ? `<h2 class="p-h">${esc(L.items)}</h2><ul class="p-list p-items">${s.required_items.map((x) => `<li><span>&bull;</span><span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
      <h2 class="p-h">${esc(L.steps)}</h2><ol class="p-steps">${steps}</ol>
      ${s.safety_notes.length ? `<h2 class="p-h">${esc(L.safety)}</h2><div class="p-safety"><ul>${s.safety_notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${s.completion_checks.length ? `<h2 class="p-h">${esc(L.checks)}</h2><ul class="p-list">${li(s.completion_checks)}</ul>` : ''}
      ${s.next_action ? `<div class="p-next"><b>${esc(L.nextAction)}</b>${esc(s.next_action)}</div>` : ''}
      <div class="p-note">${esc(L.note)}</div>`;
    // The table's header and footer rows repeat on every page, which gives each page top and bottom breathing room.
    return `<div lang="${reply.reply_language === 'hi' ? 'hi' : 'en'}"><div class="p-frame"></div><table class="p-page"><thead><tr><td><div class="p-space"></div></td></tr></thead><tbody><tr><td>${body}</td></tr></tbody><tfoot><tr><td><div class="p-space"></div></td></tr></tfoot></table></div>`;
  }

  // Phones and desktops both save a PDF from the print dialog ("Save as PDF"), so one routine serves both buttons.
  function printSop(reply) {
    const old = document.title;
    $('printRoot').innerHTML = buildPrint(reply);
    document.title = reply.sop.filename_slug || 'host-guide'; // default PDF file name
    const restore = () => { document.title = old; $('printRoot').innerHTML = ''; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    setTimeout(() => window.print(), 80);
  }

  function shareWhatsApp(reply) {
    const s = reply.sop;
    const lines = [`*${s.title}*`, s.purpose, '', ...s.steps.map((x, i) => `${i + 1}. ${x.action}`)];
    if (s.completion_checks.length) lines.push('', ...s.completion_checks.map((x) => `☐ ${x}`));
    window.open('https://wa.me/?text=' + encodeURIComponent(lines.filter((l) => l !== undefined).join('\n')), '_blank', 'noopener');
  }

  // ---------- Voice input and the round action button ----------
  const ICON_MIC = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 0 0-7 0v5.5A3.5 3.5 0 0 0 12 15zm6-3.5a6 6 0 0 1-12 0H4.5a7.5 7.5 0 0 0 6.75 7.46V22h1.5v-3.04A7.5 7.5 0 0 0 19.5 11.5z"/></svg>';
  const ICON_SEND = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5v-6.2l9.5-2.3L3 9.7V3.5l19 8.5z"/></svg>';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null, listening = false;
  const hasText = () => $('input').value.trim().length > 0;
  function updateAct() {
    const b = $('actBtn');
    const asSend = hasText() || !recog;
    b.innerHTML = asSend ? ICON_SEND : ICON_MIC;
    b.setAttribute('aria-label', asSend ? t().send : (listening ? t().stop : t().speak));
    b.disabled = state.busy || (asSend && !hasText());
    b.classList.toggle('on', listening);
  }
  if (SR) {
    recog = new SR();
    recog.interimResults = true; recog.continuous = false; recog.maxAlternatives = 1;
    recog.onresult = (e) => { $('input').value = Array.from(e.results).map((r) => r[0].transcript).join(' '); autosize(); };
    const stop = () => { listening = false; updateAct(); };
    recog.onend = stop; recog.onerror = stop;
  }
  $('actBtn').addEventListener('click', () => {
    if (hasText()) return send($('input').value);
    if (!recog) return;
    if (listening) { recog.stop(); return; }
    try { recog.lang = state.lang === 'hi' ? 'hi-IN' : 'en-IN'; recog.start(); listening = true; updateAct(); } catch { /* already started */ }
  });

  // ---------- Input ----------
  function autosize() { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 120) + 'px'; updateAct(); }
  $('input').addEventListener('input', autosize);
  $('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('input').value); } });
  $('composer').addEventListener('submit', (e) => { e.preventDefault(); send($('input').value); });
  $('backBtn').addEventListener('click', () => show('homeView'));
  $('newChatBtn').addEventListener('click', () => startJourney(state.journey));
  $('notSure').addEventListener('click', () => startJourney(state.config.notSureGoesTo));
  for (const b of document.querySelectorAll('.lang-btn')) {
    b.addEventListener('click', () => { state.lang = b.dataset.lang; store.set('nom_lang', state.lang); applyLang(); closeMenu(); });
  }

  // ---------- Avatar menu ----------
  function closeMenu() { $('menu').hidden = true; $('menuBtn').setAttribute('aria-expanded', 'false'); forgetMode(false); }
  $('menuBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $('menu').hidden;
    $('menu').hidden = !open; $('menuBtn').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!$('menu').hidden && !$('menu').contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // Forget me: two taps, so it is never done by accident.
  function forgetMode(confirming) { $('forgetBtn').hidden = confirming || !state.profile; $('forgetConfirm').hidden = !confirming; }
  $('forgetBtn').addEventListener('click', (e) => { e.stopPropagation(); forgetMode(true); });
  $('forgetNo').addEventListener('click', (e) => { e.stopPropagation(); forgetMode(false); });
  $('forgetYes').addEventListener('click', () => {
    store.del(PROFILE_KEY); state.profile = null; closeMenu();
    const n = document.createElement('div'); n.className = 'toast'; n.textContent = t().forgotten; n.setAttribute('role', 'status');
    $('app').appendChild(n); setTimeout(() => n.remove(), 3500);
  });

  // ---------- Pilot code ----------
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('codeInput').value.trim();
    if (!code) return;
    state.code = code;
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pilot-code': code }, body: JSON.stringify({}) }).catch(() => null);
    if (res && res.status === 401) { $('codeError').textContent = t().codeWrong; $('codeError').hidden = false; return; }
    store.set('nom_code', code); $('codeError').hidden = true; show('homeView');
  });

  // ---------- Start ----------
  (async function init() {
    applyLang();
    try { state.config = await (await fetch('/api/config')).json(); }
    catch { state.config = { journeys: [], notSureGoesTo: 'IMPROVE', requiresCode: false }; }
    applyLang();
    if (state.config.requiresCode && !state.code) show('codeView'); else show('homeView');
  })();
})();

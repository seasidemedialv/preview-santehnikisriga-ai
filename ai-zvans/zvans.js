/*
 * AI zvans - "call the website".
 * The visitor presses "Zvanīt", a voice call opens in the browser and an AI agent (ElevenLabs Agents) answers.
 * At the end the agent calls the client tool `submit_lead` and this script POSTs the same JSON the form sends
 * to the same Activepieces webhook, so Telegram, the lead sheet and the client WhatsApp work unchanged.
 *
 * One tag per site:
 *   <script src="/ai-zvans/zvans.js" data-site="santehnikisriga.lv" data-agent-id="agent_..." data-webhook="https://..." defer></script>
 * No data-agent-id = DEMO mode (scripted sample call, no microphone, no cost).
 */
(function () {
  "use strict";
  const tag = document.currentScript;
  const CFG = {
    site: tag.dataset.site || location.hostname,
    agentId: tag.dataset.agentId || "",
    webhook: tag.dataset.webhook || "",
    brand: tag.dataset.brand || "Santehniķis Rīgā",
    logo: tag.dataset.logo || "/logo.png",
    sdk: "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.29.0/+esm",
  };
  const base = tag.src.replace(/zvans\.js.*$/, "");
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = base + "zvans.css";
  document.head.appendChild(css);

  const path = location.pathname;
  const htmlLang = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
  const LANG = ["en", "ru", "lv"].includes(htmlLang) ? htmlLang : (path.startsWith("/en/") || path === "/en" ? "en" : path.startsWith("/ru/") || path === "/ru" ? "ru" : "lv");

  const T = {
    lv: {
      call: "Zvanīt", callSub: "atbild uzreiz", callLong: "Zvanīt tagad", or: "vai aizpildiet formu",
      formHint: "Bez maksas, caur pārlūku.",
      ai: "Uldis", calling: "Zvana…", connecting: "Savienojas…", listening: "Klausās", speaking: "Runā",
      hint: "Jūs runājat ar MI asistentu. Saruna tiek pierakstīta, lai nodotu pieteikumu meistaram.",
      mute: "Izslēgt mikr.", unmute: "Ieslēgt mikr.", end: "Beigt", again: "Zvanīt vēlreiz", close: "Aizvērt",
      ended: "Zvans beidzies", sent: "Pieteikums nosūtīts", promise: "Meistars sazināsies ar jums 5 minūšu laikā.",
      micDenied: "Nav piekļuves mikrofonam. Atļaujiet mikrofonu pārlūkā vai aizpildiet formu.",
      failed: "Neizdevās savienoties. Lūdzu, aizpildiet formu - sazināsimies 5 minūšu laikā.",
      notSent: "Pieteikumu neizdevās nosūtīt. Lūdzu, aizpildiet formu.",
      demo: "Demo zvans", form: "Pieteikties",
      f: { name: "Vārds", phone: "Tālrunis", district: "Rajons", address: "Adrese", problem: "Problēma", urgency: "Steidzamība", description: "Apraksts" },
    },
    en: {
      call: "Call", callSub: "answered instantly", callLong: "Call now", or: "or fill in the form",
      formHint: "Free, right in your browser.",
      ai: "Uldis", calling: "Calling…", connecting: "Connecting…", listening: "Listening", speaking: "Speaking",
      hint: "You are talking to an AI assistant. The call is transcribed so your request can be passed to a plumber.",
      mute: "Mute", unmute: "Unmute", end: "End", again: "Call again", close: "Close",
      ended: "Call ended", sent: "Request sent", promise: "A plumber will contact you within 5 minutes.",
      micDenied: "No microphone access. Allow the microphone in your browser or fill in the form.",
      failed: "Could not connect. Please fill in the form - we will contact you within 5 minutes.",
      notSent: "The request could not be sent. Please fill in the form.",
      demo: "Demo call", form: "Book",
      f: { name: "Name", phone: "Phone", district: "District", address: "Address", problem: "Problem", urgency: "Urgency", description: "Description" },
    },
    ru: {
      call: "Позвонить", callSub: "ответим сразу", callLong: "Позвонить сейчас", or: "или заполните форму",
      formHint: "Бесплатно, прямо в браузере.",
      ai: "Улдис", calling: "Звоним…", connecting: "Соединяем…", listening: "Слушает", speaking: "Говорит",
      hint: "Вы говорите с ИИ-ассистентом. Разговор записывается, чтобы передать заявку мастеру.",
      mute: "Выкл. микр.", unmute: "Вкл. микр.", end: "Завершить", again: "Позвонить снова", close: "Закрыть",
      ended: "Звонок завершён", sent: "Заявка отправлена", promise: "Мастер свяжется с вами в течение 5 минут.",
      micDenied: "Нет доступа к микрофону. Разрешите микрофон в браузере или заполните форму.",
      failed: "Не удалось соединиться. Пожалуйста, заполните форму - мы свяжемся с вами в течение 5 минут.",
      notSent: "Не удалось отправить заявку. Пожалуйста, заполните форму.",
      demo: "Демо-звонок", form: "Заявка",
      f: { name: "Имя", phone: "Телефон", district: "Район", address: "Адрес", problem: "Проблема", urgency: "Срочность", description: "Описание" },
    },
  }[LANG];


  // Same working-hours rule as the Activepieces flow (SantehnikisRiga.lv_Forma, step_18), Rīga time:
  // Mon-Fri 09:00-19:00 "Darba laiks"; Mon-Thu after 19:00 "Pec 19:00"; Mon-Fri before 09:00 "Pirms 9:00";
  // Fri after 19:00, Sat, Sun "Brivdiena". The flow decides the WhatsApp messages; this only keeps the call's
  // promise in line with them.
  function workStatus(now) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Riga", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now || new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    const day = get("weekday"), min = Number(get("hour")) * 60 + Number(get("minute"));
    const weekend = day === "Saturday" || day === "Sunday";
    if (weekend || (day === "Friday" && min > 19 * 60)) return "Brivdiena";
    if (min > 19 * 60) return "Pec 19:00";
    if (min < 9 * 60) return "Pirms 9:00";
    return "Darba laiks";
  }
  const PROMISE = {
    lv: { "Darba laiks": "Meistars Jums atzvanīs 5 minūšu laikā.", "Pec 19:00": "Sazināsimies ar Jums rīt no 9:00.",
          "Pirms 9:00": "Sazināsimies ar Jums šodien no 9:00.", "Brivdiena": "Sazināsimies ar Jums pirmdien no 9:00." },
    en: { "Darba laiks": "A plumber will call you back within 5 minutes.", "Pec 19:00": "We will contact you tomorrow from 9:00.",
          "Pirms 9:00": "We will contact you today from 9:00.", "Brivdiena": "We will contact you on Monday from 9:00." },
    ru: { "Darba laiks": "Мастер перезвонит вам в течение 5 минут.", "Pec 19:00": "Мы свяжемся с вами завтра с 9:00.",
          "Pirms 9:00": "Мы свяжемся с вами сегодня с 9:00.", "Brivdiena": "Мы свяжемся с вами в понедельник с 9:00." },
  }[LANG];
  const promiseText = () => PROMISE[workStatus()];

  // Greeting chosen by working hours (same labels as the flow). Out of hours the caller hears it first.
  const GREET = {
    lv: { work: "Labdien! Šeit Uldis, Santehniķis Rīgā. Kas noticis?",
          busy: "Labdien! Šeit Uldis, Santehniķis Rīgā. Atvainojiet, šobrīd visi mūsu ārkārtas santehniķi ir aizņemti darbos. Varam ar Jums sazināties {when} no 9:00. Vai tas Jums derētu?",
          when: { "Pec 19:00": "rīt", "Pirms 9:00": "šodien", "Brivdiena": "pirmdien" } },
    en: { work: "Hello! This is Uldis from Plumber Riga. What happened?",
          busy: "Hello! This is Uldis from Plumber Riga. Sorry, all our emergency plumbers are busy on jobs right now. We can contact you {when} from 9:00. Would that work for you?",
          when: { "Pec 19:00": "tomorrow", "Pirms 9:00": "today", "Brivdiena": "on Monday" } },
    ru: { work: "Здравствуйте! Это Улдис, «Сантехник Рига». Что случилось?",
          busy: "Здравствуйте! Это Улдис, «Сантехник Рига». Извините, сейчас все наши аварийные сантехники заняты на вызовах. Мы можем связаться с вами {when} с 9:00. Вам это подойдёт?",
          when: { "Pec 19:00": "завтра", "Pirms 9:00": "сегодня", "Brivdiena": "в понедельник" } },
  }[LANG];
  function greeting() {
    const st = workStatus();
    return st === "Darba laiks" ? GREET.work : GREET.busy.replace("{when}", GREET.when[st]);
  }

  // Sample call shown in DEMO mode (no agent id yet). [speaker, text]
  const DEMO = {
    lv: {
      lines: [
        ["agent", "Labdien! Šeit Uldis, Santehniķis Rīgā. Kas noticis?"],
        ["user", "Labdien, virtuvē zem izlietnes tek ūdens no caurules."],
        ["agent", "Sapratu, noplūde zem izlietnes. Ja ūdens tek stipri, aizgrieziet krānu zem izlietnes vai dzīvokļa ūdens ievadu. Kurā rajonā jūs atrodaties?"],
        ["user", "Purvciemā, Dzelzavas ielā 51, dzīvoklis 12."],
        ["agent", "Paldies. Cik steidzami vajag meistaru - pēc iespējas ātrāk vai šodien vēlāk?"],
        ["user", "Pēc iespējas ātrāk."],
        ["agent", "Kā jūs sauc, un uz kādu numuru meistars var zvanīt?"],
        ["user", "Jānis, 20 000 000."],
        ["agent", "Pārbaudu: Jānis, numurs divi nulle, nulle nulle nulle, nulle nulle nulle. Pareizi?"],
        ["user", "Jā, pareizi."],
        ["tool"],
        ["agent", "Pieteikums nosūtīts. Meistars ar jums sazināsies 5 minūšu laikā. Uz dzirdēšanos!"],
      ],
      lead: { name: "Jānis", phone: "20000000", district: "Purvciems", address: "Dzelzavas iela 51, dz. 12", problem: "Noplūde", urgency: "ASAP", description: "Virtuvē zem izlietnes tek ūdens no caurules." },
    },
    en: {
      lines: [
        ["agent", "Hello! This is Uldis from Plumber Riga. What happened?"],
        ["user", "Hi, water is leaking from a pipe under my kitchen sink."],
        ["agent", "Understood, a leak under the sink. If it is leaking a lot, close the valve under the sink or the main water valve of the flat. Which district are you in?"],
        ["user", "Purvciems, Dzelzavas street 51, flat 12."],
        ["agent", "Thank you. How urgent is it - as soon as possible, or later today?"],
        ["user", "As soon as possible."],
        ["agent", "What is your name, and which number can the plumber call?"],
        ["user", "John, 20 000 000."],
        ["agent", "Let me check: John, number two zero, zero zero zero, zero zero zero. Is that right?"],
        ["user", "Yes."],
        ["tool"],
        ["agent", "Your request has been sent. A plumber will contact you within 5 minutes. Goodbye!"],
      ],
      lead: { name: "John", phone: "20000000", district: "Purvciems", address: "Dzelzavas iela 51, flat 12", problem: "Noplūde", urgency: "ASAP", description: "Water leaking from a pipe under the kitchen sink." },
    },
    ru: {
      lines: [
        ["agent", "Здравствуйте! Это Улдис, «Сантехник Рига». Что случилось?"],
        ["user", "Здравствуйте, на кухне под раковиной течёт вода из трубы."],
        ["agent", "Понятно, протечка под раковиной. Если течёт сильно, перекройте кран под раковиной или общий вентиль квартиры. В каком вы районе?"],
        ["user", "Пурвциемс, улица Дзелзавас 51, квартира 12."],
        ["agent", "Спасибо. Насколько срочно нужен мастер - как можно скорее или сегодня позже?"],
        ["user", "Как можно скорее."],
        ["agent", "Как вас зовут и по какому номеру мастер может позвонить?"],
        ["user", "Иван, 20 000 000."],
        ["agent", "Проверяю: Иван, номер два ноль, ноль ноль ноль, ноль ноль ноль. Верно?"],
        ["user", "Да."],
        ["tool"],
        ["agent", "Заявка отправлена. Мастер свяжется с вами в течение 5 минут. До свидания!"],
      ],
      lead: { name: "Иван", phone: "20000000", district: "Purvciems", address: "Dzelzavas iela 51, кв. 12", problem: "Noplūde", urgency: "ASAP", description: "На кухне под раковиной течёт вода из трубы." },
    },
  }[LANG];

  // Display labels for the form's option values (the agent sends these values, same as the form).
  const LABELS = {
    problem: { "Avārija": "🚨 Avārija", "Noplūde": "💧 Noplūde", "Aizsērējums": "🚿 Aizsērējums", "Jaucējkrāns": "🚰 Jaucējkrāns", "Boileris": "♨️ Boileris", "Apkure": "🔥 Apkure", "Vannas istaba": "🛁 Vannas istaba", "Cits": "📋 Cits" },
    urgency: { ASAP: { lv: "Pēc iespējas ātrāk", en: "As soon as possible", ru: "Как можно скорее" }, "Šodien": { lv: "Šodien", en: "Today", ru: "Сегодня" }, "Šonedēļ": { lv: "Šonedēļ", en: "This week", ru: "На этой неделе" }, Ieplānot: { lv: "Ieplānot vēlāk", en: "Plan later", ru: "Запланировать" } },
  };

  const PUSH = { lv: { msg: "Uldis šobrīd nav pieejams. Aizpildiet formu, un sazināmies 5 minūšu laikā.", btn: "Aizpildīt formu" },
    en: { msg: "Uldis is not available right now. Fill in the form and we will contact you within 5 minutes.", btn: "Fill in the form" },
    ru: { msg: "Улдис сейчас недоступен. Заполните форму, и мы свяжемся с Вами в течение 5 минут.", btn: "Заполнить форму" } }[LANG];
  const UA = navigator.userAgent;
  const IOS = /iPhone|iPad|iPod/.test(UA);
  const INAPP = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|; wv\)/.test(UA);
  const MIC = {
    lv: { ask: "Atļaujiet mikrofonu, lai runātu", inapp: "Šajā lietotnē zvans nedarbojas. Atveriet lapu Chrome vai Safari pārlūkā.",
      denied: "Mikrofons ir bloķēts.", nomic: "Šai ierīcei nav mikrofona.", busy: "Mikrofonu izmanto cita lietotne, piemēram, tālruņa saruna. Aizveriet to un zvaniet vēlreiz.",
      android: "Pieskarieties ikonai pa kreisi no adreses, izvēlieties Atļaujas, Mikrofons, Atļaut. Tad zvaniet vēlreiz.", ios: "Pieskarieties aA adreses joslā, izvēlieties Vietnes iestatījumi, Mikrofons, Atļaut. Tad zvaniet vēlreiz." },
    en: { ask: "Allow the microphone to talk", inapp: "Calls do not work inside this app. Open the page in Chrome or Safari.",
      denied: "The microphone is blocked.", nomic: "This device has no microphone.", busy: "Another app is using the microphone, for example a phone call. Close it and call again.",
      android: "Tap the icon left of the address, choose Permissions, Microphone, Allow. Then call again.", ios: "Tap aA in the address bar, choose Website Settings, Microphone, Allow. Then call again." },
    ru: { ask: "Разрешите микрофон, чтобы говорить", inapp: "В этом приложении звонок не работает. Откройте страницу в Chrome или Safari.",
      denied: "Микрофон заблокирован.", nomic: "На этом устройстве нет микрофона.", busy: "Микрофон занят другим приложением, например звонком. Закройте его и позвоните снова.",
      android: "Нажмите значок слева от адреса, выберите Разрешения, Микрофон, Разрешить. Затем позвоните снова.", ios: "Нажмите aA в адресной строке, выберите Настройки веб-сайта, Микрофон, Разрешить. Затем позвоните снова." },
  }[LANG];
  const SPK = { lv: { speaker: "Skaļrunis", ear: "Pie auss", other: "Audio" }, en: { speaker: "Speaker", ear: "Handset", other: "Audio" }, ru: { speaker: "Динамик", ear: "У уха", other: "Звук" } }[LANG];
  const ICON = {
    phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
    end: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.5 11.5 0 0 0-2.66 1.85 1 1 0 0 1-1.4 0L.29 13.08a1 1 0 0 1 0-1.41A16.9 16.9 0 0 1 12 7c4.55 0 8.68 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.4 0 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z"/></svg>',
    mic: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const formAnchor = () => (document.querySelector("#pieteikties, #forma, #book, #contactForm") ? "#" + (document.querySelector("#pieteikties, #forma, #book")?.id || "contactForm") : "#");

  // ---------- 1. buttons on the page ----------
  function callButton(cls, label, sub) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "zv-btn " + cls;
    b.setAttribute("data-zv-call", "");
    b.innerHTML = '<span class="zv-btn__ring">' + ICON.phone + "</span>" +
      (label ? '<span class="zv-btn__txt">' + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span>" : "");
    if (!label) b.setAttribute("aria-label", T.callLong);
    return b;
  }

  function mountButtons() {
    const header = document.getElementById("header") || document.querySelector("header");
    if (header) {
      const navCta = header.querySelector("nav a.btn-cta");
      if (navCta) navCta.insertAdjacentElement("beforebegin", callButton("zv-btn--header", T.call, T.callSub));
      const burger = header.querySelector("#mobile-menu-btn");
      if (burger) {
        const icon = callButton("zv-btn--icon", "", "");
        const wrap = document.createElement("div");
        wrap.className = "flex items-center md:hidden";
        burger.insertAdjacentElement("beforebegin", wrap);
        wrap.append(icon, burger);
      }
    }
    const form = document.getElementById("contactForm");
    if (form) {
      const box = document.createElement("div");
      box.className = "zv-formcall";
      box.appendChild(callButton("", T.callLong, ""));
      const p = document.createElement("p");
      p.textContent = T.formHint;
      box.appendChild(p);
      const or = document.createElement("div");
      or.className = "zv-or";
      or.textContent = T.or;
      form.insertAdjacentElement("beforebegin", box);
      form.insertAdjacentElement("beforebegin", or);
    }
    const bar = document.createElement("div");
    bar.className = "zv-sticky";
    bar.appendChild(callButton("", T.call, ""));
    const f = document.createElement("a");
    f.className = "zv-form"; f.href = formAnchor(); f.textContent = T.form;
    bar.appendChild(f);
    document.body.appendChild(bar);
    document.body.classList.add("zv-has-sticky");
    const target = document.querySelector("#pieteikties, #forma, #book");
    if (target && "IntersectionObserver" in window) new IntersectionObserver((e) => bar.classList.toggle("zv-formseen", e[0].isIntersecting), { threshold: 0.3 }).observe(target);

    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-zv-call]");
      if (b) { e.preventDefault(); call.open(); }
    });
  }

  // ---------- 2. call screen ----------
  const call = {
    el: null, conv: null, timer: null, started: 0, muted: false, leadSent: false, demoRun: 0, raf: 0,
    outcome: "", endSent: true, convId: "", callStart: 0, status: "",

    build() {
      const o = document.createElement("div");
      o.className = "zv-overlay";
      o.setAttribute("role", "dialog");
      o.setAttribute("aria-modal", "true");
      o.setAttribute("aria-label", CFG.brand + " - " + T.ai);
      o.innerHTML =
        '<div class="zv-phone">' +
          '<div class="zv-top"><span class="zv-ai-badge"><i></i>' + esc(T.ai) + "</span>" +
            '<button class="zv-x" type="button" data-zv-close aria-label="' + esc(T.close) + '">' + ICON.close + "</button></div>" +
          (CFG.agentId ? "" : '<span class="zv-demo-tag">' + esc(T.demo) + "</span>") +
          '<div class="zv-who">' +
            '<div class="zv-avatar"><div class="zv-orb"></div><img src="' + esc(CFG.logo) + '" alt=""></div>' +
            '<div class="zv-name">' + esc(CFG.brand) + "</div>" +
            '<div class="zv-status" aria-live="polite"></div>' +
            '<p class="zv-hint">' + esc(T.hint) + "</p>" +
          "</div>" +
          '<div class="zv-captions" aria-live="polite"></div>' +
          '<div class="zv-summary"></div>' +
          '<div class="zv-outdbg" hidden style="font-size:11px;opacity:.6;text-align:center;padding:0 12px"></div>' +
          '<button class="zv-pushform" type="button" data-zv-form hidden>' + esc(PUSH.btn) + "</button>" +
          '<div class="zv-controls">' +
            '<button class="zv-ctl" type="button" data-zv-mute aria-pressed="false"><span>' + ICON.mic + "</span><span>" + esc(T.mute) + "</span></button>" +
            '<button class="zv-ctl" type="button" data-zv-out hidden><span>' + ICON.phone + "</span><span>" + esc(SPK.other) + "</span></button>" +
            '<button class="zv-ctl zv-ctl--end" type="button" data-zv-end><span>' + ICON.end + "</span><span>" + esc(T.end) + "</span></button>" +
            '<button class="zv-ctl zv-ctl--go" type="button" data-zv-again hidden><span>' + ICON.phone + "</span><span>" + esc(T.again) + "</span></button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(o);
      o.addEventListener("click", (e) => {
        if (e.target === o || e.target.closest("[data-zv-close]")) this.close();
        else if (e.target.closest("[data-zv-form]")) this.goForm();
        else if (e.target.closest("[data-zv-end]")) this.hangup();
        else if (e.target.closest("[data-zv-again]")) this.start();
        else if (e.target.closest("[data-zv-mute]")) this.toggleMute();
        else if (e.target.closest("[data-zv-out]")) this.nextOutput();
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && o.classList.contains("is-open")) this.close(); });
      this.el = o;
      this.q = (s) => o.querySelector(s);
    },

    open() {
      if (!this.el) this.build();
      this.el.classList.add("is-open");
      document.documentElement.style.overflow = "hidden";
      this.start();
      this.q("[data-zv-end]").focus();
    },

    close() {
      this.hangup();
      this.el.classList.remove("is-open");
      document.documentElement.style.overflow = "";
    },

    reset() {
      this.leadSent = false;
      this.outcome = ""; this.endSent = !CFG.agentId; this.convId = ""; this.callStart = Date.now(); this.status = workStatus();
      this.q(".zv-captions").innerHTML = "";
      const s = this.q(".zv-summary"); s.innerHTML = ""; s.classList.remove("is-on");
      this.q(".zv-hint").hidden = false;
      this.q("[data-zv-end]").hidden = false;
      this.q("[data-zv-mute]").hidden = false;
      this.q("[data-zv-again]").hidden = true;
      this.q("[data-zv-form]").hidden = true;
      clearTimeout(this.pushTimer);
      this.setMuted(false);
    },

    // The call failed: say so, then take the person to the form instead of leaving them on a dead screen.
    pushForm(msg, auto) {
      this.stopRing();
      this.conv = null;
      clearTimeout(this.guard);
      if (!this.outcome) this.outcome = "Neizdevās savienoties";
      this.sendCallEnd();
      clearInterval(this.timer);
      cancelAnimationFrame(this.raf);
      this.started = 0;
      this.speaker("");
      this.state("ended", msg);
      this.q(".zv-hint").hidden = true;
      this.q("[data-zv-end]").hidden = true;
      this.q("[data-zv-mute]").hidden = true;
      this.q("[data-zv-out]").hidden = true;
      this.q("[data-zv-again]").hidden = false;
      this.q("[data-zv-form]").hidden = false;
      clearTimeout(this.pushTimer);
      if (auto) this.pushTimer = setTimeout(() => this.goForm(), 5000);
    },
    goForm() {
      clearTimeout(this.pushTimer);
      this.close();
      const form = document.getElementById("contactForm");
      const box = (form && (form.closest(".form-card") || form)) || document.querySelector("#pieteikties, #forma, #book");
      if (!box) return;
      box.scrollIntoView({ behavior: "smooth", block: "start" });
      box.classList.add("zv-formflash");
      setTimeout(() => box.classList.remove("zv-formflash"), 3500);
      const first = form && form.querySelector("input:not([type=hidden])");
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 700);
    },

    state(st, text) {
      this.el.dataset.state = st;
      if (text !== undefined) this.q(".zv-status").textContent = text;
    },

    speaker(who) {
      this.el.dataset.speaker = who || "";
      if (this.started && this.el.dataset.state === "live") this.tick();
    },

    tick() {
      const s = Math.floor((Date.now() - this.started) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
      const who = this.el.dataset.speaker === "agent" ? T.speaking : T.listening;
      this.q(".zv-status").textContent = mm + ":" + ss + " · " + who;
    },

    goLive() {
      this.started = Date.now();
      this.state("live");
      this.tick();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 1000);
    },

    caption(role, text, typing) {
      const box = this.q(".zv-captions");
      const d = document.createElement("div");
      d.className = "zv-cap zv-cap--" + (role === "user" ? "user" : "agent") + (typing ? " zv-cap--typing" : "");
      d.textContent = text;
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
      return d;
    },

    setMuted(m) {
      this.muted = m;
      const b = this.q("[data-zv-mute]");
      b.setAttribute("aria-pressed", String(m));
      b.lastElementChild.textContent = m ? T.unmute : T.mute;
      if (this.conv && this.conv.setMicMuted) this.conv.setMicMuted(m);
    },
    toggleMute() { this.setMuted(!this.muted); },

    // Ringback tone as on a real call: 425 Hz, 1 s on, 2.5 s off, two rings.
    ring() {
      return new Promise((done) => {
        const ctx = this.ringCtx;
        if (!ctx) return done();
        this.ringDone = done;
        Promise.resolve(ctx.resume && ctx.resume()).catch(() => {}).then(() => {
          const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + 0.05;
          o.frequency.value = 425; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0, 0);
          for (const [a, b] of [[0, 1], [3.5, 4.5]]) { g.gain.setValueAtTime(0.14, t + a); g.gain.setValueAtTime(0, t + b); }
          o.start(t); o.stop(t + 5);
        });
        this.ringTimer = setTimeout(() => this.stopRing(), 5000);
      });
    },
    stopRing() {
      clearTimeout(this.ringTimer);
      if (this.ringCtx) { try { this.ringCtx.close(); } catch (e) {} this.ringCtx = null; }
      if (this.ringDone) { const d = this.ringDone; this.ringDone = null; d(); }
    },

    async setupOutputs() {
      if (this.el.dataset.state !== "live") return;
      try {
        const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
        const seen = new Set();
        this.outputs = all.filter((d) => { const k = d.groupId || d.deviceId; if (seen.has(k)) return false; seen.add(k); return true; });
        const dbg = this.q(".zv-outdbg");
        if (dbg) { dbg.hidden = false; dbg.textContent = "Audio: " + all.length + " [" + all.map((d) => d.label || "?").join(", ") + "]"; }
        this.outIdx = 0;
        if (this.outputs.length > 1) { this.q("[data-zv-out]").hidden = false; this.labelOutput(); }
      } catch (e) { console.warn("[AI zvans] outputs", e); }
    },
    labelOutput() {
      const l = (this.outputs[this.outIdx] && this.outputs[this.outIdx].label) || "";
      const name = /speaker|ska[lļ]r|динам/i.test(l) ? SPK.speaker : /earpiece|receiver|handset/i.test(l) ? SPK.ear : (l.slice(0, 14) || SPK.other);
      this.q("[data-zv-out]").lastElementChild.textContent = name;
    },
    async nextOutput() {
      if (!this.outputs || this.outputs.length < 2 || !this.conv) return;
      this.outIdx = (this.outIdx + 1) % this.outputs.length;
      try { await this.conv.changeOutputDevice({ outputDeviceId: this.outputs[this.outIdx].deviceId }); } catch (e) { console.warn("[AI zvans] output", e); }
      this.labelOutput();
    },

    async start() {
      this.reset();
      const run = (this.run = (this.run || 0) + 1);
      this.state("ringing", T.calling);
      if (!CFG.agentId) return this.runDemo();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ringCtx = Ctx ? new Ctx() : null;      // created inside the tap, or phones keep it silent
      // A page cannot force the browser's prompt; it can only ask, then explain what to do if the answer is no.
      this.state("ringing", MIC.ask);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw { name: "Unsupported" };
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        this.stopRing();
        const n = (e && e.name) || "";
        const msg = INAPP || n === "Unsupported" ? MIC.inapp : n === "NotFoundError" ? MIC.nomic : n === "NotReadableError" || n === "AbortError" ? MIC.busy : MIC.denied + " " + (IOS ? MIC.ios : MIC.android);
        this.fail(msg);
        this.q("[data-zv-form]").hidden = false;
        return;
      }
      if (run !== this.run) return;
      this.state("ringing", T.calling);
      try {
        const sdk = import(CFG.sdk);
        await this.ring();
        if (run !== this.run) return;
        const { Conversation } = await sdk;
        this.userEnded = false; this.agentEnded = false; this.lastAgent = "";
        this.guard = setTimeout(() => { if (run === this.run) { this.run++; this.pushForm(PUSH.msg, true); } }, 12000);
        const conv = await Conversation.startSession({
          agentId: CFG.agentId,
          connectionType: "webrtc",
          overrides: { agent: { language: LANG, firstMessage: greeting() } },
          dynamicVariables: { site: CFG.site, page_url: location.href, page_language: LANG, work_status: workStatus() },
          clientTools: { submit_lead: (p) => this.submitLead(p), set_outcome: (p) => { this.outcome = String((p && p.outcome) || ""); return "ok"; } },
          onConnect: (info) => { clearTimeout(this.guard); this.convId = (info && info.conversationId) || ""; this.goLive(); this.meter(); setTimeout(() => this.setupOutputs(), 900); },
          onAgentToolResponse: (r) => { const t = (r && (r.agent_tool_response || r)) || {}; if (t.tool_name === "submit_lead" && !t.is_error) this.leadSent = true; if (t.tool_name === "end_call") this.agentEnded = true; },
          onDisconnect: (d) => {
            clearTimeout(this.guard);
            const closing = /nosūtīts|visu labu|sent|goodbye|all the best|отправлен|всего доброго|до свидания/i.test(this.lastAgent || "");
            const lost = !this.userEnded && (d && d.reason) !== "user" && !this.leadSent && !this.outcome && !this.agentEnded && !closing;
            if (lost) { this.outcome = "Zvans pārtrūka"; this.pushForm(PUSH.msg, true); } else if (this.el.dataset.state !== "ended") this.ended();
          },
          onModeChange: (m) => this.speaker((m && m.mode) === "speaking" ? "agent" : "user"),
          onMessage: (m) => {
            // strip v3 voice tags like "[happy]" and long dashes from the on-screen captions
            const text = String(m.message || m.text || "").replace(/\[[a-z ]{2,24}\]\s*/gi, "").replace(/\s*[—–]\s*/g, " - ").trim();
            if (!text || text === "...") return;
            const role = m.role || (m.source === "ai" ? "agent" : "user");
            if (role === "agent") this.lastAgent = text;
            this.caption(role === "agent" ? "agent" : "user", text);
          },
          onError: (err) => console.warn("[AI zvans]", err),
        });
        if (run !== this.run) { try { conv.endSession(); } catch (e) {} return; }
        this.conv = conv;
      } catch (e) {
        console.warn("[AI zvans]", e);
        if (run === this.run) this.pushForm(PUSH.msg, true);
      }
    },

    meter() {
      cancelAnimationFrame(this.raf);
      const orb = this.q(".zv-orb");
      const loop = () => {
        if (!this.conv) return;
        const v = this.el.dataset.speaker === "agent" ? this.conv.getOutputVolume() : this.conv.getInputVolume();
        orb.style.setProperty("--zv-level", (1 + Math.min(v, 1) * 0.35).toFixed(3));
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    },

    async hangup() {
      this.demoRun++;
      this.userEnded = true;
      clearTimeout(this.guard);
      this.run = (this.run || 0) + 1;
      this.stopRing();
      cancelAnimationFrame(this.raf);
      if (this.conv) { const c = this.conv; this.conv = null; try { await c.endSession(); } catch (e) {} }
      if (this.el && this.el.dataset.state !== "ended") this.ended();
    },

    ended() {
      this.sendCallEnd();
      this.conv = null;
      clearInterval(this.timer);
      cancelAnimationFrame(this.raf);
      this.speaker("");
      this.q(".zv-orb").style.setProperty("--zv-level", "1");
      const s = this.started ? Math.floor((Date.now() - this.started) / 1000) : 0;
      this.started = 0;
      this.state("ended", T.ended + (s ? " · " + String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0") : ""));
      this.q("[data-zv-end]").hidden = true;
      this.q("[data-zv-mute]").hidden = true;
      this.q("[data-zv-again]").hidden = false;
    },

    fail(msg) {
      if (!this.outcome) this.outcome = "Nav mikrofona atļaujas";
      this.sendCallEnd();
      clearInterval(this.timer);
      this.state("ended", msg);
      this.q(".zv-hint").hidden = true;
      this.q("[data-zv-end]").hidden = true;
      this.q("[data-zv-mute]").hidden = true;
      this.q("[data-zv-again]").hidden = false;
    },

    // One statistics row per call (sheet "AI zvani - statistika"); never goes to Telegram or WhatsApp.
    sendCallEnd() {
      if (this.endSent || !CFG.webhook) return;
      this.endSent = true;
      const now = new Date();
      const f = (o) => new Intl.DateTimeFormat("lv-LV", Object.assign({ timeZone: "Europe/Riga" }, o)).format(now);
      const day = f({ weekday: "long" });
      const ev = {
        event: "call_end",
        source: CFG.site,
        date: f({ day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\.$/, ""),
        time: f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
        weekday: day.charAt(0).toUpperCase() + day.slice(1),
        work_status: this.status || workStatus(),
        outcome: this.leadSent ? "Pieteikums" : (this.outcome || "Pārtrauca zvanu"),
        language: LANG,
        duration_s: Math.round((Date.now() - (this.callStart || Date.now())) / 1000),
        conversation_id: this.convId || (this.conv && this.conv.getId && this.conv.getId()) || "",
        page_url: location.href,
      };
      try { fetch(CFG.webhook, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(ev) }); } catch (e) {}
    },

    // The agent calls this when it has collected everything. Same payload as the form + channel fields.
    async submitLead(p) {
      if (this.leadSent) return "already_sent";
      const lead = {
        source: CFG.site,
        name: (p.name || "").trim(),
        phone: (p.phone || "").replace(/[^\d+]/g, ""),
        district: p.district || "",
        address: p.address || "",
        problem: p.problem || "Cits",
        urgency: p.urgency || "ASAP",
        description: p.description || "",
        language: LANG,
        channel: "ai_call",
        conversation_id: (this.conv && this.conv.getId && this.conv.getId()) || this.convId || "",
        timestamp: new Date().toISOString(),
        page_url: location.href,
      };
      let ok = false;
      try {
        if (CFG.webhook) {
          const r = await fetch(CFG.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
          ok = r.ok;
        }
      } catch (e) { console.warn("[AI zvans] webhook", e); }
      if (!ok) return "error: not sent, ask the caller to fill in the form on the page";
      this.leadSent = true;
      this.showSummary(lead);
      if (typeof umami !== "undefined") umami.track("ai_call_lead", { source: CFG.site });
      return "sent";
    },

    showSummary(lead) {
      const s = this.q(".zv-summary");
      const urg = LABELS.urgency[lead.urgency];
      const rows = [
        ["name", lead.name], ["phone", lead.phone], ["district", lead.district], ["address", lead.address],
        ["problem", LABELS.problem[lead.problem] || lead.problem], ["urgency", urg ? urg[LANG] : lead.urgency],
      ].filter((r) => r[1]);
      s.innerHTML = "<h3>" + ICON.check + esc(T.sent) + "</h3><dl>" +
        rows.map((r) => "<dt>" + esc(T.f[r[0]]) + "</dt><dd>" + esc(r[1]) + "</dd>").join("") +
        '</dl><p class="zv-promise">📞 ' + esc(promiseText()) + "</p>";
      s.classList.add("is-on");
      this.q(".zv-hint").hidden = true;
    },

    // DEMO: plays the sample call so the look and flow can be judged without an agent or microphone.
    async runDemo() {
      const run = ++this.demoRun;
      const alive = () => run === this.demoRun;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(2200); if (!alive()) return;
      this.goLive();
      const orb = this.q(".zv-orb");
      for (const [who, text] of DEMO.lines) {
        if (!alive()) return;
        if (who === "tool") {
          const tmp = this.caption("agent", "…", true);
          await this.submitLeadDemo(DEMO.lead);
          tmp.remove();
          continue;
        }
        this.speaker(who === "agent" ? "agent" : "user");
        const cap = this.caption(who, "", true);
        const words = text.split(" ");
        for (let i = 0; i < words.length; i++) {
          if (!alive()) return;
          cap.textContent = words.slice(0, i + 1).join(" ");
          this.q(".zv-captions").scrollTop = 1e6;
          orb.style.setProperty("--zv-level", who === "agent" ? (1.05 + Math.random() * 0.25).toFixed(3) : "1");
          await wait(who === "agent" ? 170 : 210);
        }
        cap.classList.remove("zv-cap--typing");
        orb.style.setProperty("--zv-level", "1");
        this.speaker("user");
        await wait(700);
      }
      if (!alive()) return;
      await wait(1200);
      if (alive()) this.ended();
    },

    async submitLeadDemo(l) {
      const res = await this.submitLead(l);
      if (res !== "sent") this.showSummary(Object.assign({ source: CFG.site }, l)); // show the look even if no local server
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountButtons);
  else mountButtons();
})();

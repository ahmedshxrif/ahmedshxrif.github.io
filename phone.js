// The phone in the projects section. Each app is a small working copy of a real project,
// running on made-up data. Nothing here talks to a server.
(() => {
  const screen = document.getElementById("screen");
  if (!screen) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids.filter((k) => k != null));
    return node;
  };
  const shuffle = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = (markup, attrs = {}) => {
    const node = document.createElementNS(svgNS, "svg");
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    node.innerHTML = markup;
    return node;
  };

  const appview = $("#appview");
  const brief = $("#brief");
  const briefEmpty = $("#brief-empty");
  const sheetHome = $("#sheets");
  let life = null;

  // Each open app gets a "life": timers and listeners that are all cleared when it closes.
  function newLife() {
    const timers = new Set();
    const undo = [];
    return {
      alive: true,
      later(fn, ms) { const id = setTimeout(() => { timers.delete(id); if (this.alive) fn(); }, ms); timers.add(id); return id; },
      cancel(id) { clearTimeout(id); timers.delete(id); },
      on(target, type, fn, opts) { target.addEventListener(type, fn, opts); undo.push(() => target.removeEventListener(type, fn, opts)); },
      end() { this.alive = false; timers.forEach(clearTimeout); undo.forEach((u) => u()); },
    };
  }

  // The four-part score ring used by the coaching apps.
  function makeLens(cls = "lens-sm") {
    const R = 54, C = 2 * Math.PI * R, seg = C / 4 - 12;
    const node = svg("", { viewBox: "0 0 140 140", class: cls, role: "img" });
    const arcs = [0, 1, 2, 3].map((k) => {
      const make = (c, len) => {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", 70); circle.setAttribute("cy", 70); circle.setAttribute("r", R);
        circle.setAttribute("class", c);
        circle.setAttribute("stroke-dasharray", `${len} ${C}`);
        circle.setAttribute("transform", `rotate(${-90 + k * 90 + 6} 70 70)`);
        node.append(circle);
        return circle;
      };
      make("lens-track", seg);
      return make("lens-value", 0);
    });
    const total = document.createElementNS(svgNS, "text");
    total.setAttribute("x", 70); total.setAttribute("y", 70);
    node.append(total);
    return {
      node,
      set(scores) { // scores out of 10, or undefined for "not yet"
        arcs.forEach((arc, k) => {
          const s = scores[k];
          arc.setAttribute("stroke-dasharray", `${s == null ? 0 : (seg * s) / 10} ${C}`);
          arc.style.opacity = s == null ? 0 : 1;
        });
        const done = scores.filter((s) => s != null);
        const index = done.length ? Math.round((done.reduce((a, b) => a + b, 0) / done.length) * 10) : null;
        total.textContent = index == null ? "?" : String(index);
        node.setAttribute("aria-label", index == null ? "No score yet" : `Score ${index} out of 100`);
        return index;
      },
    };
  }

  const segmented = (names, onPick) => {
    const bar = el("div", { className: "seg" });
    const buttons = names.map((name, i) => {
      const b = el("button", { type: "button", textContent: name });
      b.setAttribute("aria-pressed", String(i === 0));
      b.addEventListener("click", () => { buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); onPick(i); });
      bar.append(b);
      return b;
    });
    return bar;
  };

  // ── Coach: record and score a conversation, or practise one ──────────────
  const STAGES = ["Opening", "Needs", "Presentation", "Closing"];
  const SALE = [
    { line: "A customer walks up to the fridges and starts opening doors.", options: [
      ["Hi! That one's our best seller this month. Is it for you or the family?", 10, "Warm, specific, and it ends in an easy question."],
      ["Can I help you?", 3, "It's easy to answer 'No thanks' to that."],
      ["Say nothing and wait for them to ask.", 4, "Polite, but the conversation never starts."],
    ] },
    { line: "\"Just looking for a fridge, really.\"", options: [
      ["How many are you at home, and how often do you do a big shop?", 10, "Now you know what size they need."],
      ["This one is 650 litres with twin cooling.", 4, "A pitch before you know what they need."],
      ["We have a great offer today.", 2, "An offer on what? You don't know what fits them yet."],
    ] },
    { line: "\"We're five, and we do one big shop a week.\"", options: [
      ["Then space matters: this one takes a full weekly shop for five.", 10, "You tied the feature to their life."],
      ["It has an inverter compressor.", 5, "True, but a spec isn't a reason to buy."],
      ["Honestly, all of them are good.", 2, "Nothing here helps them choose."],
    ] },
    { line: "\"The one next door is cheaper.\"", options: [
      ["It is today, but this one uses less power every month. Shall I check a delivery slot?", 10, "You handled the objection and asked for the sale."],
      ["It's better quality.", 4, "A claim with nothing behind it, and no ask."],
      ["I can't beat that.", 1, "You just closed the sale for the other store."],
    ] },
  ];
  const TIPS = [
    "Open with something specific about what they're looking at.",
    "Ask about their home before you talk about the product.",
    "Turn each feature into something it does for them.",
    "Answer the objection, then ask for the next step.",
  ];

  function coach(body, life) {
    const view = el("div");
    body.append(segmented(["Record", "Practise"], (i) => (i === 0 ? record() : practise())), view);

    function record() {
      const mic = el("button", { type: "button", className: "mic" });
      mic.setAttribute("aria-label", "Start recording");
      mic.append(svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', { viewBox: "0 0 24 24" }));
      const wave = el("div", { className: "wave" });
      for (let k = 0; k < 18; k++) { const bar = el("i"); bar.style.setProperty("--k", k); wave.append(bar); }
      const status = el("p", { className: "big center", textContent: "Tap to record" });
      const hint = el("p", { className: "hint center", textContent: "A made-up conversation plays. Nothing is really recorded." });
      const result = el("div");
      view.replaceChildren(el("div", { className: "card" }, mic, wave, status, hint), result);

      let began = 0, tick = 0, stopAt = 0;
      const stop = () => {
        life.cancel(tick); life.cancel(stopAt);
        mic.classList.remove("live"); wave.classList.remove("live"); mic.disabled = true;
        status.textContent = "Scoring";
        const steps = ["Transcribing who said what", "Removing names and numbers", "Scoring the four stages"].map((t) => el("li", { textContent: t }));
        result.replaceChildren(el("div", { className: "card" }, el("ol", { className: "steps" }, ...steps)));
        steps.forEach((step, i) => life.later(() => step.classList.add("done"), 600 * (i + 1)));
        life.later(show, 600 * steps.length + 500);
      };
      const show = () => {
        status.textContent = "Tap to record"; mic.disabled = false;
        const scores = [7.8, 7.0, 6.6, 8.5];
        const lens = makeLens();
        const rows = scores.map((s, i) => {
          const meter = el("div", { className: "meter" }, el("i"));
          life.later(() => $("i", meter).style.setProperty("--v", `${s * 10}%`), 80);
          return el("div", { className: "stage" }, el("span", { textContent: STAGES[i] }), meter, el("b", { textContent: Math.round(s * 10) }));
        });
        const facts = el("dl", { className: "rows" },
          el("div", {}, el("dt", { textContent: "Outcome" }), el("dd", { textContent: "Will come back" })),
          el("div", {}, el("dt", { textContent: "Lost because" }), el("dd", { textContent: "Comparing with a competitor" })),
          el("div", {}, el("dt", { textContent: "Personal data" }), el("dd", { textContent: "1 name removed" })));
        result.replaceChildren(
          el("div", { className: "card" }, lens.node, ...rows),
          el("div", { className: "card" }, el("h5", { textContent: "Coaching" }), el("p", { textContent: "You pitched before asking what they needed. Next time, ask about their home first." }), facts));
        lens.set([]);
        life.later(() => lens.set(scores), 120);
      };
      mic.addEventListener("click", () => {
        if (mic.classList.contains("live")) return stop();
        result.replaceChildren();
        mic.classList.add("live"); wave.classList.add("live");
        began = Date.now();
        const count = () => {
          const s = Math.floor((Date.now() - began) / 1000);
          status.textContent = `0:${String(s).padStart(2, "0")}`;
          tick = life.later(count, 200);
        };
        count();
        stopAt = life.later(stop, 3800);
      });
    }

    function practise() {
      const lens = makeLens();
      const step = el("p", { className: "hint" });
      const line = el("p", { className: "bubble" });
      const opts = el("div", { className: "opts" });
      const note = el("p", { className: "note" });
      note.setAttribute("aria-live", "polite");
      const next = el("div");
      view.replaceChildren(el("div", { className: "card" }, lens.node, step, line, opts, note, next));
      let round = 0, scores = [];
      const ask = () => {
        step.textContent = `Round ${round + 1} of 4: ${STAGES[round].toLowerCase()}`;
        line.textContent = SALE[round].line;
        note.textContent = ""; next.replaceChildren();
        opts.replaceChildren(...shuffle(SALE[round].options).map(([text, points, why]) => {
          const b = el("button", { type: "button", textContent: text });
          b.addEventListener("click", () => {
            $$("button", opts).forEach((x) => { x.disabled = true; });
            b.classList.add("picked");
            scores[round] = points; lens.set(scores);
            note.textContent = `${points} out of 10. ${why}`;
            const last = round === 3;
            const go = el("button", { type: "button", className: "btn", textContent: last ? "See the result" : "Next" });
            go.addEventListener("click", () => { round += 1; last ? finish() : ask(); });
            next.replaceChildren(go);
          });
          return b;
        }));
      };
      const finish = () => {
        const index = lens.set(scores);
        step.textContent = `Your score: ${index} out of 100`;
        line.textContent = index >= 80 ? "Sale made." : index >= 55 ? "They said they'll come back." : "They walked next door.";
        opts.replaceChildren();
        note.textContent = index === 100 ? "A perfect conversation. Nothing to coach." : `Coaching: ${TIPS[scores.indexOf(Math.min(...scores))]}`;
        const again = el("button", { type: "button", className: "btn ghost", textContent: "Play again" });
        again.addEventListener("click", () => { round = 0; scores = []; lens.set(scores); ask(); });
        next.replaceChildren(again);
      };
      lens.set(scores);
      ask();
    }
    record();
  }

  // ── Ask: the shopping assistant, with its safety check on show ───────────
  const QUESTIONS = [
    { q: "We're a family of five", a: "For five, I'd look at the 650 litre French door. It takes a full weekly shop with room to spare.", check: "Facts match the spec sheet" },
    { q: "Will it fit in 90 cm?", a: "Not that one, it's 91.2 cm wide. The 580 litre model is 83.6 cm, so it fits with space to breathe.", check: "Fit worked out from the real dimensions" },
    { q: "How much is it?", a: "Prices differ by store, so the team at the counter will help with that.", check: "No price given", card: "Show this card at the counter: French door, 650 L" },
    { q: "Is it better than Brand X?", a: "I can't speak for other brands. What I can say is that this one keeps food fresh for longer and runs quietly.", check: "No competitor named" },
  ];
  const REPLIES = [
    ["This washer holds 11 kg, enough for a family of five.", false, "Fine: that's straight from the spec sheet."],
    ["It's 2,199 dirhams this week.", true, "Blocked: the assistant never quotes a price."],
    ["It's much better than the Frostline next to it.", true, "Blocked: it never names a competitor."],
    ["Yes, it fits. It's 60 cm wide and your gap is 65.", false, "Fine: worked out from the real dimensions."],
    ["It never breaks down.", true, "Blocked: nothing in the spec sheet backs that."],
    ["For the price, please ask the team at the counter.", false, "Fine: that's where price questions go."],
    ["It comes with a lifetime warranty.", true, "Blocked: the sheet says otherwise."],
    ["The quick wash takes 15 minutes.", false, "Fine: that's a listed feature."],
  ];

  function ask(body, life) {
    const view = el("div");
    body.append(segmented(["Chat", "Guardrail game"], (i) => (i === 0 ? chat() : guard())), view);

    function chat() {
      const bot = el("div", { className: "bot" }, el("div", { className: "bot-face" }, el("div", { className: "bot-eyes" }, el("i"), el("i")), el("div", { className: "bot-mouth" })));
      bot.setAttribute("aria-hidden", "true");
      const log = el("div", { className: "chat" });
      log.setAttribute("aria-live", "polite");
      const chips = el("div", { className: "chips" });
      const say = (text) => el("p", { className: "bubble", textContent: text });
      log.append(say("Hello. What are you shopping for today?"));
      view.replaceChildren(el("div", { className: "stagebox" }, bot), log, chips, el("p", { className: "hint", textContent: "Tap a question. Try asking for the price." }));
      QUESTIONS.forEach((item) => {
        const chip = el("button", { type: "button", textContent: item.q });
        chip.addEventListener("click", () => {
          $$("button", chips).forEach((c) => { c.disabled = true; });
          log.append(el("p", { className: "bubble me", textContent: item.q }));
          const reply = el("p", { className: "bubble" });
          const dots = el("span", { className: "dots" });
          for (let k = 0; k < 3; k++) { const d = el("i"); d.style.setProperty("--k", k); dots.append(d); }
          reply.append(dots);
          log.append(reply);
          body.scrollTop = body.scrollHeight;
          life.later(() => {
            const words = item.a.split(" ");
            reply.textContent = "";
            bot.classList.add("talking");
            const type = (i) => {
              reply.textContent = words.slice(0, i).join(" ");
              body.scrollTop = body.scrollHeight;
              if (i < words.length) return life.later(() => type(i + 1), calm ? 0 : 60);
              bot.classList.remove("talking");
              log.append(el("p", { className: "check", textContent: `Reply checked before speaking. ${item.check}.` }));
              if (item.card) log.append(el("p", { className: "counter-card", textContent: item.card }));
              $$("button", chips).forEach((c) => { c.disabled = c === chip || c.dataset.used === "1"; });
              chip.dataset.used = "1";
              body.scrollTop = body.scrollHeight;
            };
            type(1);
          }, calm ? 0 : 900);
        });
        chips.append(chip);
      });
    }

    function guard() {
      const SECONDS = 7;
      const step = el("p", { className: "hint", textContent: "Ready?" });
      const card = el("p", { className: "bubble me", textContent: "Eight replies are about to be spoken. Block any that give a price, name a competitor, or promise what the spec sheet doesn't." });
      const bar = el("i");
      const timer = el("div", { className: "timerbar" }, bar);
      const note = el("p", { className: "note" });
      note.setAttribute("aria-live", "polite");
      const actions = el("div", { className: "opts" });
      view.replaceChildren(el("div", { className: "card" }, step, card, timer, note, actions));
      if (calm) timer.hidden = true;
      let queue = [], at = 0, right = 0, clock = 0;
      const next = () => {
        life.cancel(clock);
        if (at >= queue.length) return finish();
        step.textContent = `Reply ${at + 1} of ${queue.length}`;
        card.textContent = queue[at][0];
        note.textContent = "";
        const speak = el("button", { type: "button", className: "btn ghost", textContent: "Let it speak" });
        const block = el("button", { type: "button", className: "btn", textContent: "Block it" });
        speak.addEventListener("click", () => answer(false));
        block.addEventListener("click", () => answer(true));
        actions.replaceChildren(block, speak);
        if (!calm) {
          bar.classList.remove("go");
          bar.style.setProperty("--secs", `${SECONDS}s`);
          void bar.offsetWidth;
          bar.classList.add("go");
          clock = life.later(() => answer(false, true), SECONDS * 1000);
        }
      };
      const answer = (blocked, late = false) => {
        life.cancel(clock);
        bar.classList.remove("go");
        const [, bad, why] = queue[at];
        const correct = blocked === bad;
        if (correct) right += 1;
        $$("button", actions).forEach((b) => { b.disabled = true; });
        note.textContent = `${late ? "Too slow, it was spoken. " : ""}${correct ? "Right. " : "Wrong call. "}${why}`;
        at += 1;
        clock = life.later(next, 2100);
      };
      const finish = () => {
        step.textContent = `You got ${right} of ${queue.length}`;
        card.textContent = "The real guardrail checks every single reply before the shopper hears a word, and it never gets tired.";
        note.textContent = "";
        const again = el("button", { type: "button", className: "btn ghost", textContent: "Play again" });
        again.addEventListener("click", begin);
        actions.replaceChildren(again);
      };
      const begin = () => { queue = shuffle(REPLIES); at = 0; right = 0; next(); };
      const go = el("button", { type: "button", className: "btn", textContent: "Start" });
      go.addEventListener("click", begin);
      actions.replaceChildren(go);
    }
    chat();
  }

  // ── Scan: read a real leaflet page ───────────────────────────────────────
  // The picture is a real row of offers from a UAE retailer's week-40 booklet, and these are the
  // hand-checked answers the pipeline is tested against.
  const OFFERS = [
    { brand: "Panasonic", type: "Side-by-side refrigerator", code: "NR-BS734MSAE", was: 2899, now: 2149 },
    { brand: "LG", type: "Side-by-side refrigerator", code: "GRFB587PQAM", was: 3299, now: 2799 },
    { brand: "Hitachi", type: "French-door refrigerator", code: "RWB720UK04GBK", was: 6299, now: 5299 },
  ];
  function scan(body, life) {
    const pad = el("div", { className: "scanpad real" });
    const img = el("img", { src: "assets/shots/leaflet-real.jpg", alt: "A real row of three refrigerator offers from a retailer's promo leaflet", draggable: false });
    const hits = OFFERS.map((_, i) => { const box = el("span", { className: "hit", textContent: `Offer ${i + 1}` }); box.style.left = `${i * 33.33 + 0.8}%`; return box; });
    pad.append(img, ...hits, el("span", { className: "beam" }));
    const count = el("p", { className: "hint" });
    const cards = OFFERS.map((o) => {
      const off = Math.round((1 - o.now / o.was) * 100);
      return el("div", { className: "card offer" },
        el("h5", { textContent: `${o.brand} ${o.code}` }),
        el("dl", { className: "rows" },
          el("div", {}, el("dt", { textContent: "Type" }), el("dd", { textContent: o.type })),
          el("div", {}, el("dt", { textContent: "Was" }), el("dd", { textContent: `AED ${o.was.toLocaleString("en-US")}` })),
          el("div", {}, el("dt", { textContent: "Now" }), el("dd", { textContent: `AED ${o.now.toLocaleString("en-US")}` })),
          el("div", {}, el("dt", { textContent: "Discount" }), el("dd", { textContent: `${off}%` }))));
    });
    const again = el("button", { type: "button", className: "btn", textContent: "Scan again" });
    body.append(pad, count, ...cards, again,
      el("p", { className: "hint", textContent: "A real page from a UAE retailer's leaflet, week 40. The pipeline reads hundreds of these every week." }));
    const setScan = (f) => {
      pad.style.setProperty("--x", `${f * 100}%`);
      let read = 0;
      OFFERS.forEach((_, i) => {
        const done = f >= (i + 0.86) / OFFERS.length;
        hits[i].classList.toggle("on", done);
        cards[i].classList.toggle("on", done);
        if (done) read += 1;
      });
      count.textContent = read === OFFERS.length ? "All 3 offers read, every field correct." : `${read} of ${OFFERS.length} offers read. Drag across the leaflet.`;
    };
    const drag = (e) => { const box = pad.getBoundingClientRect(); setScan(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))); };
    life.on(pad, "pointermove", drag);
    life.on(pad, "pointerdown", drag);
    again.addEventListener("click", () => setScan(0));
    setScan(calm ? 1 : 0);
  }

  // ── Dash: market share that redraws as you filter ────────────────────────
  const BRANDS = ["Our brand", "Brand A", "Brand B", "Brand C", "Others"];
  const SHARE = {
    "UAE|Fridges": [27, 22, 15, 12, 24], "UAE|Washers": [31, 19, 17, 9, 24],
    "Qatar|Fridges": [24, 26, 13, 14, 23], "Qatar|Washers": [29, 21, 14, 11, 25],
    "Kuwait|Fridges": [22, 20, 21, 10, 27], "Kuwait|Washers": [26, 24, 12, 13, 25],
  };
  function dash(body) {
    let market = "UAE", cat = "Fridges";
    const pick = (names, get, set) => {
      const row = el("div", { className: "chips" });
      names.forEach((n) => {
        const b = el("button", { type: "button", textContent: n });
        b.addEventListener("click", () => { set(n); draw(); });
        row.append(b);
      });
      row.sync = () => $$("button", row).forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === get())));
      return row;
    };
    const markets = pick(["UAE", "Qatar", "Kuwait"], () => market, (v) => { market = v; });
    const cats = pick(["Fridges", "Washers"], () => cat, (v) => { cat = v; });
    const kpi = el("p", { className: "big" });
    const kpiNote = el("span", { className: "hint" });
    const bars = el("div", { className: "bars" });
    const meters = BRANDS.map((name, i) => {
      const fill = el("i");
      const value = el("b");
      bars.append(el("div", { className: i === 0 ? "bar us" : "bar" }, el("span", { textContent: name }), el("div", { className: "meter" }, fill), value));
      return { fill, value };
    });
    body.append(el("div", { className: "card" }, el("h5", { textContent: "Market" }), markets), el("div", { className: "card" }, el("h5", { textContent: "Category" }), cats),
      el("div", { className: "card" }, el("h5", { textContent: "Value share this week" }), el("div", { className: "kpi" }, kpi, kpiNote), bars),
      el("p", { className: "hint", textContent: "Made-up numbers. The real file joins sell-out, price index, shelf share and promos." }));
    const draw = () => {
      markets.sync(); cats.sync();
      const data = SHARE[`${market}|${cat}`];
      const rank = [...data.slice(0, 4)].sort((a, b) => b - a).indexOf(data[0]) + 1;
      kpi.textContent = `${data[0]}%`;
      kpiNote.textContent = rank === 1 ? "Number 1 brand" : `Number ${rank} brand`;
      data.forEach((v, i) => { meters[i].fill.style.setProperty("--v", `${v * 3}%`); meters[i].value.textContent = `${v}%`; });
    };
    draw();
  }

  // ── Optimizer: where does a discount pay for itself? ─────────────────────
  function optimizer(body) {
    const PRODUCTS = [{ name: "Fridge (price-sensitive)", e: 9 }, { name: "Washer (steady seller)", e: 2 }];
    let product = PRODUCTS[0];
    const MARGIN = 0.3, MAX = 0.3;
    const profit = (d, e) => ((1 + e * d) * (MARGIN - d)) / MARGIN; // 1.0 means "same profit as no discount"
    const chips = el("div", { className: "chips" });
    const curve = svg("", { viewBox: "0 0 300 130", class: "curve", role: "img" });
    const slider = el("input", { type: "range", min: 0, max: 30, value: 10, className: "slider" });
    slider.setAttribute("aria-label", "Discount, percent");
    const rows = el("dl", { className: "rows" });
    const verdict = el("p", { className: "note" });
    body.append(el("div", { className: "card" }, el("h5", { textContent: "Product" }), chips),
      el("div", { className: "card" }, el("h5", { textContent: "Profit as the discount grows" }), curve, slider, rows, verdict),
      el("p", { className: "hint", textContent: "A toy version of the real model, which estimates elasticity from sales history." }));
    const draw = () => {
      $$("button", chips).forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === product.name)));
      const d = slider.value / 100;
      const best = Math.max(0, Math.min(MAX, (MARGIN * product.e - 1) / (2 * product.e)));
      const top = Math.max(1.05, profit(best, product.e) * 1.08);
      const x = (v) => 10 + (v / MAX) * 280;
      const y = (p) => 120 - (Math.max(0, p) / top) * 110;
      let path = "";
      for (let i = 0; i <= 30; i++) { const v = (i / 30) * MAX; path += `${i ? "L" : "M"}${x(v).toFixed(1)} ${y(profit(v, product.e)).toFixed(1)}`; }
      curve.innerHTML = `<path class="axis" d="M10 120H290"/><path class="best" d="M${x(best)} 8V120"/><path d="${path}"/><circle cx="${x(d)}" cy="${y(profit(d, product.e))}" r="7"/>`;
      const units = Math.round(product.e * d * 100);
      const change = Math.round((profit(d, product.e) - 1) * 100);
      rows.replaceChildren(
        el("div", {}, el("dt", { textContent: "Discount" }), el("dd", { textContent: `${slider.value}%` })),
        el("div", {}, el("dt", { textContent: "Units sold" }), el("dd", { textContent: `+${units}%` })),
        el("div", {}, el("dt", { textContent: "Profit" }), el("dd", { textContent: `${change >= 0 ? "+" : ""}${change}%` })));
      verdict.textContent = best < 0.005 ? "Verdict: don't discount this one. It sells anyway." : `Verdict: profit peaks at about ${Math.round(best * 100)}% off.`;
    };
    PRODUCTS.forEach((p) => {
      const b = el("button", { type: "button", textContent: p.name });
      b.addEventListener("click", () => { product = p; draw(); });
      chips.append(b);
    });
    slider.addEventListener("input", draw);
    draw();
  }

  // ── Stock: the operators' app ────────────────────────────────────────────
  function stock(body) {
    let points = 120;
    const total = el("span", { className: "big", textContent: points });
    const note = el("p", { className: "note" });
    note.setAttribute("aria-live", "polite");
    const list = el("div", { className: "card" }, el("h5", { textContent: "On your shelf today" }));
    [["Foldable phone, 256 GB", 2], ["Flagship phone, 512 GB", 9], ["Wireless earbuds", 1], ["Smart watch, 44 mm", 6]].forEach(([name, left]) => {
      const low = left <= 2;
      const row = el("div", { className: "stock" }, el("div", {}, el("div", { textContent: name }), el("small", { className: low ? "low" : "", textContent: low ? `Only ${left} left` : `${left} in stock` })));
      if (low) {
        const b = el("button", { type: "button", textContent: "Report low stock" });
        b.addEventListener("click", () => {
          b.disabled = true; b.textContent = "Reported";
          points += 15; total.textContent = points;
          note.textContent = "The team has been told. 15 points added.";
        });
        row.append(b);
      } else row.append(el("small", { textContent: "OK" }));
      list.append(row, el("div", { style: "height:.6rem" }));
    });
    body.append(el("div", { className: "points" }, el("div", {}, el("div", { textContent: "Your incentive points" }), el("small", { textContent: "This month" })), total), list, note);
  }

  // ── Forensics: a saved result from the injury model, played back ─────────
  function forensics(body, life) {
    const SAMPLES = { "Sample A": [["Fracture", 94], ["Bruise", 4], ["Laceration", 2]], "Sample B": [["Bruise", 81], ["Abrasion", 14], ["Fracture", 5]] };
    const sweep = el("div", { className: "sweep" });
    const xray = el("div", { className: "xray" });
    xray.append(svg('<path d="M30 20 L100 78"/><path d="M108 84 L172 132"/><path class="crack" d="M98 70l8 6-6 4 10 8"/>', { viewBox: "0 0 200 150" }), sweep);
    const chips = el("div", { className: "chips" });
    const result = el("div", { className: "card" }, el("p", { className: "hint", textContent: "Pick a sample to run the model." }));
    body.append(xray, el("div", { className: "card" }, el("h5", { textContent: "Medical image" }), chips), result,
      el("p", { className: "hint", textContent: "This plays back saved results. The real tool ran a ResNet model I trained." }));
    Object.entries(SAMPLES).forEach(([name, classes]) => {
      const b = el("button", { type: "button", textContent: name });
      b.addEventListener("click", () => {
        $$("button", chips).forEach((x) => { x.disabled = true; x.setAttribute("aria-pressed", String(x === b)); });
        xray.classList.remove("busy"); void xray.offsetWidth; xray.classList.add("busy");
        result.replaceChildren(el("p", { className: "big", textContent: "Analysing" }));
        life.later(() => {
          xray.classList.remove("busy");
          const bars = el("div", { className: "bars" });
          classes.forEach(([label, v], i) => {
            const fill = el("i");
            bars.append(el("div", { className: i === 0 ? "bar us" : "bar" }, el("span", { textContent: label }), el("div", { className: "meter" }, fill), el("b", { textContent: `${v}%` })));
            life.later(() => fill.style.setProperty("--v", `${v}%`), 60);
          });
          result.replaceChildren(el("h5", { textContent: `Most likely: ${classes[0][0].toLowerCase()}` }), bars);
          $$("button", chips).forEach((x) => { x.disabled = false; });
        }, calm ? 0 : 2600);
      });
      chips.append(b);
    });
  }

  // ── Rover: drive it, collect samples, dodge rocks ────────────────────────
  function rover(body, life) {
    const W = 320, H = 430, LANES = [64, 160, 256], ROVER_Y = 368;
    const canvas = el("canvas", { className: "rover-canvas" });
    canvas.setAttribute("aria-label", "Rover game. Use the arrow keys or the buttons to change lane.");
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    const hudScore = el("span"), hudLives = el("span"), hudBest = el("span");
    const left = el("button", { type: "button", className: "btn ghost", textContent: "Left" });
    const right = el("button", { type: "button", className: "btn ghost", textContent: "Right" });
    body.append(el("div", { className: "rover-wrap" }, el("div", { className: "rover-hud" }, hudScore, hudLives, hudBest), canvas), el("div", { className: "rover-controls" }, left, right));

    let best = 0;
    try { best = Number(localStorage.getItem("rover-best")) || 0; } catch { /* storage may be blocked; the game still works */ }
    const stars = Array.from({ length: 40 }, () => [Math.random() * W, Math.random() * H, Math.random() * 1.6 + 0.4]);
    let state = "ready", lane = 1, x = LANES[1], things = [], score = 0, lives = 3, speed = 150, spawn = 0, last = 0, flash = 0;

    const hud = () => { hudScore.textContent = `Samples ${score}`; hudLives.textContent = `Lives ${lives}`; hudBest.textContent = `Best ${best}`; };
    const begin = () => { state = "play"; lane = 1; x = LANES[1]; things = []; score = 0; lives = 3; speed = 150; spawn = 0; hud(); };
    const move = (dir) => { if (state !== "play") return begin(); lane = Math.max(0, Math.min(2, lane + dir)); };

    function drawRover(cx, cy) {
      ctx.fillStyle = "#1238ff"; ctx.fillRect(cx - 20, cy - 26, 40, 9);            // solar panel
      ctx.fillStyle = "#fff"; ctx.fillRect(cx - 15, cy - 14, 30, 24);               // body
      ctx.fillStyle = "#7f97ff"; ctx.fillRect(cx - 2, cy - 30, 4, 14);              // mast
      ctx.fillStyle = "#c9d3ff"; [-1, 1].forEach((s) => [-12, 0, 12].forEach((dy) => { ctx.beginPath(); ctx.arc(cx + s * 20, cy + dy, 6, 0, 7); ctx.fill(); }));
    }
    function frame(now) {
      if (!life.alive) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      ctx.fillStyle = "#050818"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#3d4a8f";
      stars.forEach((s) => { if (state === "play") s[1] = (s[1] + dt * speed * 0.25 * s[2]) % H; ctx.fillRect(s[0], s[1], s[2], s[2]); });
      ctx.strokeStyle = "#141c44"; ctx.lineWidth = 2;
      [112, 208].forEach((lx) => { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke(); });

      if (state === "play") {
        speed += dt * 7;
        spawn -= dt;
        if (spawn <= 0) { things.push({ lane: Math.floor(Math.random() * 3), y: -20, rock: Math.random() < 0.38 }); spawn = Math.max(0.32, 95 / speed); }
        x += (LANES[lane] - x) * Math.min(1, dt * 16);
        things.forEach((t) => { t.y += speed * dt; });
        things = things.filter((t) => {
          if (Math.abs(t.y - ROVER_Y) < 24 && Math.abs(LANES[t.lane] - x) < 30) {
            if (t.rock) { lives -= 1; flash = 0.25; } else score += 1;
            hud();
            return false;
          }
          return t.y < H + 30;
        });
        if (lives <= 0) {
          state = "over";
          if (score > best) { best = score; try { localStorage.setItem("rover-best", String(best)); } catch { /* fine */ } }
          hud();
        }
      }
      things.forEach((t) => {
        const cx = LANES[t.lane];
        if (t.rock) { ctx.fillStyle = "#8b93ad"; ctx.beginPath(); ctx.moveTo(cx - 17, t.y + 10); ctx.lineTo(cx - 9, t.y - 13); ctx.lineTo(cx + 8, t.y - 15); ctx.lineTo(cx + 18, t.y + 4); ctx.lineTo(cx + 6, t.y + 14); ctx.closePath(); ctx.fill(); }
        else { ctx.fillStyle = "#1238ff"; ctx.beginPath(); ctx.arc(cx, t.y, 10, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx - 3, t.y - 3, 3, 0, 7); ctx.fill(); }
      });
      drawRover(x, ROVER_Y);
      if (flash > 0) { flash -= dt; ctx.fillStyle = "rgba(224,21,42,.35)"; ctx.fillRect(0, 0, W, H); }
      if (state !== "play") {
        ctx.fillStyle = "rgba(5,8,24,.72)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        ctx.font = "800 30px Archivo, sans-serif";
        ctx.fillText(state === "over" ? `${score} samples` : "Rover run", W / 2, 180);
        ctx.font = "600 15px Archivo, sans-serif";
        ctx.fillText(state === "over" ? "Tap or press a key to go again" : "Collect the blue samples. Dodge the rocks.", W / 2, 212);
        ctx.fillText(state === "over" ? "" : "Tap or press an arrow key to start", W / 2, 236);
      }
      requestAnimationFrame(frame);
    }
    life.on(window, "keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); move(-1); }
      if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); move(1); }
    });
    life.on(canvas, "pointerdown", (e) => { const box = canvas.getBoundingClientRect(); move(e.clientX - box.left < box.width / 2 ? -1 : 1); });
    left.addEventListener("click", () => move(-1));
    right.addEventListener("click", () => move(1));
    hud();
    requestAnimationFrame(frame);
  }

  // ── Research: no demo, only the facts ────────────────────────────────────
  function research(body) {
    body.append(el("div", { className: "card" }, el("h5", { textContent: "Mental-health signals in text" }),
      el("p", { textContent: "Machine learning research at university: a language model that reads online posts and detects signs of mental illness." })),
      el("div", { className: "card" }, el("dl", { className: "rows" },
        el("div", {}, el("dt", { textContent: "Target accuracy" }), el("dd", { textContent: "90%+" })),
        el("div", {}, el("dt", { textContent: "Tools" }), el("dd", { textContent: "NLTK, spaCy, Hugging Face" })),
        el("div", {}, el("dt", { textContent: "My part" }), el("dd", { textContent: "Data, features, validation" })))),
      el("p", { className: "hint", textContent: "No demo for this one. It works with sensitive text, so it stays in the lab." }));
  }

  const APPS = {
    // `tag` is the small line in each app's header; `dark` flips the status bar to white.
    coach: { title: "Coach", tag: "Sales coaching", sheet: "p-saleslens", mount: coach },
    ask: { title: "Ask", tag: "Voice assistant", sheet: "p-promoter", mount: ask, dark: true },
    scan: { title: "Scan", tag: "Leaflet reader", sheet: "p-pipeline", mount: scan, dark: true },
    dash: { title: "Market share", tag: "Weekly sheet", sheet: "p-dashboard", mount: dash },
    optimizer: { title: "Optimizer", tag: "Price elasticity", sheet: "p-elasticity", mount: optimizer },
    stock: { title: "My store", tag: "Operator app", sheet: "p-operators", mount: stock },
    forensics: { title: "TRACE", tag: "Forensic analysis", sheet: "p-trace", mount: forensics, dark: true },
    rover: { title: "Rover run", tag: "Arcade", sheet: "p-rover", mount: rover, dark: true },
    research: { title: "Research notes", tag: "University", sheet: "p-nlp", mount: research },
  };

  function goHome() {
    life?.end(); life = null;
    screen.classList.remove("in-app", "light");
    const sheet = $(".sheet", brief);
    if (sheet) { sheet.classList.remove("in"); sheetHome.append(sheet); }
    briefEmpty.hidden = false;
    setTimeout(() => { if (!screen.classList.contains("in-app")) appview.replaceChildren(); }, 400);
  }

  function open(id) {
    const app = APPS[id];
    if (!app) return;
    life?.end();
    life = newLife();
    const body = el("div", { className: "appbody" });
    appview.className = `appview t-${id}`;
    appview.replaceChildren(el("div", { className: "appbar" }, el("strong", { textContent: app.title }), el("small", { textContent: `${app.tag}, demo data` })), body);
    app.mount(body, life);
    screen.classList.add("in-app");
    screen.classList.toggle("light", !app.dark);
    const old = $(".sheet", brief);
    if (old) { old.classList.remove("in"); sheetHome.append(old); }
    const sheet = document.getElementById(app.sheet);
    if (sheet) { briefEmpty.hidden = true; brief.append(sheet); sheet.classList.add("in"); }
  }

  $$(".app").forEach((button) => button.addEventListener("click", () => open(button.dataset.app)));
  $("#homebar").addEventListener("click", goHome);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && screen.classList.contains("in-app") && !$("dialog[open]")) goHome(); });

  const clock = $("#clock");
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, ""); };
  tick();
  setInterval(tick, 20000);
})();

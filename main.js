// Page behaviour: hero entrance and its dot field, scroll reveals, the money slide, and the screenshot viewer.
// The phone and its apps live in phone.js. With no JavaScript, or with reduced motion on, the page still
// shows all its content and nothing moves.
(() => {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ── Hero entrance ─────────────────────────────────────────────────────────
  setTimeout(() => document.body.classList.add("ready"), 80);

  // ── Background: a field of dots with slow waves, swelling toward the pointer
  const field = $("#field");
  if (field) {
    const ctx = field.getContext("2d");
    const GAP = 34;
    let w = 0, h = 0, px = -999, py = -999;
    const draw = (now) => {
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      for (let y = GAP / 2; y < h; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) {
          const near = Math.max(0, 1 - Math.hypot(x - px, y - py) / 220);
          // two slow waves crossing each other; where they meet the dots glow
          const wave = calm ? 0 : Math.max(0, Math.sin(x * 0.006 + y * 0.004 + t * 0.55) * Math.cos(y * 0.007 - x * 0.002 - t * 0.38));
          const r = 1 + near * 3.2 + wave * 1.6;
          const a = 0.1 + wave * 0.38 + near * 0.6;
          ctx.fillStyle = near > 0.05 ? `rgba(183,163,255,${Math.min(1, a)})` : `rgba(143,166,255,${a})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 6.3);
          ctx.fill();
        }
      }
    };
    const size = () => {
      const scale = Math.min(2, devicePixelRatio || 1);
      w = innerWidth; h = innerHeight;
      field.width = w * scale; field.height = h * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      draw(performance.now());
    };
    const loop = (now) => { if (!document.hidden) draw(now); requestAnimationFrame(loop); };
    addEventListener("resize", size);
    addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; if (calm) draw(0); }, { passive: true });
    document.addEventListener("pointerleave", () => { px = py = -999; });
    size();
    if (!calm) requestAnimationFrame(loop);
  }

  // ── Reveals as things scroll into view ────────────────────────────────────
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("in");
      seen.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal, .chapter").forEach((node) => seen.observe(node));

  // ── Scroll: the progress line, and the experience line that fills as you read
  const progress = $("#progress");
  const pathList = $("#path-list");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    if (pathList && !calm) {
      const box = pathList.getBoundingClientRect();
      pathList.style.setProperty("--p", Math.min(1, Math.max(0, (innerHeight * 0.72 - box.top) / box.height)).toFixed(3));
    }
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  // ── The money slide: tap the label and it rains ───────────────────────────
  const money = $("#money");
  money?.addEventListener("click", () => {
    if (calm) { money.textContent = "Cha-ching"; return; }
    const photo = $("#pitch-photo");
    for (let i = 0; i < 34; i++) {
      const note = document.createElement("i");
      note.className = "note-drop";
      note.style.left = `${Math.random() * 96}%`;
      note.style.setProperty("--t", `${1.5 + Math.random() * 1.4}s`);
      note.style.setProperty("--d", `${Math.random() * 0.7}s`);
      note.style.setProperty("--r", `${Math.random() * 540 - 270}deg`);
      photo.append(note);
      setTimeout(() => note.remove(), 3800);
    }
  });

  // ── Screenshots: open one larger, then step through its strip ─────────────
  const box = $("#lightbox");
  const boxImg = $("#lightbox-img");
  const boxCap = $("#lightbox-cap");
  let strip = [];
  let at = 0;
  function showShot(index) {
    at = (index + strip.length) % strip.length;
    const img = $("img", strip[at]);
    const name = $("span", strip[at]).textContent;
    boxImg.src = img.src;
    boxImg.alt = img.alt;
    boxCap.textContent = strip.length > 1 ? `${name} (${at + 1} of ${strip.length})` : name;
    $(".lightbox-nav", box).hidden = strip.length < 2;
  }
  $$("[data-shots]").forEach((group) => {
    const shots = $$(".shot", group);
    shots.forEach((shot, i) => shot.addEventListener("click", () => { strip = shots; showShot(i); box.showModal(); }));
  });
  $("#lightbox-close").addEventListener("click", () => box.close());
  $("#lightbox-prev").addEventListener("click", () => showShot(at - 1));
  $("#lightbox-next").addEventListener("click", () => showShot(at + 1));
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") showShot(at + 1);
    if (e.key === "ArrowLeft") showShot(at - 1);
  });
})();

# ahmedshxrif.github.io

My portfolio site: who I am, how I got here, and a phone you can pick up that runs small working copies of things I've built.

Live at **https://ahmedshxrif.github.io**

## What's in it

- **My journey**, from university to today
- **Projects on a phone**: nine apps, each a working demo on made-up data
  - Coach: record a sales conversation and watch it get scored
  - Ask: a shopping assistant that checks every reply before it speaks
  - Scan: drag across a real promo leaflet to pull the offers out
  - Market share, Optimizer, My store, TRACE, Research notes
  - Rover run: an arcade game
- A background that moves, and stops for anyone who prefers reduced motion

## How it's built

Plain HTML, CSS and JavaScript. No framework and no build step: open `index.html` or serve the folder.

```bash
python3 -m http.server 4173
```

| File | What it holds |
|---|---|
| `index.html` | The page and all its text |
| `styles.css` | The look: windows, journey, background |
| `main.js` | Background animation, scroll reveals, screenshot viewer |
| `phone.js`, `phone.css` | The phone and its nine apps |

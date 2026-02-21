# Prompt Sora AI per controlla.me

Genera questi video con Sora e salvali in `/public/videos/`.
Poi aggiorna i componenti `VideoShowcase` nella landing page con il path corretto.

---

## Video 1: Hero — "Lo studio legale del futuro"
**File:** `/public/videos/hero-intro.mp4`
**Durata:** 8-12 secondi
**Dove va:** Componente `VideoShowcase` nella landing page

```
Prompt Sora:

Cinematic dark office scene, soft warm amber lighting. Camera slowly dollies
forward through a modern minimalist law office at night. Dark walnut desk with a
single glowing tablet screen showing a legal document. Four translucent holographic
AI assistants materialize one by one around the desk — each a different color
(teal, coral red, purple, gold). They lean over the document, pointing at different
sections. Particles of light float between them as they analyze. The camera
continues forward as the document's text highlights in orange where risks are found.
Cinematic depth of field, anamorphic lens flares. Style: dark, premium,
professional. Color palette: deep black (#0A0A0A), warm orange (#FF6B35),
teal (#4ECDC4), coral (#FF6B6B), purple (#A78BFA), gold (#FFC832).
No text overlay. 16:9 aspect ratio.
```

---

## Video 2: Come Funziona — "Il documento prende vita"
**File:** `/public/videos/how-it-works.mp4`
**Durata:** 10-15 secondi
**Dove va:** Secondo `VideoShowcase` (opzionale, nella sezione Missione)

```
Prompt Sora:

Close-up of a legal contract on a dark surface. Camera slowly zooms in.
The text on the page begins to glow — some lines turn orange (dangerous clauses),
some turn green (safe). A translucent scanning line sweeps across the document
from top to bottom, like a laser. As the line passes, small icons appear next to
each clause: warning triangles for risks, checkmarks for safe sections, scale of
justice for legal references. The whole document transforms from a flat paper into
a 3D visualization of risk levels — risky clauses rise up like skyscrapers while
safe ones stay flat. Cinematic macro lens, shallow depth of field, dark ambient
lighting with warm orange accent light from the side. Style: dark tech, legal,
premium. 16:9 aspect ratio.
```

---

## Video 3: I 4 Agenti — "Il team al lavoro"
**File:** `/public/videos/team-at-work.mp4`
**Durata:** 12-15 secondi
**Dove va:** Sezione Team (opzionale background)

```
Prompt Sora:

Four stylized AI characters working together in a dark holographic workspace.
Each character has a distinct visual identity:

1. TEAL character (#4ECDC4) — sits at a desk, rapidly sorting through floating
   document pages, stamping them with classification labels
2. CORAL RED character (#FF6B6B) — holds a magnifying glass, examining a large
   floating contract, circling problematic text in red
3. PURPLE character (#A78BFA) — surrounded by floating law books and legal codes,
   connecting glowing threads between clauses and laws
4. GOLD character (#FFC832) — stands at a podium with a lightbulb above their head,
   presenting a final summary hologram

Camera slowly orbits around the group. Data streams and light particles flow
between the characters as they pass work to each other. Dark environment,
volumetric lighting, warm orange rim lights. Style: isometric 3D, soft render,
dark premium. 16:9 aspect ratio.
```

---

## Video 4: Social Proof — "Documenti analizzati"
**File:** `/public/videos/social-proof.mp4`
**Durata:** 6-8 secondi (loop)
**Dove va:** Background della sezione Testimonianze

```
Prompt Sora:

Abstract dark visualization: hundreds of document icons (small white rectangles
with text lines) float in a dark void. They slowly drift toward a central point
where four colored lights (teal, red, purple, gold) pulse. As each document passes
through the lights, it transforms — a green checkmark or orange warning appears on
it. Documents continue flowing in an endless stream. Soft particle effects,
bokeh lights in the background. Counter at the bottom ticks up (numbers increasing).
Style: dark, abstract, data visualization, clean. Seamless loop. 16:9 aspect ratio.
```

---

## Video 5: CTA — "Non firmare al buio"
**File:** `/public/videos/cta-background.mp4`
**Durata:** 6-8 secondi (loop)
**Dove va:** Background della sezione CTA finale

```
Prompt Sora:

A hand holding a pen, hovering over a document in a completely dark room.
A single spotlight illuminates the signing area. As the hand hesitates,
four beams of colored light (teal, coral, purple, gold) sweep across the document
from different angles, revealing hidden text that was previously invisible in the
dark — warning symbols, asterisks, fine print clauses glow in orange. The pen hand
pulls back, reconsidering. Camera stays locked in close-up. Dramatic chiaroscuro
lighting. Style: cinematic, dramatic, dark. Seamless loop. 16:9 aspect ratio.
```

---

## Come usarli nel codice

Una volta generati i video, aggiorna la landing page:

```tsx
// In app/page.tsx, aggiorna il VideoShowcase:
<VideoShowcase
  src="/videos/hero-intro.mp4"
  poster="/videos/hero-intro-poster.jpg"  // opzionale: primo frame come immagine
  title="Guarda come funziona"
  subtitle="Carica un documento e guarda i 4 agenti al lavoro."
/>
```

Puoi anche aggiungere video come background a qualsiasi sezione:

```tsx
// Background video per una sezione
<div className="relative overflow-hidden">
  <video
    autoPlay
    muted
    loop
    playsInline
    className="absolute inset-0 w-full h-full object-cover opacity-20"
    src="/videos/social-proof.mp4"
  />
  <div className="relative z-10">
    {/* contenuto della sezione */}
  </div>
</div>
```

---

## Tips per Sora

1. **Aspetto:** 16:9 per tutti i video
2. **Durata:** 6-15 secondi max, loop quando possibile
3. **Stile:** Sempre dark (#0A0A0A), premium, minimale
4. **Colori:** Usa la palette del brand: arancione #FF6B35, teal #4ECDC4, rosso #FF6B6B, viola #A78BFA, oro #FFC832
5. **Formato:** MP4, h264, compresso (max 5MB per video)
6. **Poster:** Esporta anche il primo frame come .jpg per il caricamento rapido
7. **Loop:** Per i video 4 e 5, assicurati che il loop sia seamless

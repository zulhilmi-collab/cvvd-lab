/* CVVD Lab — 3D wave field
   ---------------------------------------------------------------------------
   Three wireframe wave surfaces drawn in perspective with WebGL2. Scrolling
   advances each surface through the wave function at a different rate, so the
   layers separate with real depth parallax rather than a translated image.

   The surfaces are contour lines, not a shaded mesh, on purpose: they read as
   measurement rather than scenery, which is the same idea the mark carries.

   Dependency-free. If WebGL2 is unavailable the module bails out and leaves the
   CSS image fallback in place (see .no-webgl in styles.css). */

(function () {
  'use strict';

  var HOST = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The scrim goes in regardless of which background wins — it is what keeps
     the copy readable over either one. */
  var scrim = document.createElement('div');
  scrim.className = 'wave-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  document.body.prepend(scrim);

  /* Fallback: the original artwork, stacked and parallaxed. Installed only if
     the 3D field can't run, so nobody downloads the image otherwise. */
  function installFallback() {
    HOST.classList.remove('has-webgl');
    HOST.classList.add('no-webgl');

    var root = document.createElement('div');
    root.className = 'wave-bg';
    root.setAttribute('aria-hidden', 'true');

    var cfgs = [
      { cls: 'wave-far',  yMax: 90,  xMax: 55 },
      { cls: 'wave-mid',  yMax: 190, xMax: -125 },
      { cls: 'wave-near', yMax: 275, xMax: 205 }
    ];

    var made = cfgs.map(function (cfg) {
      var el = document.createElement('div');
      el.className = 'wave-layer ' + cfg.cls;
      root.appendChild(el);
      return { el: el, cfg: cfg };
    });

    document.body.prepend(root);

    var range = 1;
    var queued = false;

    function remeasure() {
      range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    }

    function place() {
      var p = Math.min(1, Math.max(0, window.scrollY / range));
      for (var i = 0; i < made.length; i++) {
        made[i].el.style.transform =
          'translate3d(' + (p * made[i].cfg.xMax).toFixed(1) + 'px,' +
          (-p * made[i].cfg.yMax).toFixed(1) + 'px,0)';
      }
    }

    remeasure();
    place();

    if (!reduceMotion) {
      window.addEventListener('scroll', function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; place(); });
      }, { passive: true });
    }
    window.addEventListener('resize', function () { remeasure(); place(); }, { passive: true });
    window.addEventListener('load', function () { remeasure(); place(); });
  }

  var canvas = document.createElement('canvas');
  canvas.className = 'wave-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  var gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: 'low-power',
    // The scrim sits above the canvas in CSS, so we never read back.
    preserveDrawingBuffer: false
  });

  if (!gl) {
    installFallback();
    return;
  }

  document.body.prepend(canvas);
  HOST.classList.add('has-webgl');

  /* ------------------------------------------------------------------ shaders */

  var VERT = [
    '#version 300 es',
    'in vec3 aPos;',                 // x across the field, z into the screen, row index
    'uniform mat4 uMVP;',
    'uniform vec3 uEye;',
    'uniform float uAmp;',
    'uniform float uPhase;',
    'uniform float uTravel;',        // how far this sheet has rolled through the field
    'uniform float uY;',             // resting height of the sheet
    'uniform float uFreq;',
    'uniform float uFog;',
    'uniform float uHalfWidth;',
    'uniform float uSeed;',
    'out float vH;',
    'out float vFade;',
    'out float vAlarm;',

    // Four incommensurate sines. No single period means the field never
    // visibly repeats, however far the page scrolls.
    'float field(vec2 p) {',
    '  float h = 0.0;',
    '  h += sin(p.x * 0.055 * uFreq + uPhase) * 1.00;',
    '  h += sin(p.x * 0.021 * uFreq - p.y * 0.045 + uPhase * 1.7) * 0.75;',
    '  h += sin(p.y * 0.062 + uPhase * 0.9) * 0.55;',
    '  h += sin((p.x * 0.013 + p.y * 0.037) * uFreq + uPhase * 0.55) * 0.90;',
    '  h += sin(p.x * 0.110 * uFreq + p.y * 0.020 - uPhase * 2.3) * 0.18;',
    '  return h * 0.34;',
    '}',

    'void main() {',
    '  vec2 s = vec2(aPos.x, aPos.y + uTravel);',
    '  float h = field(s);',
    '  vec3 world = vec3(aPos.x, h * uAmp + uY, aPos.y);',
    '  vH = clamp(h * 0.5 + 0.5, 0.0, 1.0);',

    // FogExp2 — density reads more naturally than a linear ramp, and it hides
    // the far edge of the sheet so the field feels open-ended.
    '  float d = distance(world, uEye);',
    '  float fog = exp(-(d * uFog) * (d * uFog));',

    // Feather the left/right edges so a sheet never ends on a hard vertical.
    '  float edge = 1.0 - smoothstep(0.55, 1.0, abs(aPos.x) / uHalfWidth);',
    '  vFade = fog * edge;',
    // A handful of contour lines carry the fault colour — a reading that
    // tripped, not a third colour in the palette. The hash is on the row index
    // so a flagged line stays flagged along its whole length rather than
    // flickering per vertex.
    '  float k = fract(sin(aPos.z * 78.233 + uSeed) * 43758.5453);',
    '  vAlarm = step(0.965, k);',
    '  gl_Position = uMVP * vec4(world, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in float vH;',
    'in float vFade;',
    'in float vAlarm;',
    'uniform vec3 uColLow;',
    'uniform vec3 uColHigh;',
    'uniform vec3 uColHot;',
    'uniform float uOpacity;',
    'out vec4 frag;',
    'void main() {',
    // The height distribution clusters around the midpoint, so the ramp window
    // is tight and centred there — a wide window renders nearly every line at
    // the trough colour and the whole field goes flat.
    '  vec3 c = mix(uColLow, uColHigh, smoothstep(0.40, 0.80, vH));',
    // Only the very top of a crest picks up the fault colour — the same "one
    // thing is different" grammar the mark uses for the anomaly.
    '  c = mix(c, uColHot, smoothstep(0.86, 1.0, vH) * 0.7);',
    // Only the upper half of a flagged line takes the colour, so it reads as a
    // crest that tripped rather than a stripe painted across the field.
    // vec3(0.976, 0.451, 0.086) is --fault, #f97316.
    '  c = mix(c, vec3(0.976, 0.451, 0.086), vAlarm * smoothstep(0.42, 0.72, vH));',
    '  float a = uOpacity * vFade * (0.34 + 0.66 * vH) * (1.0 + vAlarm * 0.35);',
    '  if (a < 0.002) discard;',
    '  frag = vec4(c, a);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[waves] shader:', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    canvas.remove();
    installFallback();
    return;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[waves] link:', gl.getProgramInfoLog(prog));
    canvas.remove();
    installFallback();
    return;
  }
  gl.useProgram(prog);

  var U = {};
  ['uMVP', 'uEye', 'uAmp', 'uPhase', 'uTravel', 'uY', 'uFreq', 'uFog',
   'uHalfWidth', 'uSeed', 'uColLow', 'uColHigh', 'uColHot', 'uOpacity'
  ].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  /* ---------------------------------------------------------------- geometry
     One grid, reused by every sheet. The sheets differ only by uniforms, so
     the whole background is three draw calls. */

  var COLS = 190;          // segments across
  var ROWS = 64;           // contour lines
  var HALF_W = 300;        // field half-width in world units
  var DEPTH = 340;         // field depth, running away from the camera

  var verts = new Float32Array((COLS + 1) * ROWS * 3);
  var vi = 0;
  for (var r = 0; r < ROWS; r++) {
    // Rows bunch up toward the horizon, which is what perspective does to a
    // uniform grid anyway — this just keeps the far contours from smearing.
    var tz = r / (ROWS - 1);
    var z = -DEPTH * (tz * tz * 0.82 + tz * 0.18);
    for (var c = 0; c <= COLS; c++) {
      verts[vi++] = -HALF_W + (2 * HALF_W) * (c / COLS);
      verts[vi++] = z;
      verts[vi++] = r;          // row index, so a flagged line stays whole
    }
  }

  var idx = new Uint32Array(ROWS * COLS * 2);
  var ii = 0;
  for (var r2 = 0; r2 < ROWS; r2++) {
    var base = r2 * (COLS + 1);
    for (var c2 = 0; c2 < COLS; c2++) {
      idx[ii++] = base + c2;
      idx[ii++] = base + c2 + 1;
    }
  }

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  var vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);

  var ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  // Additive: on a near-black ground the crests read as emitted light rather
  // than painted line. Per-sheet opacity is kept low so overlaps don't clip.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.clearColor(0, 0, 0, 0);


  /* ------------------------------------------------------------- drift nodes
     A sparse layer of slow-moving points over the sheets. They travel with
     scroll like everything else, but at their own rate, so they read as depth
     rather than as an overlay. Kept dim on purpose — this is atmosphere. */

  var VERT_PT = [
    '#version 300 es',
    'in vec3 aNode;',                // x, z, phase
    'uniform mat4 uMVP;',
    'uniform vec3 uEye;',
    'uniform float uTime;',
    'uniform float uTravel;',
    'uniform float uDpr;',
    'out float vFade;',
    'void main() {',
    '  float ph = aNode.z;',
    // Each node bobs and drifts on its own phase so the field never pulses
    // in unison.
    '  float y  = 6.0 + sin(uTime * 0.21 + ph) * 14.0 + cos(uTime * 0.13 + ph * 1.7) * 8.0;',
    '  float x  = aNode.x + sin(uTime * 0.09 + ph * 2.3) * 16.0;',
    '  float z  = aNode.y + uTravel;',
    '  vec3 world = vec3(x, y, z);',
    '  float d = distance(world, uEye);',
    '  float fog = exp(-(d * 0.0052) * (d * 0.0052));',
    // Slow twinkle, offset per node.
    '  vFade = fog * (0.45 + 0.55 * sin(uTime * 0.7 + ph * 3.1));',
    '  gl_Position = uMVP * vec4(world, 1.0);',
    '  gl_PointSize = clamp(320.0 / d, 1.5, 7.0) * uDpr;',
    '}'
  ].join('\n');

  var FRAG_PT = [
    '#version 300 es',
    'precision highp float;',
    'in float vFade;',
    'uniform vec3 uColor;',
    'out vec4 frag;',
    'void main() {',
    // Round the square point sprite off into a soft dot.
    '  float r = length(gl_PointCoord - vec2(0.5));',
    '  if (r > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.05, r) * vFade * 0.5;',
    '  if (a < 0.004) discard;',
    '  frag = vec4(uColor, a);',
    '}'
  ].join('\n');

  var NODE_N = 70;
  var progPt = null, vaoPt = null, UP = {};

  (function buildNodes() {
    var vsp = compile(gl.VERTEX_SHADER, VERT_PT);
    var fsp = compile(gl.FRAGMENT_SHADER, FRAG_PT);
    if (!vsp || !fsp) return;

    progPt = gl.createProgram();
    gl.attachShader(progPt, vsp);
    gl.attachShader(progPt, fsp);
    gl.linkProgram(progPt);
    if (!gl.getProgramParameter(progPt, gl.LINK_STATUS)) {
      console.warn('[waves] node link:', gl.getProgramInfoLog(progPt));
      progPt = null;
      return;
    }

    ['uMVP', 'uEye', 'uTime', 'uTravel', 'uDpr', 'uColor'].forEach(function (n) {
      UP[n] = gl.getUniformLocation(progPt, n);
    });

    // Deterministic scatter — no Math.random, so the field is identical on
    // every load and across resumes.
    var data = new Float32Array(NODE_N * 3);
    var seed = 20260816;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
      return seed / 0x7FFFFFFF;
    }
    for (var i = 0; i < NODE_N; i++) {
      data[i * 3]     = (rnd() * 2 - 1) * HALF_W * 0.95;
      data[i * 3 + 1] = -rnd() * DEPTH;
      data[i * 3 + 2] = rnd() * 6.283;
    }

    vaoPt = gl.createVertexArray();
    gl.bindVertexArray(vaoPt);
    var vbp = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbp);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var lp = gl.getAttribLocation(progPt, 'aNode');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(vao);
  })();

  /* ------------------------------------------------------------------ sheets
     travel  — world units this sheet rolls over one full page scroll
     drift   — idle roll per second, so the field breathes when parked
     Far sheets get tight frequency and low amplitude; near sheets get long,
     tall swells. That gradient is what sells the depth. */

  var SHEETS = [
    // Far: tight, shallow, sits high in frame and holds the horizon.
    { y: 16.0, amp: 13.0, freq: 1.55, travel: 130, drift: 1.6, speed: 0.15,
      opacity: 0.52, fog: 0.0036,
      low: [0.07, 0.13, 0.20], high: [0.34, 0.52, 0.67], hot: [0.47, 0.64, 0.79] },

    // Mid: the readable one — brightest crests, most of the character.
    { y: -16.0, amp: 22.0, freq: 0.92, travel: 250, drift: 2.6, speed: 0.19,
      opacity: 0.80, fog: 0.0042,
      low: [0.08, 0.15, 0.23], high: [0.56, 0.73, 0.87], hot: [0.72, 0.78, 0.86] },

    // Near: long, tall swells across the bottom. The only sheet allowed a
    // trace of the fault colour, and only at the very top of a crest.
    { y: -54.0, amp: 33.0, freq: 0.55, travel: 420, drift: 3.8, speed: 0.12,
      opacity: 0.66, fog: 0.0050,
      low: [0.09, 0.14, 0.21], high: [0.44, 0.61, 0.77], hot: [0.86, 0.46, 0.14] }
  ];

  /* ------------------------------------------------------------------ camera */

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ];
  }

  function lookAt(eye, at) {
    var zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    // x = normalize(cross(up, z)), with up hard-coded to (0, 1, 0)
    var xx = zz, xy = 0, xz = -zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1
    ];
  }

  function mul(a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        o[i * 4 + j] = a[0 * 4 + j] * b[i * 4 + 0] + a[1 * 4 + j] * b[i * 4 + 1] +
                       a[2 * 4 + j] * b[i * 4 + 2] + a[3 * 4 + j] * b[i * 4 + 3];
      }
    }
    return o;
  }

  /* -------------------------------------------------------------- render loop */

  var W = 0, H = 0, dpr = 1;
  var scrollRange = 1;
  var progress = 0;      // 0..1 down the page
  var eased = 0;         // progress with a little lag, so scrolling feels weighted
  var elapsed = 0;   // seconds of animation actually shown
  var lastNow = 0;
  var running = false;
  var rafId = 0;

  function measure() {
    var doc = document.documentElement;
    scrollRange = Math.max(1, doc.scrollHeight - window.innerHeight);
  }

  function resize() {
    // Full-screen effects don't repay a 3x buffer; cap the ratio and spend the
    // budget on line count instead.
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var w = Math.round(window.innerWidth * dpr);
    var h = Math.round(window.innerHeight * dpr);
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }

  function draw(now) {
    if (!reduceMotion) {
      // Accumulate rather than diff against a start stamp, so pausing on a
      // hidden tab resumes where it left off instead of jumping.
      var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0;
      lastNow = now;
      elapsed += dt;
    }
    var t = elapsed;

    // A touch of lag on the scroll term. Instant tracking reads as a slider;
    // a short catch-up reads as mass.
    eased += (progress - eased) * (reduceMotion ? 1 : 0.085);

    var aspect = W / Math.max(1, H);
    // The camera lifts and levels slightly as you descend, so the horizon
    // opens up rather than the whole field just sliding by.
    // Pitched down ~13°, which puts the horizon around 28% from the top —
    // field across the lower two thirds, clean ground for the headline above.
    var eye = [0, 33 - eased * 8, 34];
    var at = [0, -16 + eased * 9, -190];
    var mvp = mul(perspective(0.95, aspect, 1, 700), lookAt(eye, at));

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uMVP, false, mvp);
    gl.uniform3fv(U.uEye, eye);
    gl.uniform1f(U.uHalfWidth, HALF_W);

    for (var i = 0; i < SHEETS.length; i++) {
      var s = SHEETS[i];
      gl.uniform1f(U.uAmp, s.amp);
      gl.uniform1f(U.uY, s.y);
      gl.uniform1f(U.uFreq, s.freq);
      gl.uniform1f(U.uFog, s.fog);
      gl.uniform1f(U.uOpacity, s.opacity);
      gl.uniform1f(U.uSeed, i * 37.7);
      // Scroll is the dominant term; drift only keeps it alive when parked.
      gl.uniform1f(U.uTravel, eased * s.travel + t * s.drift);
      gl.uniform1f(U.uPhase, t * s.speed + eased * 2.4 * (i + 1) * 0.5);
      gl.uniform3fv(U.uColLow, s.low);
      gl.uniform3fv(U.uColHigh, s.high);
      gl.uniform3fv(U.uColHot, s.hot);
      gl.drawElements(gl.LINES, idx.length, gl.UNSIGNED_INT, 0);
    }

    if (progPt) {
      gl.useProgram(progPt);
      gl.bindVertexArray(vaoPt);
      gl.uniformMatrix4fv(UP.uMVP, false, mvp);
      gl.uniform3fv(UP.uEye, eye);
      gl.uniform1f(UP.uTime, t);
      gl.uniform1f(UP.uTravel, eased * 180);
      gl.uniform1f(UP.uDpr, dpr);
      gl.uniform3fv(UP.uColor, [0.62, 0.78, 0.92]);
      gl.drawArrays(gl.POINTS, 0, NODE_N);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
    }
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    draw(now);
  }

  function start() {
    if (running) return;
    running = true;
    lastNow = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function onScroll() {
    progress = Math.min(1, Math.max(0, window.scrollY / scrollRange));
    if (reduceMotion) {
      // No loop is running; paint the one frame the new position implies.
      eased = progress;
      requestAnimationFrame(draw);
    }
  }

  measure();
  resize();
  onScroll();
  eased = progress;

  if (reduceMotion) {
    requestAnimationFrame(draw);
  } else {
    start();
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  window.addEventListener('resize', function () {
    measure();
    resize();
    onScroll();
    if (reduceMotion) requestAnimationFrame(draw);
  }, { passive: true });

  // Late fonts and images change the page height under us.
  window.addEventListener('load', function () {
    measure();
    onScroll();
  });

  // Don't burn a GPU on a tab nobody is looking at.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
    } else if (!reduceMotion) {
      start();
    }
  });
})();

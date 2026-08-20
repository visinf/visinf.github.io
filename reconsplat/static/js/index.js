// Render LaTeX written straight into the markup: $...$ / \(...\) inline and
// $$...$$ / \[...\] display. auto-render skips script/style/pre/code/textarea by
// default, which is what keeps it out of the BibTeX block.
//
// $ is enabled because it is what one actually types, but note it is now ACTIVE
// PROSE SYNTAX on this page: a bare "$5" somewhere would start a math run. Use
// \$ if a literal dollar is ever needed.
$(document).ready(function () {
  if (typeof renderMathInElement !== "function") return;   // vendored file missing
  renderMathInElement(document.body, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false }
    ],
    throwOnError: false
  });
});

// Tabs over the qualitative comparisons. Panels are shown/hidden with the
// `hidden` attribute; the active tab is mirrored into the URL hash so a panel can
// be linked to, which is the main thing tabs otherwise take away.
//
// Keydown is bound to the TABLIST, not the group: the scene strip inside panel 2
// is itself a role="tablist" and wants its own arrow keys, and binding here means
// focus inside a panel never reaches this handler. Same collision the video
// carousel has with the wipe divider.
function initQualTabs(group) {
  var list = group.querySelector(".qual-tablist");
  if (!list) return;
  var tabs = Array.prototype.slice.call(list.querySelectorAll(".qual-tab"));
  if (!tabs.length) return;

  function panelOf(tab) {
    return document.getElementById(tab.getAttribute("aria-controls"));
  }

  function select(tab, opts) {
    opts = opts || {};
    tabs.forEach(function (t) {
      var on = t === tab;
      var panel = panelOf(t);
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (!panel) return;
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
      // MEASURED, not assumed: an IntersectionObserver does NOT fire again when
      // its target goes from display:none back to visible. Anything inside a
      // panel that gates itself on being on-screen would sit dead after its tab
      // is opened, so say so explicitly. See initTrajViewer.
      panel.dispatchEvent(
        new CustomEvent(on ? "qualtab:shown" : "qualtab:hidden", { bubbles: true })
      );
    });
    if (opts.focus) tab.focus();
    if (opts.hash && window.history && history.replaceState) {
      // replaceState, not location.hash: assigning the hash makes the browser
      // jump to the element, so merely switching tabs would scroll the page.
      history.replaceState(null, "", "#" + tab.getAttribute("aria-controls"));
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      select(tab, { hash: true });
    });
  });

  list.addEventListener("keydown", function (e) {
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var next = null;
    if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
    else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === "Home") next = tabs[0];
    else if (e.key === "End") next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next, { focus: true, hash: true });
  });

  // Deep link. The browser cannot honour #panel-id itself, because the panel is
  // hidden at parse time, so restore it here and bring the group into view.
  var target = window.location.hash.slice(1);
  if (target) {
    var wanted = tabs.filter(function (t) {
      return t.getAttribute("aria-controls") === target;
    })[0];
    if (wanted) {
      // Scroll BEFORE selecting, not after. Widgets inside the panel decide
      // whether to start by measuring their rect the moment they are shown, so
      // selecting first means they measure a position the reader is not looking
      // at yet, conclude "off screen", and stay stopped -- and the observer that
      // would normally correct that has only its stale zero-area reading to go on.
      group.scrollIntoView();
      select(wanted);
    }
  }
}

// Is any part of the element in the viewport? Needed where an IntersectionObserver
// cannot answer synchronously -- i.e. the instant a tab panel is unhidden.
function isOnScreen(el) {
  var r = el.getBoundingClientRect();
  if (!r.width && !r.height) return false;
  var vh = window.innerHeight || document.documentElement.clientHeight;
  return r.top < vh && r.bottom > 0;
}

function initTrajViewer(viewer) {
  var scenes;
  try {
    scenes = JSON.parse(viewer.dataset.scenes);
  } catch (e) {
    return;
  }
  if (!scenes || !scenes.length) return;

  var interval = parseInt(viewer.dataset.interval, 10) || 1100;
  var roleImgs = viewer.querySelectorAll("[data-role]");
  var ctxImgs = viewer.querySelectorAll("[data-ctx]");
  var dotsBox = viewer.querySelector(".traj-dots");
  var playBtn = viewer.querySelector(".traj-playpause");
  var thumbs = viewer.querySelectorAll(".scene-thumb");

  var maxFrames = scenes.reduce(function (m, s) {
    return Math.max(m, s.frames.length);
  }, 0);
  if (maxFrames < 2) viewer.classList.add("is-single-frame");

  var sceneIdx = 0;
  var frameIdx = 0;
  var timer = null;

  // Preload every frame so advancing never shows a blank cell. The role list is
  // read off THIS viewer's own [data-role] cells rather than a shared constant:
  // the two viewers no longer show the same set of methods (only the RE10K one
  // has a second ReconSplat sample), and a fixed list would have the DL3DV viewer
  // requesting ours2_*.png files that do not exist.
  var roles = Array.prototype.map.call(roleImgs, function (img) {
    return img.dataset.role;
  });
  scenes.forEach(function (scene) {
    scene.ctx.forEach(function (p) {
      new Image().src = scene.base + "/" + p;
    });
    scene.frames.forEach(function (f) {
      roles.forEach(function (role) {
        new Image().src = scene.base + "/" + f + "/" + role + ".png";
      });
    });
  });

  function paintFrame() {
    var scene = scenes[sceneIdx];
    var frame = scene.frames[frameIdx];
    roleImgs.forEach(function (img) {
      img.src = scene.base + "/" + frame + "/" + img.dataset.role + ".png";
    });
    var dots = dotsBox ? dotsBox.children : [];
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle("is-active", i === frameIdx);
    }
  }

  function paintScene() {
    var scene = scenes[sceneIdx];
    ctxImgs.forEach(function (img) {
      var p = scene.ctx[parseInt(img.dataset.ctx, 10)];
      if (p) img.src = scene.base + "/" + p;
    });
    if (dotsBox) {
      dotsBox.innerHTML = "";
      scene.frames.forEach(function () {
        var dot = document.createElement("span");
        dot.className = "traj-dot";
        dotsBox.appendChild(dot);
      });
    }
    thumbs.forEach(function (t, i) {
      t.classList.toggle("is-active", i === sceneIdx);
    });
    frameIdx = 0;
    paintFrame();
  }

  function advance() {
    frameIdx = (frameIdx + 1) % scenes[sceneIdx].frames.length;
    paintFrame();
  }

  function play() {
    if (timer || maxFrames < 2) return;
    timer = setInterval(advance, interval);
    viewer.classList.remove("is-paused");
    if (playBtn) playBtn.setAttribute("aria-label", "Pause view playback");
  }

  function pause() {
    if (timer) clearInterval(timer);
    timer = null;
    viewer.classList.add("is-paused");
    if (playBtn) playBtn.setAttribute("aria-label", "Resume view playback");
  }

  // Tracks an explicit user pause, so scrolling the widget out of view and back
  // does not override their choice.
  var userPaused = false;

  if (playBtn) {
    playBtn.addEventListener("click", function () {
      if (timer) {
        userPaused = true;
        pause();
      } else {
        userPaused = false;
        play();
      }
    });
  }

  thumbs.forEach(function (thumb, i) {
    thumb.addEventListener("click", function () {
      sceneIdx = i;
      paintScene();
    });
  });

  paintScene();

  // Honour a reduced-motion preference: start paused rather than animating.
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Play only while the widget is on screen. This is a discoverability fix as
  // much as an efficiency one: starting every viewer at page load means the
  // animation has been looping for a while by the time the reader scrolls down,
  // so it reads as a static figure. Starting on entry puts the first frame
  // change right under the reader's eye, which is what signals "this is live".
  var io = null;
  if (reduce) {
    pause();
  } else if (window.IntersectionObserver) {
    pause();
    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            if (!userPaused) play();
          } else {
            pause();
          }
        });
      },
      { threshold: 0.25 }
    );
    io.observe(viewer);
  } else {
    play();
  }

  // A tab panel is display:none, which the observer reads as "off screen" --
  // correctly. What it does NOT do is deliver anything when the panel is shown
  // again (verified in a browser, not assumed), and the stale reading sticks: the
  // viewer would sit frozen once its tab was opened.
  //
  // Both halves below are needed, and each was found by a test the other passed:
  //
  //   - the rect check decides NOW, synchronously. Re-observing alone did not
  //     resume a viewer whose tab was opened while it was already on screen --
  //     the fresh callback simply did not arrive in time to matter.
  //   - the re-observe fixes the case the rect check cannot: a tab opened while
  //     the section is still scrolled past. The rect says "off screen", correctly,
  //     but the observer's only reading is from when the panel had zero area, so
  //     without a fresh observation it never fires again and the viewer stays dead
  //     however far the reader scrolls.
  document.addEventListener("qualtab:shown", function (e) {
    if (!e.target.contains(viewer)) return;
    if (io) {
      io.unobserve(viewer);
      io.observe(viewer);
    }
    if (!userPaused && !reduce && isOnScreen(viewer)) play();
  });
  document.addEventListener("qualtab:hidden", function (e) {
    if (e.target.contains(viewer)) pause();
  });
}

$(document).ready(function () {
  $(".navbar-burger").click(function () {
    $(".navbar-burger").toggleClass("is-active");
    $(".navbar-menu").toggleClass("is-active");
  });

  document.querySelectorAll(".qual-block").forEach(function (block) {
    var table = block.querySelector(".qual-table");
    var options = block.querySelectorAll(".baseline-switch-option");
    if (!table) return;

    options.forEach(function (option) {
      option.addEventListener("click", function () {
        table.classList.toggle("show-regression", option.dataset.group === "regression");
        options.forEach(function (other) {
          other.classList.toggle("is-active", other === option);
        });
      });
    });
  });

  // Tabs first: a deep link (#qp-re10k-scenes) unhides its panel here, so any
  // viewer inside is already visible when it initialises and its own
  // IntersectionObserver can see it normally.
  document.querySelectorAll(".qual-tabs").forEach(initQualTabs);
  document.querySelectorAll(".traj-viewer").forEach(initTrajViewer);
});

/* ---------------- Video comparison grids ----------------
   Tiles are built from a JSON scene list so cherry-picking later is a one-line
   edit. Only tiles near the viewport hold video sources: with ~158 scenes x 4
   videos, loading them all would stall the browser. */

var VCMP_LABEL = {
  reconsplat: "ReconSplat",
  depthsplat: "DepthSplat",
  mvsplat360: "MVSplat360",
  latentsplat: "latentSplat"
};

function vcmpUrl(scene, method, kind) {
  return scene.dir + "/" + scene.id + "/" + scene.id + "_" + method + "_" + kind + ".mp4";
}

/* Wipe-divider behaviour for a .vcmp-stack. Shared by the video grids and the
   ScanNet++ image comparison so the two cannot drift apart. The stack owns
   ArrowLeft/ArrowRight/Home/End; any carousel wrapping it must therefore ignore
   arrow keys when focus is inside a stack. */
function attachWipe(stack) {
  function setPos(pct) {
    pct = Math.max(0, Math.min(100, pct));
    stack.style.setProperty("--pos", pct + "%");
    stack.setAttribute("aria-valuenow", Math.round(pct));
  }
  function setFromX(clientX) {
    var r = stack.getBoundingClientRect();
    setPos(((clientX - r.left) / r.width) * 100);
  }

  var dragging = false;
  stack.addEventListener("pointerdown", function (e) {
    dragging = true;
    stack.setPointerCapture(e.pointerId);
    setFromX(e.clientX);
  });
  stack.addEventListener("pointermove", function (e) {
    if (dragging) setFromX(e.clientX);
  });
  stack.addEventListener("pointerup", function () { dragging = false; });
  stack.addEventListener("pointercancel", function () { dragging = false; });
  stack.addEventListener("keydown", function (e) {
    var cur = parseFloat(stack.getAttribute("aria-valuenow")) || 50;
    var step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") cur -= step;
    else if (e.key === "ArrowRight") cur += step;
    else if (e.key === "Home") cur = 0;
    else if (e.key === "End") cur = 100;
    else return;
    e.preventDefault();
    setPos(cur);
  });
}

function initVideoGrid(grid) {
  var scenes;
  try {
    scenes = JSON.parse(grid.dataset.scenes);
  } catch (e) {
    return;
  }
  if (!scenes || !scenes.length) return;

  grid.style.setProperty("--ar", grid.dataset.ar || "1 / 1");
  var method = grid.dataset.method || "depthsplat";
  var tiles = [];

  // Grab the baseline switcher BEFORE inserting the carousel bar: the lookup is
  // positional (previousElementSibling), so inserting anything above the grid
  // first would silently break the switcher.
  var switcher = grid.previousElementSibling;

  // Carousel window: only this many tiles are visible (and loaded) at a time.
  // Each tile holds FOUR videos (ours/baseline x color/depth), so the window
  // size -- not the scene count -- is what determines how much decoding the
  // browser is doing. 5 tiles = 20 simultaneous videos.
  var WIN = Math.min(parseInt(grid.dataset.window, 10) || 5, scenes.length);
  var start = 0;          // index of the leftmost visible scene
  var inView = false;     // is the whole carousel on screen?

  scenes.forEach(function (scene) {
    var fig = document.createElement("figure");
    fig.className = "vcmp";
    fig.innerHTML =
      '<div class="vcmp-stack" tabindex="0" role="slider" aria-label="Comparison wipe position"' +
      ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">' +
        '<div class="vcmp-pane">' +
          '<video class="v-b" data-kind="color" muted loop playsinline preload="none"></video>' +
          '<div class="vcmp-clip"><video class="v-a" data-kind="color" muted loop playsinline preload="none"></video></div>' +
        '</div>' +
        '<div class="vcmp-pane">' +
          '<video class="v-b" data-kind="depth" muted loop playsinline preload="none"></video>' +
          '<div class="vcmp-clip"><video class="v-a" data-kind="depth" muted loop playsinline preload="none"></video></div>' +
        '</div>' +
        '<div class="vcmp-divider"><span class="vcmp-handle">&#9664;&#9654;</span></div>' +
        '<div class="vcmp-tag vcmp-tag-a">ReconSplat</div>' +
        '<div class="vcmp-tag vcmp-tag-b"></div>' +
      '</div>' +
      '<figcaption>' + scene.id + '</figcaption>';

    var stack = fig.querySelector(".vcmp-stack");
    var tile = {
      scene: scene,
      fig: fig,
      stack: stack,
      tagB: fig.querySelector(".vcmp-tag-b"),
      aVids: fig.querySelectorAll(".v-a"),
      bVids: fig.querySelectorAll(".v-b"),
      loaded: false
    };

    attachWipe(stack);

    grid.appendChild(fig);
    tiles.push(tile);
  });

  function applyLabels(tile) {
    tile.tagB.textContent = VCMP_LABEL[method] || method;
  }

  function load(tile) {
    tile.aVids.forEach(function (v) {
      v.src = vcmpUrl(tile.scene, "reconsplat", v.dataset.kind);
      v.load();
    });
    tile.bVids.forEach(function (v) {
      v.src = vcmpUrl(tile.scene, method, v.dataset.kind);
      v.load();
    });
    tile.loaded = true;
    tile.loadedMethod = method;
    playAll(tile);
  }

  function playAll(tile) {
    var vids = [].concat([].slice.call(tile.aVids), [].slice.call(tile.bVids));
    vids.forEach(function (v) {
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    });
    // Durations match within a scene, so a light drift correction keeps the
    // wipe frame-aligned across all four videos.
    var ref = tile.aVids[0];
    if (ref && !ref._sync) {
      ref._sync = true;
      ref.addEventListener("timeupdate", function () {
        vids.forEach(function (v) {
          if (v !== ref && v.readyState > 1 && Math.abs(v.currentTime - ref.currentTime) > 0.12) {
            v.currentTime = ref.currentTime;
          }
        });
      });
    }
  }

  function unload(tile) {
    [].concat([].slice.call(tile.aVids), [].slice.call(tile.bVids)).forEach(function (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    tile.loaded = false;
  }

  function pauseAll(tile) {
    [].concat([].slice.call(tile.aVids), [].slice.call(tile.bVids)).forEach(function (v) {
      v.pause();
    });
  }

  /* ---- carousel over a virtual ring of scenes ----------------------------
     All tiles stay in the DOM; only a window of WIN consecutive scenes (mod N)
     is shown. Stepping by one therefore keeps WIN-1 tiles exactly as they were
     -- same DOM nodes, same <video> elements, still playing -- and only the
     tile entering the window has to load. Reassigning sources to a fixed set of
     slots instead would restart all five videos on every click.

     `order` is set explicitly because a window can wrap (e.g. 33,34,0,1,2) and
     flex/grid would otherwise lay those out in DOM order. */
  function windowIndices() {
    var out = [];
    for (var k = 0; k < WIN; k++) out.push((start + k) % scenes.length);
    return out;
  }

  function apply() {
    var vis = windowIndices();
    var visSet = {};
    vis.forEach(function (idx, k) { visSet[idx] = k; });

    // One tile either side of the window is kept loaded but paused, so stepping
    // shows video immediately instead of a black tile while it buffers.
    var prefetch = {};
    if (scenes.length > WIN) {
      prefetch[(start - 1 + scenes.length) % scenes.length] = true;
      prefetch[(start + WIN) % scenes.length] = true;
    }

    tiles.forEach(function (tile, i) {
      var visible = visSet.hasOwnProperty(i);
      tile.fig.classList.toggle("is-off", !visible);
      if (visible) tile.fig.style.order = visSet[i];

      var want = visible || prefetch[i];
      if (want && inView) {
        applyLabels(tile);
        if (!tile.loaded || tile.loadedMethod !== method) load(tile);
        if (visible) playAll(tile);
        else pauseAll(tile);
      } else if (tile.loaded) {
        unload(tile);
      }
    });

    if (counter) {
      var first = vis[0] + 1;
      var last = vis[vis.length - 1] + 1;
      var range;
      if (WIN >= scenes.length) {
        range = "all " + scenes.length;
      } else if (first <= last) {
        range = first + "–" + last;
      } else {
        // Window straddles the end of the ring: "35–4 of 35" reads as nonsense,
        // so spell both runs out -- collapsing either to a single number when it
        // is only one scene long ("35, 1–4", not "35–35, 1–4").
        var head = first === scenes.length ? String(first) : first + "–" + scenes.length;
        var tail = last === 1 ? "1" : "1–" + last;
        range = head + ", " + tail;
      }
      counter.textContent = "scenes " + range + " of " + scenes.length;
    }
  }

  function step(delta) {
    start = (start + delta + scenes.length) % scenes.length;
    apply();
  }

  // ---- controls ----
  var counter = null;
  if (scenes.length > WIN) {
    var bar = document.createElement("div");
    bar.className = "vcar-bar";
    bar.innerHTML =
      '<button type="button" class="vcar-btn vcar-prev" aria-label="Previous scene">&#10094;</button>' +
      '<span class="vcar-counter" aria-live="polite"></span>' +
      '<button type="button" class="vcar-btn vcar-next" aria-label="Next scene">&#10095;</button>';
    grid.parentNode.insertBefore(bar, grid);
    counter = bar.querySelector(".vcar-counter");
    bar.querySelector(".vcar-prev").addEventListener("click", function () { step(-1); });
    bar.querySelector(".vcar-next").addEventListener("click", function () { step(1); });

    // Arrow keys, but only when focus is NOT inside a tile: the wipe divider
    // already owns ArrowLeft/ArrowRight (and Home/End) on .vcmp-stack, and
    // stealing them would break it. Same reason there is no swipe gesture --
    // a horizontal drag on a tile is the wipe.
    grid.parentNode.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest(".vcmp-stack")) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else return;
      e.preventDefault();
    });
  }

  tiles.forEach(applyLabels);

  // Gate the whole carousel on visibility, so a page load does not start
  // decoding video in a section the reader has not reached.
  if (window.IntersectionObserver) {
    new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          inView = entry.isIntersecting;
          apply();
        });
      },
      { rootMargin: "200px 0px" }
    ).observe(grid);
  } else {
    inView = true;
  }

  apply();

  // ---- baseline switcher (one per grid, applies to every tile) ----
  if (switcher && switcher.classList.contains("vswitch")) {
    var opts = switcher.querySelectorAll(".baseline-switch-option");
    opts.forEach(function (opt) {
      opt.addEventListener("click", function () {
        method = opt.dataset.method;
        grid.dataset.method = method;
        opts.forEach(function (o) { o.classList.toggle("is-active", o === opt); });
        tiles.forEach(function (tile) {
          applyLabels(tile);
          if (tile.loaded) {
            tile.bVids.forEach(function (v) {
              v.src = vcmpUrl(tile.scene, method, v.dataset.kind);
              v.load();
            });
            tile.loadedMethod = method;
            playAll(tile);
          }
        });
      });
    });
  }
}

$(document).ready(function () {
  document.querySelectorAll(".vgrid").forEach(initVideoGrid);
});

/* ---------------- Image wipe comparison + view carousel -------------------
   One comparison tile (color over depth, ours wiped against ground truth) plus
   prev/next over a ring of example views. Reuses the .vcmp-* markup and CSS from
   the video grids -- only the media element differs -- and the shared
   attachWipe() for the divider, so both widgets behave identically.

   Unlike the video carousel this swaps the four <img> sources in place rather
   than keeping a DOM node per view: images are small and preloaded, so there is
   no buffering to hide and no reason to hold 5x4 elements. */
function initImgCompare(el) {
  var views;
  try {
    views = JSON.parse(el.dataset.views);
  } catch (e) {
    return;
  }
  if (!views || !views.length) return;

  var base = (el.dataset.base || "").replace(/\/$/, "");
  var idx = 0;
  var preloaded = false;

  var url = function (view, kind) { return base + "/" + view + "_" + kind + ".png"; };

  el.innerHTML =
    '<div class="vcar-bar">' +
      '<button type="button" class="vcar-btn imgcmp-prev" aria-label="Previous view">&#10094;</button>' +
      '<span class="vcar-counter" aria-live="polite"></span>' +
      '<button type="button" class="vcar-btn imgcmp-next" aria-label="Next view">&#10095;</button>' +
    '</div>' +
    '<div class="vcmp-stack" tabindex="0" role="slider" aria-label="Comparison wipe position"' +
    ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">' +
      // draggable="false" matters: <img> is natively draggable, so without it a
      // press-and-drag starts an HTML5 image drag (complete with ghost image)
      // instead of moving the wipe. <video> has no such default, which is why the
      // video grids never needed this.
      '<div class="vcmp-pane">' +
        '<img class="v-b" draggable="false" data-kind="color_gt" alt="Ground-truth color">' +
        '<div class="vcmp-clip"><img class="v-a" draggable="false" data-kind="color" alt="ReconSplat color"></div>' +
      '</div>' +
      '<div class="vcmp-pane">' +
        '<img class="v-b" draggable="false" data-kind="depth_gt" alt="Ground-truth depth">' +
        '<div class="vcmp-clip"><img class="v-a" draggable="false" data-kind="depth" alt="ReconSplat depth"></div>' +
      '</div>' +
      '<div class="vcmp-divider"><span class="vcmp-handle">&#9664;&#9654;</span></div>' +
      '<div class="vcmp-tag vcmp-tag-a">ReconSplat</div>' +
      '<div class="vcmp-tag vcmp-tag-b">Ground truth</div>' +
    '</div>' +
    '<p class="imgcmp-caption">Drag to wipe &mdash; <span class="imgcmp-modality">Color</span> above, ' +
      '<span class="imgcmp-modality">Depth</span> below.</p>';

  var stack = el.querySelector(".vcmp-stack");
  var counter = el.querySelector(".vcar-counter");
  var imgs = el.querySelectorAll(".vcmp-pane img");
  stack.style.setProperty("--ar", el.dataset.ar || "1 / 1");
  attachWipe(stack);

  function paint() {
    imgs.forEach(function (img) { img.src = url(views[idx], img.dataset.kind); });
    counter.textContent = "view " + (idx + 1) + " of " + views.length;
  }

  function step(delta) {
    idx = (idx + delta + views.length) % views.length;
    paint();
  }

  el.querySelector(".imgcmp-prev").addEventListener("click", function () { step(-1); });
  el.querySelector(".imgcmp-next").addEventListener("click", function () { step(1); });

  // Arrow keys move between views, but the divider owns them while it has focus.
  el.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest(".vcmp-stack")) return;
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else return;
    e.preventDefault();
  });

  paint();

  // Preload the rest on first scroll-into-view, so stepping never flashes and
  // the page load does not pull images the reader may never reach.
  function preload() {
    if (preloaded) return;
    preloaded = true;
    views.forEach(function (v) {
      ["color", "color_gt", "depth", "depth_gt"].forEach(function (k) {
        new Image().src = url(v, k);
      });
    });
  }
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          preload();
          io.disconnect();
        }
      });
    }, { rootMargin: "300px 0px" });
    io.observe(el);
  } else {
    preload();
  }
}

$(document).ready(function () {
  document.querySelectorAll(".imgcmp").forEach(initImgCompare);
});

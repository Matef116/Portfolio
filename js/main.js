/* =========================================================
   Mohamed Atef — interaction layer
   One orchestrated hero moment; everything else stays quiet.
   ========================================================= */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Mobile nav ---------- */
const navToggle = document.getElementById('nav-toggle');
const mainNav = document.getElementById('main-nav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('is-open');
    navToggle.classList.toggle('is-active', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen);
  });

  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('is-open');
      navToggle.classList.remove('is-active');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- Header state on scroll ---------- */
const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
  let scrolled = false;
  const updateHeader = () => {
    const next = window.scrollY > 10;
    if (next !== scrolled) {
      siteHeader.classList.toggle('is-scrolled', next);
      scrolled = next;
    }
  };
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}

/* The hero entrance sequence is pure CSS (see @keyframes hero-in).
   Nothing here needs to run for the hero to be visible. */

/* ---------- Scroll-driven parallax on the hero portrait + sail ----------
   transform-only, rAF-throttled, and it stops once the hero is off screen. */
const heroSection = document.querySelector('.hero');
/* Parallax targets the <img>, while the entrance animation owns the
   .hero-media wrapper — so the two never fight over `transform`. */
const heroPortrait = document.querySelector('.hero-media img');

if (heroSection && heroPortrait && !prefersReducedMotion && window.matchMedia('(min-width: 901px)').matches) {
  let ticking = false;

  const applyParallax = () => {
    const rect = heroSection.getBoundingClientRect();
    if (rect.bottom > 0) {
      const progress = Math.min(Math.max(-rect.top / rect.height, 0), 1);
      heroPortrait.style.transform = `translate3d(0, ${progress * 34}px, 0)`;
    }
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(applyParallax);
    }
  }, { passive: true });
}

/* ---------- Scroll reveal ---------- */
const revealTargets = document.querySelectorAll(
  '.card, .step, .work-card, .glance-item, .value-card, .why-card, .built-card, ' +
  '.tool-tile, .badge-card, .domain-tile, .story-stage, .info-row, ' +
  '.photo-grid .photo-item, .section-head, .sail-story-inner, .why-tagline, ' +
  '.meta-item, .mandate-list li, .execution-list li, .results-list li'
);

const staggerCounts = new Map();
revealTargets.forEach(el => {
  el.classList.add('reveal');
  if (!prefersReducedMotion) {
    const parent = el.parentElement;
    const count = staggerCounts.get(parent) || 0;
    staggerCounts.set(parent, count + 1);
    el.style.transitionDelay = `${Math.min(count, 7) * 65}ms`;
  }
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

revealTargets.forEach(el => observer.observe(el));

/* ---------- Count-up on stat figures ---------- */
function animateCount(el) {
  /* Guard against re-entry: a second pass would read a half-counted
     value as its target and permanently lock the wrong number in. */
  if (el.dataset.counting) return;
  const raw = el.dataset.rawValue || el.textContent.trim();
  el.dataset.rawValue = raw;
  el.dataset.counting = '1';

  const match = raw.match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) { delete el.dataset.counting; return; }

  const [, prefix, numStr, suffix] = match;
  const target = parseFloat(numStr.replace(/,/g, ''));
  if (isNaN(target)) return;

  const hasComma = numStr.includes(',');
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
  const duration = 1300;
  const start = performance.now();

  /* These are real portfolio figures — the true value must ALWAYS end up
     on screen. requestAnimationFrame is paused in background tabs, which
     would otherwise freeze the counter on a wrong intermediate number, so
     a timer-based safety net settles it regardless. */
  const settle = () => { el.textContent = raw; };
  const safety = setTimeout(settle, duration + 500);

  if (document.hidden) { clearTimeout(safety); settle(); return; }

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;
    const formatted = hasComma
      ? current.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
      : current.toFixed(decimals);
    el.textContent = `${prefix}${formatted}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      clearTimeout(safety);
      settle();
    }
  }
  requestAnimationFrame(tick);
}

if (!prefersReducedMotion) {
  const counterContainers = document.querySelectorAll('.glance-grid, .hero-rail, .work-card .stats');
  const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('strong').forEach(animateCount);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  counterContainers.forEach(el => counterObserver.observe(el));
}

/* ---------- Photo lightbox, with prev/next through the same gallery ---------- */
const galleryImages = document.querySelectorAll('.photo-grid .photo-item');
if (galleryImages.length) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close">&times;</button>
    <button class="lightbox-nav lightbox-prev" aria-label="Previous photo">&larr;</button>
    <img class="lightbox-image" alt="">
    <button class="lightbox-nav lightbox-next" aria-label="Next photo">&rarr;</button>
    <div class="lightbox-counter"></div>`;
  document.body.appendChild(overlay);

  const lightboxImg = overlay.querySelector('.lightbox-image');
  const closeBtn = overlay.querySelector('.lightbox-close');
  const prevBtn = overlay.querySelector('.lightbox-prev');
  const nextBtn = overlay.querySelector('.lightbox-next');
  const counter = overlay.querySelector('.lightbox-counter');
  const gallery = Array.from(galleryImages);
  let currentIndex = 0;

  // data-full points at a full-resolution WebP. The grid <img> now carries a
  // display-sized source (~882px) for page-load speed, which would look soft
  // blown up to full screen, so the lightbox opens the large version instead.
  const showAt = index => {
    currentIndex = (index + gallery.length) % gallery.length;
    const img = gallery[currentIndex];
    lightboxImg.src = img.dataset.full || img.src;
    lightboxImg.alt = img.alt || '';
    counter.textContent = `${currentIndex + 1} / ${gallery.length}`;
  };
  const openLightbox = index => {
    showAt(index);
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };
  const closeLightbox = () => {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  gallery.forEach((img, index) => img.addEventListener('click', () => openLightbox(index)));
  closeBtn.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', () => showAt(currentIndex - 1));
  nextBtn.addEventListener('click', () => showAt(currentIndex + 1));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeLightbox(); });
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') showAt(currentIndex - 1);
    else if (e.key === 'ArrowRight') showAt(currentIndex + 1);
  });

  // single-photo galleries don't need prev/next controls
  if (gallery.length < 2) {
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    counter.style.display = 'none';
  }
}

/* ---------- Section rail scrollspy (About page) ---------- */
const tocLinks = document.querySelectorAll('.toc-link');
if (tocLinks.length) {
  const tocMap = new Map();
  tocLinks.forEach(link => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (target) tocMap.set(target, link);
  });

  // A thin band at the vertical center of the viewport, rather than any
  // intersection at all -- otherwise two adjacent short sections can both
  // register as "intersecting" near a scroll boundary and the highlight
  // flickers between them.
  const tocObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const link = tocMap.get(entry.target);
      if (!link) return;
      tocLinks.forEach(l => l.classList.remove('is-active'));
      link.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

  tocMap.forEach((link, target) => tocObserver.observe(target));
}

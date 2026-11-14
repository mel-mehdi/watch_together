// Scroll reveal: sections below the fold rise into view as you scroll to them.
// Styles live in css/motion.css. Does nothing for people who prefer reduced motion.
(function () {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    // [selector, delay between items in a group, in seconds]
    const groups = [
        ['.features h2', 0],
        ['.features-grid .feature-card', 0.08],
    ];

    const targets = [];
    groups.forEach(([selector, step]) => {
        document.querySelectorAll(selector).forEach((el, i) => {
            // Only hide what is below the fold, so nothing visible blinks on load
            if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
            el.classList.add('wt-reveal');
            el.style.setProperty('--wt-delay', `${(i % 3) * step}s`);
            targets.push(el);
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            el.classList.add('is-visible');
            observer.unobserve(el);
            // Once shown, hand control back to the element's own hover styles
            el.addEventListener('transitionend', () => {
                el.classList.remove('wt-reveal', 'is-visible');
                el.style.removeProperty('--wt-delay');
            }, { once: true });
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    targets.forEach((el) => observer.observe(el));
})();

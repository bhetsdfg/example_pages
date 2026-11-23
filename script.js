// Shibuya gyaru mood: navbar reaction + little sparkle interaction
document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.querySelector('.navbar');

  const updateNavbar = () => {
    const scrolled = window.scrollY > 30;
    navbar.classList.toggle('is-scrolled', scrolled);
  };

  updateNavbar();
  window.addEventListener('scroll', updateNavbar, { passive: true });

  // Add a tiny click bounce to the main call-to-action links.
  document.querySelectorAll('.btn, .contact-item').forEach((link) => {
    link.addEventListener('click', () => {
      link.classList.add('is-clicked');
      window.setTimeout(() => link.classList.remove('is-clicked'), 220);
    });
  });

  console.log('♡ Welcome to coconose — stay cute, stay iconic! ♡');
});

const demoModal = document.getElementById('demoModal');
const demoVideo = document.getElementById('demoVideo');
const demoTriggers = document.querySelectorAll('.js-demo-modal');

const closeDemoModal = () => {
  if (!demoModal) {
    return;
  }
  demoModal.classList.remove('is-open');
  demoModal.setAttribute('aria-hidden', 'true');
  if (demoVideo) {
    demoVideo.pause();
    demoVideo.removeAttribute('src');
    demoVideo.load();
  }
};

const openDemoModal = (videoSrc) => {
  if (!demoModal || !demoVideo || !videoSrc) {
    return;
  }
  demoVideo.setAttribute('src', videoSrc);
  demoModal.classList.add('is-open');
  demoModal.setAttribute('aria-hidden', 'false');
  demoVideo.play().catch(() => {});
};

demoTriggers.forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    const videoSrc = trigger.getAttribute('data-video');
    openDemoModal(videoSrc);
  });
});

if (demoModal) {
  demoModal.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) {
      closeDemoModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDemoModal();
  }
});

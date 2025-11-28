
function toggleMenu(){
  var el = document.getElementById('mobileMenu');
  if(!el) return;
  el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
}

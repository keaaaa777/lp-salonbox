
function toggleMenu(){
  var el = document.getElementById('mobileMenu');
  if(!el) return;
  el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
}

function appendLpParamToLinks(){
  var body = document.body;
  var lp = body && body.dataset ? body.dataset.lp : '';
  if(!lp) return;
  var links = document.querySelectorAll('a[href]');
  links.forEach(function(link){
    var href = link.getAttribute('href');
    if(!href || href.indexOf('javascript:') === 0 || href.indexOf('#') === 0) return;
    var url;
    try{
      url = new URL(href, window.location.href);
    }catch(_){
      return;
    }
    var path = url.pathname || '';
    var isContact = /\/contact\/?$/.test(path) || /\/contact\/index\.html$/.test(path);
    var isApply = /\/apply\/?$/.test(path) || /\/apply\/index\.html$/.test(path);
    if(!isContact && !isApply) return;
    url.searchParams.set('lp', lp);
    if(href.indexOf('http://') === 0 || href.indexOf('https://') === 0 || href.indexOf('//') === 0){
      link.setAttribute('href', url.toString());
    }else{
      link.setAttribute('href', url.pathname + url.search + url.hash);
    }
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', appendLpParamToLinks);
}else{
  appendLpParamToLinks();
}

// Smooth scroll + sidebar active state + slider + modal

const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => [...el.querySelectorAll(q)];

const sections = ["top","features","economy","craft","merge","token","roadmap","faq"];

function scrollToId(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.scrollIntoView({behavior:"smooth", block:"start"});
}

$$(".side-item").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$(".side-item").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.target;
    scrollToId(target);
  });
});

function setActiveByScroll(){
  const y = window.scrollY;
  let current = "top";
  for(const id of sections){
    const el = document.getElementById(id);
    if(!el) continue;
    const top = el.offsetTop - 120;
    if(y >= top) current = id;
  }
  $$(".side-item").forEach(b=>{
    b.classList.toggle("active", b.dataset.target === current);
  });
}
window.addEventListener("scroll", setActiveByScroll, {passive:true});
setActiveByScroll();

// Slider
const slides = $$(".slide", $("#sliderFrame"));
const dotsWrap = $("#sliderDots");
let idx = 0;

function renderDots(){
  dotsWrap.innerHTML = "";
  slides.forEach((_, i)=>{
    const d = document.createElement("button");
    d.className = "dotbtn" + (i===idx ? " active" : "");
    d.setAttribute("aria-label", `slide ${i+1}`);
    d.addEventListener("click", ()=>setSlide(i));
    dotsWrap.appendChild(d);
  });
}
function setSlide(i){
  idx = (i + slides.length) % slides.length;
  slides.forEach((s, n)=>s.classList.toggle("is-active", n===idx));
  renderDots();
}
renderDots();
setSlide(0);

// Auto-advance
let timer = setInterval(()=>setSlide(idx+1), 6500);
["mouseenter","focusin"].forEach(ev=>{
  $("#sliderFrame").addEventListener(ev, ()=>{ clearInterval(timer); });
});
["mouseleave","focusout"].forEach(ev=>{
  $("#sliderFrame").addEventListener(ev, ()=>{ timer = setInterval(()=>setSlide(idx+1), 6500); });
});

// Modal buy
const modal = $("#buyModal");
function openModal(){
  modal.classList.add("show");
  modal.setAttribute("aria-hidden","false");
}
function closeModal(){
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden","true");
}
// Phantom detection (demo only)
const phantomStatus = $("#phantomStatus");
const btnCheckPhantom = $("#btnCheckPhantom");
const btnConnectPhantom = $("#btnConnectPhantom");

function renderPhantomStatus() {
  if (!phantomStatus) return;
  const provider = window?.solana;
  if (provider && provider.isPhantom) {
    phantomStatus.textContent =
      "Phantom detected (demo only). Wallet connection and transactions are not enabled in this pre-launch build.";
    phantomStatus.classList.remove("warn");
  } else {
    phantomStatus.textContent =
      "Phantom wallet not detected. Install Phantom and reopen the modal, or tap Get Phantom.";
    phantomStatus.classList.add("warn");
  }
}

if (btnCheckPhantom) {
  btnCheckPhantom.addEventListener("click", renderPhantomStatus);
}

if (btnConnectPhantom) {
  btnConnectPhantom.addEventListener("click", async ()=>{
    const provider = window?.solana;
    if (!provider || !provider.isPhantom) {
      if (phantomStatus) {
        phantomStatus.textContent = "Phantom not detected. Install Phantom first (demo only).";
        phantomStatus.classList.add("warn");
      }
      return;
    }
    try {
      await provider.connect({ onlyIfTrusted: false });
      if (phantomStatus) {
        phantomStatus.textContent = "Phantom connected (demo only). No transactions are executed.";
        phantomStatus.classList.remove("warn");
      }
    } catch (err) {
      if (phantomStatus) {
        phantomStatus.textContent = "Connection canceled or failed (demo only).";
        phantomStatus.classList.add("warn");
      }
    }
  });
}

function openModalWithPhantomCheck() {
  renderPhantomStatus();
  openModal();
}

$("#buyBtnTop")?.addEventListener("click", openModalWithPhantomCheck);
$("#buyBtnHero")?.addEventListener("click", openModalWithPhantomCheck);
$("#buyBtnToken")?.addEventListener("click", openModalWithPhantomCheck);

modal?.addEventListener("click", (e)=>{
  if(e.target && e.target.dataset.close) closeModal();
});
window.addEventListener("keydown", (e)=>{
  if(e.key === "Escape") closeModal();
});

// Footer year
const year = $("#year");
if (year) year.textContent = new Date().getFullYear();

// Fake YouTube IFrame API: simulates a clock so clip logic can be tested without real video.
(function(){
  const S={UNSTARTED:-1,ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5};
  function Player(id,opts){
    const el=document.getElementById(id); const f=document.createElement('div'); f.id=id; f.className='fake'; f.style.cssText='position:absolute;inset:0;color:#fff;display:grid;place-items:center;font:20px monospace'; el.replaceWith(f);
    this.t=0; this.st=S.UNSTARTED; this.rate=1; this.log=[]; this.f=f; window.__fake=this;
    let last=performance.now();
    setInterval(()=>{const n=performance.now(); if(this.st===S.PLAYING) this.t+=(n-last)/1000*this.rate; last=n; f.textContent=`FAKE ${this.t.toFixed(1)}s st=${this.st} x${this.rate}`;},20);
    setTimeout(()=>opts.events.onReady({target:this}),50);
    this.oc=opts.events.onStateChange||(()=>{});
  }
  Player.prototype={
    seekTo(s){this.t=s;this.log.push(['seek',+s.toFixed(2)]);},
    playVideo(){this.st=S.PLAYING;this.log.push(['play']);this.oc({data:1});},
    pauseVideo(){this.st=S.PAUSED;this.log.push(['pause',+this.t.toFixed(2)]);this.oc({data:2});},
    cueVideoById(o){this.t=o.startSeconds||0;this.st=S.CUED;},
    setPlaybackRate(r){this.rate=r;this.log.push(['rate',r]);},
    getPlaybackRate(){return this.rate;}, getCurrentTime(){return this.t;}, getPlayerState(){return this.st;}
  };
  window.YT={Player,PlayerState:S}; setTimeout(()=>window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady(),0);
})();

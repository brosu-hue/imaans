// HUD stylesheet (injected once by ui.js). Mobile-first, safe-area aware. IMAANS brand: ink/black glass,
// the logo's gold gradient (#f6dd8c → #d9ab48 → #a97a1f), warm ivory #faf7f2, sale red #b4342a;
// Cinzel (wordmark caps) · Marcellus (headings) · Jost (UI).
// Old-WebKit safe: no `inset`, no :is()/:where(), no `gap` reliance for layout-critical flex rows on
// iOS < 14.5 (grid gaps are fine), -webkit-backdrop-filter, :focus-visible kept in its own rules.
import { STACKS } from './fonts.js';

export const CSS = /* css */`
#me-ui{
  --ivory:#faf7f2; --ivory2:rgba(250,247,242,.76); --ivory3:rgba(250,247,242,.52); --ivory4:rgba(250,247,242,.16);
  --gold:#d9ab48; --gold-hi:#f0d58e; --gold-brand:#b08d57; --gold-deep:#a97a1f;
  --gold-grad:linear-gradient(180deg,#f6dd8c 0%,#d9ab48 55%,#a97a1f 100%);
  --gold-btn:linear-gradient(180deg,#f7e3a0 0%,#e0b85a 52%,#b98a2e 100%);
  --ink:#050506; --black:#1b1b1b; --sale:#b4342a;
  --glass:rgba(14,13,15,.6); --glass-hi:rgba(11,10,12,.9); --line:rgba(250,247,242,.12); --gline:rgba(217,171,72,.34);
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px);
  --sal:env(safe-area-inset-left,0px); --sar:env(safe-area-inset-right,0px);
  --g:12px; --bar:56px; --ease:cubic-bezier(.2,.8,.2,1); --spring:cubic-bezier(.34,1.56,.64,1);
  --display:${STACKS.display}; --head:${STACKS.head}; --sans:${STACKS.sans};
  position:fixed;top:0;left:0;right:0;bottom:0;z-index:10;pointer-events:none;
  font-family:var(--sans);font-size:15px;line-height:1.4;color:var(--ivory);
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;
  -webkit-text-size-adjust:100%;text-size-adjust:100%;
}
#me-ui *,#me-ui *::before,#me-ui *::after{box-sizing:border-box}
#me-ui button{border:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;-webkit-appearance:none;appearance:none}
#me-ui a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
/* class-level reset so every component rule below can override it */
.me-btn,.me-bagbtn,.me-brand,.me-x,.me-back,.me-swb,.me-szb,.me-go,.me-stop,.me-mi,.me-q,.me-cta,.me-rm,.me-lk-i,.me-qty button{font-family:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;letter-spacing:inherit;color:inherit;background:none;padding:0}
#me-ui svg{display:block;flex:none}
#me-ui button:focus-visible,#me-ui a:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
#me-ui input:focus-visible{outline:2px solid var(--gold);outline-offset:4px;border-radius:999px}
#me-ui .me-i{pointer-events:auto}
#me-ui .me-vh{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);border:0;white-space:nowrap}
#me-ui .glass{background:var(--glass);border:1px solid var(--line);
  -webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);
  box-shadow:0 12px 32px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.06)}
#me-ui.me-lowfx .glass{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(12,11,13,.84)}
#me-ui.me-lowfx .me-panel{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(10,9,11,.96)}
.me-crown{display:block}
.me-gold{background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--gold)}

/* ---------- top row ---------- */
.me-top{position:absolute;top:calc(var(--sat) + 10px);left:calc(var(--sal) + var(--g));right:calc(var(--sar) + var(--g));
  display:flex;align-items:flex-start;justify-content:space-between;
  transition:opacity .5s var(--ease),transform .6s var(--ease)}
.me-brand{height:44px;display:flex;align-items:center;padding:0 18px 0 15px;border-radius:999px;min-width:0;white-space:nowrap;margin-right:8px}
.me-brand .me-crown{width:21px;height:15px;color:var(--gold);margin:-2px 10px 0 0;filter:drop-shadow(0 0 5px rgba(240,213,142,.45))}
.me-word{font-family:var(--display);font-weight:600;font-size:18px;letter-spacing:.16em;line-height:1;padding-top:2px;margin-right:-.16em;
  background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--gold)}
.me-sub{display:none;font-size:10px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--ivory2);padding-left:13px;margin-left:14px;border-left:1px solid var(--gline);line-height:18px}
.me-annbar{display:none}
.me-bagbtn{position:relative;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;
  transition:box-shadow .25s var(--ease)}
.me-bagbtn svg{width:21px;height:21px;transition:transform .18s var(--ease)}
.me-bagbtn:active svg{transform:scale(.88)}
.me-badge{position:absolute;top:-3px;right:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--gold-btn);color:var(--ink);
  font-size:11px;font-weight:500;line-height:19px;text-align:center;box-shadow:0 0 0 2px rgba(11,10,12,.9),0 0 12px rgba(240,213,142,.5);
  transform:scale(0);transition:transform .35s var(--spring)}
.me-bagbtn.has .me-badge{transform:scale(1)}
.me-bagbtn.bump svg{animation:me-bump .55s var(--spring)}
.me-bagbtn.bump .me-badge{animation:me-badge .5s var(--spring)}
/* phones: the announcement drops in under the top row for a few seconds */
.me-annchip{position:absolute;top:calc(var(--sat) + 62px);left:calc(var(--sal) + var(--g));right:calc(var(--sar) + var(--g));display:flex;justify-content:center;
  opacity:0;transform:translateY(-6px);transition:opacity .5s var(--ease),transform .6s var(--ease);pointer-events:none}
.me-annchip span{max-width:100%;padding:7px 14px;border-radius:14px;background:rgba(11,10,12,.62);border:1px solid var(--gline);
  font-size:12px;line-height:1.35;letter-spacing:.02em;color:var(--ivory);text-align:center}
.me-annchip.is-on{opacity:1;transform:none}
#me-ui.is-card .me-annchip,#me-ui.is-sheet .me-annchip{opacity:0}

/* ---------- bottom bar ---------- */
.me-bar{position:absolute;left:50%;bottom:calc(var(--sab) + var(--g));transform:translateX(-50%);
  width:calc(100% - 2 * var(--g) - var(--sal) - var(--sar));max-width:470px;height:var(--bar);border-radius:999px;
  display:flex;align-items:center;padding:5px;
  transition:transform .5s var(--ease),opacity .4s var(--ease)}
.me-btn{height:44px;min-width:44px;padding:0 14px;margin-right:2px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex:none;
  font-size:12px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;line-height:1;white-space:nowrap;
  transition:background-color .25s var(--ease),color .25s var(--ease),transform .14s var(--ease)}
.me-btn svg{width:18px;height:18px;margin-right:7px}
.me-btn.me-sq svg{margin-right:0}
.me-btn .lbl{padding-top:1px}
.me-btn:active{transform:scale(.94)}
.me-btn.is-on{background:var(--gold-btn);color:var(--ink)}
.me-btn.me-sq{width:44px;padding:0;margin-right:0}
.me-sep{width:1px;height:22px;background:var(--line);flex:none;margin:0 2px}
.me-magic{flex:1 1 auto;min-width:0;height:44px;display:flex;align-items:center;padding:0 10px 0 9px;border-radius:999px}
.me-magic svg{width:19px;height:19px;color:var(--gold);flex:none;margin-right:8px;transition:filter .3s,transform .3s var(--spring)}
.me-magic.hot svg{filter:drop-shadow(0 0 6px rgba(240,213,142,.9));transform:scale(1.12) rotate(8deg)}
.me-range{-webkit-appearance:none;appearance:none;flex:1 1 auto;min-width:0;width:100%;height:44px;margin:0;background:transparent;cursor:pointer;touch-action:none;--v:70%}
.me-range::-webkit-slider-runnable-track{height:3px;border-radius:3px;background:linear-gradient(90deg,var(--gold-deep) 0,var(--gold-hi) var(--v),var(--ivory4) var(--v))}
.me-range::-moz-range-track{height:3px;border-radius:3px;background:linear-gradient(90deg,var(--gold-deep) 0,var(--gold-hi) var(--v),var(--ivory4) var(--v))}
.me-range::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-9.5px;border-radius:50%;background:var(--ivory);border:0;
  box-shadow:0 0 0 3px rgba(217,171,72,.4),0 2px 8px rgba(0,0,0,.45),0 0 14px rgba(240,213,142,.45)}
.me-range::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--ivory);border:0;box-shadow:0 0 0 3px rgba(217,171,72,.4),0 2px 8px rgba(0,0,0,.45)}
.me-range:active::-webkit-slider-thumb{box-shadow:0 0 0 6px rgba(217,171,72,.32),0 2px 8px rgba(0,0,0,.45),0 0 20px rgba(240,213,142,.7)}

/* ---------- chips above the bar: first-run hint + tour caption ---------- */
.me-chip{position:absolute;left:50%;bottom:calc(var(--sab) + var(--g) + var(--bar) + 12px);transform:translate(-50%,10px);opacity:0;
  max-width:calc(100% - 2 * var(--g) - var(--sal) - var(--sar));border-radius:18px;padding:10px 16px;text-align:center;
  transition:opacity .5s var(--ease),transform .6s var(--ease);pointer-events:none}
.me-chip.is-on{opacity:1;transform:translate(-50%,0)}
.me-hint{font-size:13px;letter-spacing:.02em;color:var(--ivory);width:max-content;line-height:1.55}
.me-hint span{white-space:nowrap;display:inline-block}
.me-hint b{font-weight:400;color:var(--gold);padding:0 .5em}
.me-cap{min-width:200px;width:max-content}
.me-cap-k{display:block;font-size:10.5px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold)}
.me-cap-t{display:block;font-family:var(--head);font-size:21px;line-height:1.2;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.me-cap-p{display:block;height:2px;margin:8px auto 0;width:100%;border-radius:2px;background:var(--ivory4);overflow:hidden}
.me-cap-p i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--gold-deep),var(--gold-hi));box-shadow:0 0 8px var(--gold)}

/* ghost joystick shown with the first-run hint on touch devices */
.me-ghost{position:absolute;left:calc(var(--sal) + 34px);bottom:calc(var(--sab) + var(--g) + var(--bar) + 76px);width:84px;height:84px;border-radius:50%;
  border:1.5px dashed rgba(250,247,242,.62);background:radial-gradient(circle,rgba(14,13,15,.10),rgba(14,13,15,.32));opacity:0;transition:opacity .6s var(--ease)}
.me-ghost.is-on{opacity:1}
.me-ghost::before{content:'';position:absolute;left:50%;top:8px;width:8px;height:8px;margin-left:-4px;border-left:1.5px solid var(--gold-hi);border-top:1.5px solid var(--gold-hi);transform:rotate(45deg)}
.me-ghost::after{content:'Walk';position:absolute;left:50%;bottom:100%;margin-bottom:7px;transform:translateX(-50%);padding:3px 10px 2px;border-radius:999px;background:rgba(11,10,12,.62);
  font-size:10.5px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--ivory);white-space:nowrap}
.me-ghost i{position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(250,247,242,.75);
  box-shadow:0 0 14px rgba(240,213,142,.6);animation:me-thumb 2.4s var(--ease) infinite}

/* ---------- joystick ---------- */
.me-joy{position:absolute;left:0;top:0;width:124px;height:124px;margin:-62px 0 0 -62px;border-radius:50%;
  border:1.5px solid rgba(250,247,242,.34);background:radial-gradient(circle,rgba(14,13,15,.18) 0,rgba(14,13,15,.42) 70%);
  box-shadow:inset 0 0 26px rgba(240,213,142,.10),0 6px 24px rgba(0,0,0,.25);opacity:0;transform:scale(.6);
  transition:opacity .18s var(--ease),transform .25s var(--spring)}
.me-joy.is-on{opacity:1;transform:scale(1)}
.me-joy::before{content:'';position:absolute;left:50%;top:9px;width:9px;height:9px;margin-left:-4.5px;border-left:1.5px solid var(--gold);border-top:1.5px solid var(--gold);transform:rotate(45deg);opacity:.9}
.me-joy-k{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%,#fffaf0 0,var(--ivory) 45%,#dccfb8 100%);
  box-shadow:0 4px 14px rgba(0,0,0,.35),0 0 20px rgba(240,213,142,.45),0 0 0 3px rgba(217,171,72,.4)}

/* ---------- toasts ---------- */
.me-toasts{position:absolute;top:calc(var(--sat) + 64px);left:0;right:0;display:flex;flex-direction:column;align-items:center;padding:0 16px}
.me-toast{max-width:100%;display:flex;align-items:center;padding:10px 16px 10px 13px;margin-bottom:8px;border-radius:999px;font-size:13.5px;letter-spacing:.01em;
  opacity:0;transform:translateY(-8px) scale(.98);transition:opacity .35s var(--ease),transform .45s var(--spring)}
.me-toast .me-crown{width:15px;height:11px;color:var(--gold);margin-right:9px}
.me-toast span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.me-toast.is-on{opacity:1;transform:none}

/* ---------- panels: product card + sheets ---------- */
.me-panel::before{content:'';position:absolute;left:28px;right:28px;top:-1px;height:1px;pointer-events:none;
  background:linear-gradient(90deg,rgba(240,213,142,0),rgba(240,213,142,.6) 50%,rgba(240,213,142,0))}
.me-panel{background:var(--glass-hi);border:1px solid var(--line);
  -webkit-backdrop-filter:blur(22px) saturate(150%);backdrop-filter:blur(22px) saturate(150%);
  box-shadow:0 24px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}
.me-card{position:absolute;left:calc(var(--sal) + 8px);right:calc(var(--sar) + 8px);bottom:calc(var(--sab) + 8px);max-height:min(62%,520px);
  border-radius:26px;padding:8px 18px 16px;display:flex;flex-direction:column;
  transform:translateY(calc(100% + 30px));visibility:hidden;
  transition:transform .5s var(--ease),visibility 0s linear .5s}
.me-card.is-open{transform:none;visibility:visible;transition:transform .5s var(--ease),visibility 0s}
.me-handle{width:38px;height:4px;border-radius:4px;background:var(--ivory4);margin:0 auto 6px;flex:none}
.me-card-hd{display:flex;align-items:center;justify-content:space-between;min-height:32px;flex:none}
.me-tag{font-size:10.5px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.me-card .me-tag:empty{visibility:hidden}
.me-card .me-tag.is-sale{color:#fff;background:var(--sale);padding:3px 9px 2px;border-radius:999px;letter-spacing:.2em}
.me-x{width:44px;height:44px;margin:-6px -12px -6px 8px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--ivory2);flex:none;transition:color .2s,background-color .2s}
.me-x svg{width:20px;height:20px}
.me-x:active{background:rgba(255,255,255,.08)}
.me-card-bd{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;min-height:0;touch-action:pan-y;margin:0 -4px;padding:0 4px}
.me-pc{display:flex;align-items:flex-start;margin:2px 0 4px}
.me-ph{position:relative;flex:none;width:94px;height:124px;margin-right:14px;border-radius:14px;overflow:hidden;background:#efe8dc;
  box-shadow:0 6px 18px rgba(0,0,0,.35),0 0 0 1px rgba(240,213,142,.22)}
.me-ph img{display:block;width:100%;height:100%;object-fit:cover}
.me-ph.is-svg img{object-fit:contain}
.me-ph.is-broken{display:none}
.me-pc-t{flex:1 1 auto;min-width:0}
.me-title{font-family:var(--head);font-weight:400;font-size:23px;line-height:1.15;letter-spacing:.01em;margin:2px 0 0;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.me-price{display:flex;flex-wrap:wrap;align-items:baseline;margin-top:6px;font-size:17px;font-weight:500;letter-spacing:.02em;color:var(--gold-hi);white-space:nowrap}
.me-price span{margin-right:9px}
.me-price.is-sale span{color:#ff9d8f}
.me-price s{font-size:13.5px;font-weight:400;color:var(--ivory3)}
.me-price-l{flex:0 0 100%;margin-bottom:2px;font-size:10.5px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--ivory3)}
.me-subt{font-size:13.5px;line-height:1.5;color:var(--ivory2);margin:7px 0 0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;
  -webkit-user-select:text;user-select:text}
.me-cw{margin-top:12px}
.me-cw-l{font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--ivory3)}
.me-cw-l span{color:var(--ivory);letter-spacing:.12em}
.me-sw{display:flex;flex-wrap:wrap;margin:4px -6px 0}
.me-swb{width:44px;height:44px;margin-right:2px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.me-swb i{width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.24),0 2px 6px rgba(0,0,0,.35);transition:transform .3s var(--spring),box-shadow .25s}
.me-swb.is-on i{box-shadow:inset 0 0 0 1px rgba(255,255,255,.24),0 0 0 2.5px rgba(11,10,12,.95),0 0 0 4px var(--gold),0 0 14px rgba(240,213,142,.45)}
.me-swb:active i{transform:scale(.86)}
.me-sz{display:flex;flex-wrap:wrap;margin-top:6px}
.me-szb{min-width:44px;height:44px;padding:0 11px;margin:0 6px 6px 0;border-radius:12px;border:1px solid rgba(250,247,242,.22)!important;font-size:13px;font-weight:500;letter-spacing:.06em;color:var(--ivory2);
  transition:background-color .2s,color .2s,border-color .2s,transform .14s var(--ease)}
.me-szb.is-on{background:var(--ivory);color:var(--ink);border-color:var(--ivory)!important}
.me-szb:active{transform:scale(.94)}
.me-szb.out{color:var(--ivory3);border-style:dashed!important;cursor:not-allowed;
  background:linear-gradient(to top right,transparent calc(50% - .75px),rgba(250,247,242,.32) 50%,transparent calc(50% + .75px))}
.me-szw.is-nudge .me-szb:not(.out){animation:me-nudge .7s var(--spring)}
.me-szw.is-nudge .me-cw-l span{color:var(--gold-hi)}
.me-look{list-style:none;margin:8px 0 0;padding:0}
.me-look li{border-top:1px solid var(--line)}
.me-look li:first-child{border-top:0}
.me-lk-i{display:flex;align-items:center;width:100%;min-height:56px;padding:5px 2px;text-align:left;border-radius:12px}
.me-lk-i:active{background:rgba(255,255,255,.06)}
.me-lk-i:disabled{cursor:default}
.me-lk-ph{position:relative;flex:none;width:36px;height:48px;margin-right:12px;border-radius:8px;overflow:hidden;background:#efe8dc}
.me-lk-ph img{width:100%;height:100%;object-fit:cover;display:block}
.me-lk-ph.is-svg img{object-fit:contain}
.me-lk-i .t{flex:1 1 auto;min-width:0;font-size:14px;line-height:1.3}
.me-lk-i .t b{display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.me-lk-i .t small{display:block;color:var(--ivory3);font-size:12px}
.me-lk-i .p{font-size:13.5px;color:var(--gold-hi);white-space:nowrap;margin:0 4px 0 10px}
.me-lk-i svg{width:16px;height:16px;color:var(--ivory3)}
.me-acts{display:flex;flex-wrap:wrap;margin:14px -4px 0;flex:none}
.me-cta{flex:1 1 150px;height:50px;margin:0 4px 8px;border-radius:999px;padding:0 20px;display:flex;align-items:center;justify-content:center;
  font-size:12.5px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap;
  transition:transform .14s var(--ease),background-color .25s,box-shadow .3s,opacity .2s}
.me-cta svg{width:18px;height:18px;margin-right:10px}
.me-cta span+svg{margin:0 0 0 9px;width:15px;height:15px}
.me-cta span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.me-cta.pri{background:var(--gold-btn);color:var(--ink);box-shadow:0 6px 18px rgba(0,0,0,.35),0 0 0 1px rgba(255,240,200,.45) inset,0 0 18px rgba(217,171,72,.18)}
.me-cta.sec{border:1px solid rgba(250,247,242,.28)!important;color:var(--ivory)}
.me-cta:active{transform:scale(.96)}
.me-cta:disabled{opacity:.55;cursor:not-allowed;filter:saturate(.3)}
.me-cta.pri.pop{animation:me-cta .6s var(--spring)}
.me-acts .me-cta:only-child{flex-basis:100%}
.me-acts.is-stack .me-cta.pri{flex-basis:100%}
.me-acts.is-stack .me-cta.sec{flex:1 1 0;min-width:0;padding:0 10px;letter-spacing:.12em}
.me-cta.pri.is-done{filter:saturate(.85) brightness(1.04)}

/* ---------- sheets (go to / info / bag) ---------- */
.me-scrim{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(5,5,6,.42);opacity:0;visibility:hidden;transition:opacity .35s,visibility 0s linear .35s}
.me-scrim.is-on{opacity:1;visibility:visible;transition:opacity .35s}
.me-sheet{position:absolute;left:calc(var(--sal) + 8px);right:calc(var(--sar) + 8px);bottom:calc(var(--sab) + 8px);max-height:78%;
  border-radius:26px;padding:8px 20px 16px;display:flex;flex-direction:column;
  transform:translateY(calc(100% + 30px));visibility:hidden;transition:transform .5s var(--ease),visibility 0s linear .5s}
.me-sheet.is-open{transform:none;visibility:visible;transition:transform .5s var(--ease),visibility 0s}
.me-sheet h2{font-family:var(--head);font-weight:400;font-size:25px;line-height:1.15;margin:0;flex:none}
.me-sheet h2 small{font-family:var(--sans);font-size:14px;color:var(--ivory3);letter-spacing:.04em}
.me-sheet h3{font-size:10.5px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;color:var(--gold);margin:18px 0 6px}
.me-sheet p,.me-sheet li,.me-sheet dd{font-size:14px;line-height:1.55;color:var(--ivory2);margin:0}
.me-sheet p+p{margin-top:9px}
.me-sheet ul{list-style:none;margin:0;padding:0}
.me-sheet small{color:var(--ivory3);font-size:12px}
.me-scroll{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;min-height:0;margin:0 -6px;padding:0 6px 4px;
  -webkit-user-select:text;user-select:text}
.me-scroll.is-more,.me-card-bd.is-more{-webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 34px),rgba(0,0,0,.08));mask-image:linear-gradient(180deg,#000 calc(100% - 34px),rgba(0,0,0,.08))}
.me-ann{flex:none;margin:6px 0 0!important;font-size:12.5px!important;line-height:1.45!important;color:var(--gold-hi)!important;letter-spacing:.01em}

/* go to */
.me-goto-list{display:grid;grid-template-columns:minmax(0,1fr);grid-row-gap:4px;margin-top:10px}
.me-dept{min-width:0;border-radius:16px;padding:2px 0 4px}
.me-go{display:flex;align-items:center;width:100%;min-height:54px;padding:6px 8px 6px 4px;border-radius:14px;text-align:left;transition:background-color .2s}
.me-go:active{background:rgba(255,255,255,.07)}
.me-go .n{font-family:var(--display);font-size:14px;letter-spacing:.06em;color:var(--gold);width:30px;margin-right:12px;text-align:right;flex:none}
.me-go .t{flex:1 1 auto;min-width:0;font-family:var(--head);font-size:18px;line-height:1.2;color:var(--ivory)}
.me-go .t small{display:block;font-family:var(--sans);font-size:12px;letter-spacing:.02em;color:var(--ivory3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.me-go svg{width:16px;height:16px;color:var(--ivory3)}
.me-dept.is-here>.me-go .t::after{content:'You are here';display:block;margin-top:2px;font-family:var(--sans);font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);opacity:.85}
.me-stops{display:flex;flex-wrap:wrap;padding-left:44px;margin-top:-2px}
.me-stop{height:44px;padding:0 14px;margin:0 6px 6px 0;border-radius:999px;border:1px solid var(--line)!important;font-size:12px;letter-spacing:.08em;color:var(--ivory2);white-space:nowrap;transition:background-color .2s,border-color .2s}
.me-stop.is-here{border-color:var(--gline)!important;color:var(--gold-hi)}
.me-stop:active{background:rgba(255,255,255,.07)}

/* info */
.me-sheet .me-card-hd{position:relative}
.me-back{display:none;align-items:center;height:44px;margin:-6px 0 -6px -10px;padding:0 12px 0 4px;border-radius:999px;font-size:11px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.me-back svg{width:20px;height:20px;margin-right:2px}
.me-sheet.is-page .me-back{display:flex}
.me-sheet.is-page .me-info-tag{display:none}
.me-info-bd{margin-top:2px}
.me-ib{text-align:center;padding:4px 0 2px}
.me-ib .me-crown{width:38px;height:26px;margin:0 auto 7px;filter:drop-shadow(0 0 8px rgba(240,213,142,.35))}
.me-ib-w{font-family:var(--display);font-weight:600;font-size:30px;line-height:1;letter-spacing:.18em;margin-right:-.18em;
  background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--gold)}
.me-ib-l{font-size:10px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--ivory2);margin:8px 0 0;padding-left:.34em}
.me-ib-s{font-family:var(--head);font-size:15px;color:var(--ivory);margin-top:8px}
.me-info-bd>.me-ann{text-align:center;margin:10px 0 2px!important}
.me-menu{display:grid;grid-template-columns:minmax(0,1fr);margin-top:12px}
.me-mi{display:flex;align-items:center;width:100%;min-height:52px;padding:4px 6px 4px 2px;border-top:1px solid var(--line)!important;text-align:left;transition:background-color .2s}
.me-mi:first-child{border-top:0!important}
.me-mi:active{background:rgba(255,255,255,.06)}
.me-mi .ic{width:36px;height:36px;margin-right:12px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;color:var(--gold);background:rgba(217,171,72,.1);box-shadow:inset 0 0 0 1px rgba(217,171,72,.25)}
.me-mi .ic svg{width:18px;height:18px}
.me-mi .t{flex:1 1 auto;min-width:0;font-size:15.5px;color:var(--ivory)}
.me-mi>svg{width:16px;height:16px;color:var(--ivory3)}
.me-pt{font-family:var(--head);font-weight:400;font-size:25px;line-height:1.15;margin:2px 0 4px;color:var(--ivory)}
.me-pt+h3{margin-top:10px}
.me-faq{margin-top:4px}
.me-qa{border-top:1px solid var(--line)}
.me-qa:first-child{border-top:0}
.me-q{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:8px 0;text-align:left;font-size:14.5px;line-height:1.4;color:var(--ivory)}
.me-q span{flex:1 1 auto;padding-right:10px}
.me-q svg{width:18px;height:18px;color:var(--gold);transition:transform .3s var(--ease)}
.me-q[aria-expanded="true"] svg{transform:rotate(180deg)}
.me-a{padding:0 0 12px}
.me-a[hidden]{display:none}
.me-sizes{display:flex;flex-wrap:wrap;margin-top:4px}
.me-sizes span{min-width:44px;height:34px;padding:0 10px;margin:0 6px 6px 0;border-radius:10px;border:1px solid var(--gline);display:flex;align-items:center;justify-content:center;font-size:13px;letter-spacing:.06em;color:var(--ivory)}
.me-quote{margin:0 0 12px;padding:12px 14px;border-radius:14px;background:rgba(250,247,242,.05);border:1px solid var(--line)}
.me-quote blockquote{margin:0;font-family:var(--head);font-size:15px;line-height:1.5;color:var(--ivory)}
.me-quote figcaption{margin-top:6px;font-size:12px;color:var(--gold);letter-spacing:.1em}
.me-quote figcaption span{color:var(--ivory3);letter-spacing:.02em;margin-left:4px}
.me-addr{font-style:normal;font-size:15px;line-height:1.55;color:var(--ivory)}
.me-links{margin-top:8px}
.me-lk{display:inline-flex;align-items:center;height:44px;padding:0 16px 0 12px;border-radius:999px;border:1px solid var(--gline);color:var(--gold-hi);font-size:12px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;
  -webkit-user-select:none;user-select:none}
.me-lk svg{width:17px;height:17px;margin-right:8px}
.me-lk span+svg{width:14px;height:14px;margin:0 0 0 8px;opacity:.7}
.me-lk:active{background:rgba(255,255,255,.07)}
.me-hours{width:100%;border-collapse:collapse;font-size:14px}
.me-hours th,.me-hours td{padding:6px 0;border-top:1px solid var(--line);text-align:left;font-weight:400;color:var(--ivory2)}
.me-hours tr:first-child th,.me-hours tr:first-child td{border-top:0}
.me-hours td{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.me-hours tr.is-today th,.me-hours tr.is-today td{color:var(--gold-hi)}
.me-hours th small{margin-left:8px;font-size:9.5px!important;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)!important}
.me-note{margin-top:10px!important;font-size:13px!important;color:var(--ivory3)!important}
.me-ct li{display:flex;flex-wrap:wrap;align-items:center;padding:4px 0;border-top:1px solid var(--line)}
.me-ct li:first-child{border-top:0}
.me-ct .me-lk{min-width:132px;margin-right:12px}
.me-ct .v{font-size:14px;color:var(--ivory);padding:6px 0;word-break:break-word;-webkit-user-select:text;user-select:text}
.me-keys{display:grid;grid-template-columns:auto 1fr;grid-gap:6px 14px;align-items:baseline;margin:12px 0 0}
.me-keys dt{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-hi)}
.me-keys dd{margin:0}
.me-credits li{padding:5px 0;border-top:1px solid var(--line)}
.me-credits li:first-child{border-top:0}

/* bag */
.me-bag-list{margin-top:6px}
.me-bl{display:grid;grid-template-columns:48px 1fr auto;grid-template-rows:auto auto;grid-column-gap:12px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}
.me-bl:first-child{border-top:0}
.me-bl-ph{grid-row:1 / span 2;width:48px;height:64px;border-radius:10px;overflow:hidden;background:#efe8dc;display:flex;align-items:center;justify-content:center}
.me-bl-ph img{width:100%;height:100%;object-fit:cover;display:block}
.me-bl-ph img.svg{object-fit:contain}
.me-bl-ph i{width:24px;height:24px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.me-bl-t{min-width:0;font-size:14px;line-height:1.35;color:var(--ivory)}
.me-bl-t b{display:block;font-weight:500}
.me-bl-t small{display:block;margin-top:1px}
.me-bl-p{font-size:14.5px;font-weight:500;color:var(--gold-hi);white-space:nowrap;text-align:right}
.me-qty{grid-column:2;display:flex;align-items:center;margin:6px 0 0 -10px}
.me-qty button{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--ivory)}
.me-qty button svg{width:18px;height:18px}
.me-qty button:active{background:rgba(255,255,255,.08)}
.me-qty output{min-width:26px;text-align:center;font-size:15px;font-weight:500;font-variant-numeric:tabular-nums}
.me-rm{grid-column:3;justify-self:end;width:44px;height:44px;margin:6px -10px 0 0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--ivory3)}
.me-rm svg{width:18px;height:18px}
.me-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;padding-top:12px;border-top:1px solid var(--gline)}
.me-total small{font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--ivory3)}
.me-total b{font-size:21px;font-weight:500;color:var(--gold-hi);letter-spacing:.02em}
.me-bag-foot{flex:none}
.me-bag-foot .me-acts{margin-top:12px}
.me-cta.me-wa{flex-basis:100%;min-width:0}
.me-empty{padding:18px 0 4px;text-align:center}
.me-empty .me-crown{width:34px;height:24px;margin:0 auto 10px;color:var(--gold);opacity:.8}
.me-empty em{display:block;font-family:var(--head);font-style:normal;font-size:20px;color:var(--ivory);margin-bottom:4px}

/* ---------- loader ---------- */
.me-loader{position:absolute;top:0;left:0;right:0;bottom:0;z-index:5;pointer-events:auto;overflow:hidden;
  background:radial-gradient(110% 80% at 50% 44%,#221f27 0,#121114 48%,#050506 100%);transition:opacity 1s var(--ease),visibility 0s linear 1s}
.me-loader.is-done{opacity:0;visibility:hidden;pointer-events:none}
.me-ld-crown{position:absolute;left:50%;bottom:calc(50% + 36px);width:70px;height:48px;margin-left:-35px;filter:drop-shadow(0 0 16px rgba(240,213,142,.35));animation:me-glow 3.2s ease-in-out infinite alternate}
.me-ld-crown .me-crown{width:100%;height:100%}
.me-ld-word{position:absolute;left:0;right:0;top:50%;margin-top:-22px;text-align:center;font-family:var(--display);font-weight:600;font-size:44px;line-height:44px;
  letter-spacing:.16em;padding-left:.16em;white-space:nowrap;
  background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--gold);
  transition:transform 1.2s var(--ease),letter-spacing 1.2s var(--ease)}
.me-loader.is-done .me-ld-word{transform:scale(1.05);letter-spacing:.2em}
.me-ld-low{position:absolute;left:0;right:0;top:calc(50% + 34px);display:flex;flex-direction:column;align-items:center}
.me-ld-line{display:flex;align-items:center;font-size:10.5px;font-weight:500;letter-spacing:.36em;text-transform:uppercase;color:var(--ivory2);white-space:nowrap}
.me-ld-line span{padding-left:.36em}
.me-ld-line i{width:34px;height:1px;background:linear-gradient(90deg,rgba(217,171,72,0),var(--gold));margin:0 12px}
.me-ld-line i:last-child{background:linear-gradient(90deg,var(--gold),rgba(217,171,72,0))}
.me-ld-bar{width:170px;height:1px;background:var(--ivory4);margin-top:30px;position:relative;overflow:visible}
.me-ld-bar i{position:absolute;left:0;top:0;height:1px;width:100%;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,var(--gold-deep),var(--gold-hi));
  box-shadow:0 0 10px rgba(240,213,142,.9);transition:transform .5s var(--ease)}
.me-ld-lbl{font-family:var(--head);font-size:15px;color:var(--ivory2);margin-top:14px;min-height:20px}
.me-ld-pct{font-size:10.5px;letter-spacing:.3em;color:var(--ivory3);margin-top:6px;font-variant-numeric:tabular-nums}
.me-ld-foot{position:absolute;left:16px;right:16px;bottom:calc(var(--sab) + 26px);text-align:center}
.me-ld-slogan{font-family:var(--head);font-size:16px;letter-spacing:.04em;color:var(--ivory)}
.me-ld-ann{margin:10px auto 0;max-width:360px;font-size:11.5px;line-height:1.45;letter-spacing:.03em;color:var(--ivory3)}

/* ---------- small effects ---------- */
.me-ripple{position:absolute;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:1.5px solid var(--ivory);opacity:0;pointer-events:none}
.me-ripple.hit{border-color:var(--gold-hi);box-shadow:0 0 16px rgba(240,213,142,.6)}
.me-fly{position:absolute;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;pointer-events:none;
  box-shadow:0 0 0 2px var(--gold-hi),0 0 18px 4px rgba(240,213,142,.75)}

/* ---------- intro choreography ---------- */
#me-ui.is-loading .me-top{opacity:0;transform:translateY(-16px)}
#me-ui.is-loading .me-bar{opacity:0;transform:translate(-50%,24px)}
#me-ui.is-card .me-bar,#me-ui.is-sheet .me-bar{opacity:0;transform:translate(-50%,30px);pointer-events:none}
#me-ui.is-card .me-chip,#me-ui.is-sheet .me-chip{opacity:0}

/* ---------- breakpoints ---------- */
@media (max-width:420px){
  .me-btn{padding:0 11px;letter-spacing:.13em}
  .me-btn svg{margin-right:6px}
  .me-magic{padding:0 8px}
  .me-magic svg{margin-right:6px}
}
@media (max-width:374px){
  #me-ui{--g:10px}
  .me-btn .lbl{display:none}
  .me-btn{padding:0;width:44px}
  .me-btn svg{margin-right:0}
  .me-word{font-size:16px;letter-spacing:.14em}
  .me-brand{padding:0 15px 0 13px}
  .me-title{font-size:21px}
  .me-ph{width:80px;height:106px;margin-right:12px}
  .me-hint{font-size:12.5px;line-height:1.6}
  .me-hint span{display:block}
  .me-hint b{display:none}
  .me-ld-word{font-size:38px;line-height:38px;margin-top:-19px}
  .me-ct .me-lk{min-width:0}
  .me-cta{padding:0 14px;font-size:12px;letter-spacing:.09em}
  .me-cta svg{margin-right:8px}
}
/* short portrait phones (iPhone SE 1st gen, iPhone 8 with browser chrome) */
@media (max-height:720px) and (orientation:portrait){
  .me-card{padding:6px 16px 12px;max-height:66%}
  .me-card .me-handle{margin-bottom:2px}
  .me-card .me-card-hd{min-height:28px}
  .me-ph{width:80px;height:104px}
  .me-title{font-size:21px;-webkit-line-clamp:2}
  .me-price{font-size:16px;margin-top:4px}
  .me-subt{font-size:13px;line-height:1.45;-webkit-line-clamp:2;margin-top:5px}
  .me-cw{margin-top:8px}
  .me-acts{margin-top:10px}
  .me-cta{height:46px}
  .me-sheet{max-height:84%}
}
@media (max-height:620px) and (orientation:portrait){
  .me-card{max-height:72%}
  .me-ph{width:70px;height:92px}
  .me-subt{-webkit-line-clamp:2}
  .me-sz{margin-top:4px}
  .me-szb{margin-bottom:4px}
  .me-ghost{bottom:calc(var(--sab) + var(--g) + var(--bar) + 64px);width:72px;height:72px}
  .me-ld-ann{display:none}
}
@media (min-width:600px){
  .me-sub{display:block}
  .me-goto-list{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-column-gap:12px}
}
/* portrait tablets: centred sheets instead of edge-to-edge */
@media (min-width:600px) and (min-height:501px){
  .me-card,.me-sheet{left:50%;right:auto;width:560px;margin-left:-280px;bottom:calc(var(--sab) + 16px)}
}
/* landscape phones: very short viewports */
@media (max-height:500px) and (orientation:landscape){
  #me-ui{--g:10px;--bar:52px}
  .me-top{top:calc(var(--sat) + 8px)}
  .me-bar{height:52px;padding:4px;max-width:440px}
  .me-toasts{top:calc(var(--sat) + 60px)}
  .me-annchip{top:calc(var(--sat) + 58px)}
  .me-annchip span{max-width:520px}
  .me-chip{padding:8px 14px}
  .me-cap-t{font-size:18px}
  .me-ghost{bottom:calc(var(--sab) + 90px);left:calc(var(--sal) + 60px)}
  .me-card{left:auto;right:calc(var(--sar) + 10px);top:calc(var(--sat) + 10px);bottom:calc(var(--sab) + 10px);width:min(360px,46%);max-height:none;
    padding:10px 16px 10px;transform:translateX(calc(100% + 40px))}
  /* the card takes the full height on the right: the bag steps aside so the fly-to-bag target stays visible */
  .me-bagbtn{transition:transform .5s var(--ease)}
  #me-ui.is-card .me-bagbtn{transform:translateX(calc(-1 * (min(360px,46vw) + 10px)))}
  #me-ui.is-card .me-sub{display:none}
  #me-ui.is-card .me-toasts{right:calc(var(--sar) + min(360px,46vw) + 20px)}
  .me-card .me-handle{display:none}
  .me-card .me-card-hd{min-height:28px}
  .me-ph{width:58px;height:77px;margin-right:12px}
  .me-title{font-size:20px;-webkit-line-clamp:2}
  .me-price{font-size:15.5px;margin-top:3px}
  .me-subt{font-size:12.5px;-webkit-line-clamp:1;margin-top:3px}
  .me-cw{margin-top:4px}
  .me-sw,.me-sz{margin-top:2px}
  .me-szb{margin-bottom:4px}
  .me-acts{margin-top:8px}
  .me-cta{height:44px;margin-bottom:4px;flex-basis:120px;padding:0 14px}
  .me-sheet{left:50%;right:auto;width:min(600px,calc(100% - 20px - var(--sal) - var(--sar)));margin-left:calc(min(600px,calc(100% - 20px - var(--sal) - var(--sar))) / -2);
    top:auto;bottom:calc(var(--sab) + 10px);max-height:calc(100% - 20px - var(--sat) - var(--sab));padding:10px 20px 12px}
  .me-sheet .me-handle{display:none}
  .me-sheet h2{font-size:22px}
  .me-goto-list{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-column-gap:12px}
  .me-menu{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-column-gap:14px}
  .me-mi:nth-child(2){border-top:0!important}
  .me-ib{display:none}
  .me-sheet[data-sheet="bag"] .me-ann{display:none}
  .me-sheet[data-sheet="bag"] .me-card-hd{min-height:26px}
  .me-bag-foot{display:flex;align-items:center;border-top:1px solid var(--gline);margin-top:6px;padding-top:8px}
  .me-bag-foot .me-total{flex:none;display:block;margin:0 16px 0 0;padding:0;border:0}
  .me-bag-foot .me-total small{display:block}
  .me-bag-foot .me-acts{flex:1 1 auto;margin:0 -4px}
  .me-bag-foot .me-cta{margin-bottom:0}
  .me-bl{padding:6px 0}
  .me-ld-crown{bottom:calc(50% + 30px);width:58px;height:40px;margin-left:-29px}
  .me-ld-word{font-size:36px;line-height:36px;margin-top:-18px}
  .me-ld-low{top:calc(50% + 28px)}
  .me-ld-bar{margin-top:18px}
  .me-ld-foot{bottom:calc(var(--sab) + 14px)}
  .me-ld-ann{display:none}
}
/* tablets & desktop */
@media (min-width:900px) and (min-height:560px){
  #me-ui{--g:20px}
  .me-top{top:calc(var(--sat) + 18px)}
  .me-brand{height:48px;padding:0 22px 0 18px}
  .me-word{font-size:20px}
  .me-annbar{display:flex;flex:1 1 auto;min-width:0;justify-content:center;align-items:center;height:48px;padding:0 16px;pointer-events:none}
  .me-annbar span{max-width:100%;padding:8px 18px;border-radius:999px;background:rgba(11,10,12,.5);border:1px solid var(--gline);font-size:12.5px;letter-spacing:.03em;color:var(--ivory);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .me-annchip{display:none}
  .me-bagbtn{width:48px;height:48px}
  .me-toasts{top:calc(var(--sat) + 80px)}
  .me-card{left:auto;right:calc(var(--sar) + 20px);top:calc(var(--sat) + 84px);bottom:auto;width:400px;margin-left:0;max-height:calc(100% - 180px);
    padding:14px 22px 18px;transform:translateX(calc(100% + 40px))}
  .me-card .me-handle{display:none}
  .me-ph{width:110px;height:146px;margin-right:16px}
  .me-title{font-size:25px}
  #me-ui.is-card .me-bar{opacity:1;transform:translateX(-50%);pointer-events:auto}
  .me-sheet{left:50%;right:auto;width:560px;margin-left:-280px;bottom:calc(var(--sab) + var(--g) + var(--bar) + 12px);max-height:calc(100% - 200px);padding:14px 24px 20px}
  #me-ui.is-sheet .me-bar{opacity:1;transform:translateX(-50%);pointer-events:auto}
  .me-sheet .me-handle{display:none}
  .me-ld-crown{bottom:calc(50% + 46px);width:88px;height:60px;margin-left:-44px}
  .me-ld-word{font-size:60px;line-height:60px;margin-top:-30px}
  .me-ld-low{top:calc(50% + 44px)}
  .me-ld-line{font-size:12px}
}
@media (hover:hover){
  .me-btn:hover{background-color:rgba(255,255,255,.07)}
  .me-btn.is-on:hover{background-color:transparent;filter:brightness(1.06)}
  .me-go:hover,.me-mi:hover,.me-lk-i:hover{background-color:rgba(255,255,255,.05)}
  .me-stop:hover,.me-lk:hover{border-color:var(--gold)!important}
  .me-x:hover{color:var(--ivory);background-color:rgba(255,255,255,.06)}
  .me-cta.pri:hover{box-shadow:0 8px 24px rgba(0,0,0,.38),0 0 26px rgba(240,213,142,.35),0 0 0 1px rgba(255,240,200,.5) inset}
  .me-cta.sec:hover{background-color:rgba(255,255,255,.06)}
  .me-bagbtn:hover,.me-brand:hover{box-shadow:0 12px 32px rgba(0,0,0,.3),0 0 0 1px rgba(217,171,72,.45),inset 0 1px 0 rgba(255,255,255,.06)}
}

@keyframes me-glow{from{filter:drop-shadow(0 0 8px rgba(240,213,142,.25))}to{filter:drop-shadow(0 0 20px rgba(240,213,142,.55))}}
@keyframes me-bump{0%{transform:scale(1)}35%{transform:scale(1.22) rotate(-8deg)}65%{transform:scale(.95) rotate(4deg)}100%{transform:scale(1)}}
@keyframes me-badge{0%{transform:scale(1)}40%{transform:scale(1.45)}100%{transform:scale(1)}}
@keyframes me-cta{0%{transform:scale(1)}30%{transform:scale(.94)}70%{transform:scale(1.04)}100%{transform:scale(1)}}
@keyframes me-nudge{0%{transform:translateX(0)}25%{transform:translateX(-4px)}50%{transform:translateX(4px)}75%{transform:translateX(-2px)}100%{transform:translateX(0)}}
@keyframes me-thumb{0%,100%{transform:translate(0,0)}25%{transform:translate(0,-20px)}55%{transform:translate(14px,-6px)}80%{transform:translate(-8px,6px)}}

@media (prefers-reduced-motion:reduce){
  #me-ui *,#me-ui *::before,#me-ui *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
`;

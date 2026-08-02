/**
 * Generates the placeholder apparel vector art into public/apparel/<layer>/*.svg
 *
 * Design rule that makes the whole mixer work:
 * EVERY svg is authored in the SAME 400x800 body coordinate space, with the
 * garment drawn at its true anatomical position and everything else transparent.
 * The stage then renders each layer as `absolute inset-0 w-full h-full` and the
 * pieces line up automatically -- no per-layer anchor math, no clipping.
 * (Same trick fangpenlin/avataaars uses: one shared canvas, many stacked nodes.)
 *
 * Run: node scripts/generate-apparel.mjs
 * Safe to re-run. Drop your own 400x800 SVGs in these folders to replace the art.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../public/apparel')

const C = {
  white: '#f8fafc',
  offwhite: '#e8edf2',
  cream: '#f2e9d8',
  sand: '#ded3c0',
  tan: '#c9ac83',
  camel: '#b08850',
  leather: '#7c4a2d',
  rust: '#b4593a',
  denim: '#4374a8',
  denimDk: '#2f5580',
  navy: '#26364d',
  teal: '#2f7d7a',
  olive: '#6d7c4e',
  plum: '#5b4a6b',
  grey: '#9aa3ae',
  greyDk: '#4b5563',
  charcoal: '#333b45',
  ink: '#1c222b',
  black: '#141a21',
  gold: '#d6b25e',
  silver: '#c9ced6',
  skin: '#cfd8dc',
  skinLine: '#94a3ab',
}

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" fill="none">\n${body}\n</svg>\n`

/* ── shared anatomy paths ──────────────────────────────────────────────── */

// torso shell with a scooped neckline punched out (evenodd)
const NECK_HOLE =
  'M176,187 C183,208 217,208 224,187 C214,182 186,182 176,187 Z'

const TORSO = (extra = '') =>
  `M146,199 C158,190 172,185 200,185 C228,185 242,190 254,199 L259,300 L257,397 L143,397 L141,300 Z ${NECK_HOLE} ${extra}`

const SLEEVE_SHORT_L = 'M148,199 C129,208 118,227 113,252 L143,262 L150,213 Z'
const SLEEVE_SHORT_R = 'M252,199 C271,208 282,227 287,252 L257,262 L250,213 Z'
const SLEEVE_LONG_L =
  'M148,199 C127,209 116,232 112,262 L118,398 C119,412 139,412 140,398 L146,286 L150,213 Z'
const SLEEVE_LONG_R =
  'M252,199 C273,209 284,232 288,262 L282,398 C281,412 261,412 260,398 L254,286 L250,213 Z'

const LEG_L = 'M146,404 L197,404 L194,600 L190,742 L152,742 L150,600 Z'
const LEG_R = 'M203,404 L254,404 L250,600 L248,742 L210,742 L206,600 Z'

/* ── the catalogue ─────────────────────────────────────────────────────── */

const catalogue = {
  base_mannequin: [
    [
      'mannequin',
      `<g fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2.5" stroke-linejoin="round">
    <ellipse cx="200" cy="112" rx="54" ry="64"/>
    <path d="M184,160 h32 v46 h-32 Z"/>
    <path d="M134,212 C114,221 107,247 109,287 L115,404 C116,418 136,418 137,404 L143,300 L147,222 Z"/>
    <path d="M266,212 C286,221 293,247 291,287 L285,404 C284,418 264,418 263,404 L257,300 L253,222 Z"/>
    <path d="M133,215 C133,199 153,190 170,188 L230,188 C247,190 267,199 267,215 L262,340 L258,424 L142,424 L138,340 Z"/>
    <path d="${LEG_L}"/>
    <path d="${LEG_R}"/>
    <ellipse cx="170" cy="752" rx="24" ry="14"/>
    <ellipse cx="230" cy="752" rx="24" ry="14"/>
  </g>`,
    ],
  ],

  tops: [
    [
      'tee-white',
      `<g fill="${C.white}" stroke="${C.grey}" stroke-width="2.5" stroke-linejoin="round">
    <path d="${SLEEVE_SHORT_L}"/><path d="${SLEEVE_SHORT_R}"/>
    <path fill-rule="evenodd" d="${TORSO()}"/>
  </g>`,
    ],
    [
      'tee-striped',
      `<g stroke="${C.navy}" stroke-width="2.5" stroke-linejoin="round">
    <path fill="${C.offwhite}" d="${SLEEVE_SHORT_L}"/><path fill="${C.offwhite}" d="${SLEEVE_SHORT_R}"/>
    <path fill="${C.offwhite}" fill-rule="evenodd" d="${TORSO()}"/>
    <g stroke="none" fill="${C.navy}" opacity="0.85">
      <rect x="143" y="228" width="115" height="13" rx="2"/>
      <rect x="143" y="262" width="115" height="13" rx="2"/>
      <rect x="143" y="296" width="115" height="13" rx="2"/>
      <rect x="143" y="330" width="115" height="13" rx="2"/>
      <rect x="143" y="364" width="115" height="13" rx="2"/>
    </g>
  </g>`,
    ],
    [
      'turtleneck-black',
      `<g fill="${C.ink}" stroke="${C.black}" stroke-width="2.5" stroke-linejoin="round">
    <path d="${SLEEVE_LONG_L}"/><path d="${SLEEVE_LONG_R}"/>
    <path d="M146,199 C158,190 172,185 200,185 C228,185 242,190 254,199 L259,300 L257,397 L143,397 L141,300 Z"/>
    <path d="M174,150 C182,144 218,144 226,150 L224,192 C216,199 184,199 176,192 Z"/>
  </g>`,
    ],
    [
      'sweater-oat',
      `<g fill="${C.cream}" stroke="${C.tan}" stroke-width="2.5" stroke-linejoin="round">
    <path d="${SLEEVE_LONG_L}"/><path d="${SLEEVE_LONG_R}"/>
    <path fill-rule="evenodd" d="${TORSO()}"/>
    <g stroke="${C.tan}" stroke-width="2" opacity="0.55" fill="none">
      <path d="M168,210 L168,392 M186,210 L186,392 M214,210 L214,392 M232,210 L232,392"/>
    </g>
    <path fill="none" stroke="${C.tan}" stroke-width="6" d="M143,386 L257,386"/>
  </g>`,
    ],
    [
      'tank-teal',
      `<g fill="${C.teal}" stroke="${C.navy}" stroke-width="2.5" stroke-linejoin="round">
    <path fill-rule="evenodd" d="M162,196 C170,190 180,186 200,186 C220,186 230,190 238,196 L252,300 L250,392 L150,392 L148,300 Z M176,188 C183,214 217,214 224,188 C214,183 186,183 176,188 Z"/>
  </g>`,
    ],
  ],

  bottoms: [
    [
      'jeans-blue',
      `<g fill="${C.denim}" stroke="${C.denimDk}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M140,392 L260,392 L256,440 L244,440 L200,470 L156,440 L144,440 Z"/>
    <path d="${LEG_L}"/><path d="${LEG_R}"/>
    <g fill="none" stroke="${C.cream}" stroke-width="2" opacity="0.5" stroke-dasharray="7 6">
      <path d="M152,420 L156,738 M188,420 L192,738 M208,420 L212,738 M244,420 L248,738"/>
    </g>
  </g>`,
    ],
    [
      'trousers-black',
      `<g fill="${C.ink}" stroke="${C.black}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M142,394 L258,394 L255,438 L200,466 L145,438 Z"/>
    <path d="M147,430 L198,430 L195,600 L191,744 L153,744 L151,600 Z"/>
    <path d="M202,430 L253,430 L249,600 L247,744 L209,744 L205,600 Z"/>
    <path fill="none" stroke="${C.greyDk}" stroke-width="2" d="M172,446 L170,740 M228,446 L230,740"/>
  </g>`,
    ],
    [
      'cargo-olive',
      `<g fill="${C.olive}" stroke="${C.navy}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M140,392 L260,392 L257,442 L200,468 L143,442 Z"/>
    <path d="M144,432 L198,432 L196,600 L192,744 L150,744 L148,600 Z"/>
    <path d="M202,432 L256,432 L252,600 L250,744 L208,744 L204,600 Z"/>
    <g fill="${C.olive}" stroke="${C.navy}" stroke-width="2.5">
      <rect x="150" y="520" width="42" height="52" rx="5"/>
      <rect x="208" y="520" width="42" height="52" rx="5"/>
    </g>
  </g>`,
    ],
    [
      'shorts-denim',
      `<g fill="${C.denimDk}" stroke="${C.navy}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M140,392 L260,392 L257,436 L200,462 L143,436 Z"/>
    <path d="M144,428 L198,428 L194,556 L150,556 Z"/>
    <path d="M202,428 L256,428 L250,556 L206,556 Z"/>
    <path fill="none" stroke="${C.cream}" stroke-width="2" opacity="0.45" stroke-dasharray="7 6" d="M150,548 L194,548 M206,548 L250,548"/>
  </g>`,
    ],
    [
      'skirt-pleated',
      `<g fill="${C.plum}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M144,394 L256,394 L286,566 L114,566 Z"/>
    <g fill="none" stroke="${C.ink}" stroke-width="2" opacity="0.45">
      <path d="M168,400 L146,562 M186,400 L176,562 M214,400 L224,562 M232,400 L254,562"/>
    </g>
  </g>`,
    ],
  ],

  outerwear: [
    [
      'denim-jacket',
      `<g fill="${C.denim}" stroke="${C.denimDk}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M142,196 C122,207 110,232 106,264 L112,404 C113,419 135,419 136,404 L142,286 Z"/>
    <path d="M258,196 C278,207 290,232 294,264 L288,404 C287,419 265,419 264,404 L258,286 Z"/>
    <path d="M144,196 C156,187 172,182 198,182 L196,408 L138,408 L136,300 Z"/>
    <path d="M256,196 C244,187 228,182 202,182 L204,408 L262,408 L264,300 Z"/>
    <path fill="none" stroke="${C.cream}" stroke-width="2" opacity="0.5" stroke-dasharray="7 6" d="M186,190 L184,404 M214,190 L216,404"/>
    <g fill="${C.gold}" stroke="none"><circle cx="196" cy="250" r="4"/><circle cx="196" cy="300" r="4"/><circle cx="196" cy="350" r="4"/></g>
  </g>`,
    ],
    [
      'trench-camel',
      `<g fill="${C.camel}" stroke="${C.leather}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M140,196 C120,208 108,234 104,266 L110,412 C111,427 133,427 134,412 L140,290 Z"/>
    <path d="M260,196 C280,208 292,234 296,266 L290,412 C289,427 267,427 266,412 L260,290 Z"/>
    <path d="M144,196 C156,186 172,181 198,181 L194,566 L130,566 L134,300 Z"/>
    <path d="M256,196 C244,186 228,181 202,181 L206,566 L270,566 L266,300 Z"/>
    <path d="M156,190 L198,181 L186,232 Z"/><path d="M244,190 L202,181 L214,232 Z"/>
    <rect x="128" y="392" width="144" height="18" rx="4" fill="${C.leather}" stroke="none"/>
  </g>`,
    ],
    [
      'blazer-charcoal',
      `<g fill="${C.charcoal}" stroke="${C.black}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M142,197 C123,208 112,233 108,264 L114,406 C115,420 136,420 137,406 L143,288 Z"/>
    <path d="M258,197 C277,208 288,233 292,264 L286,406 C285,420 264,420 263,406 L257,288 Z"/>
    <path d="M146,197 C158,187 172,182 198,182 L192,452 L136,452 L138,300 Z"/>
    <path d="M254,197 C242,187 228,182 202,182 L208,452 L264,452 L262,300 Z"/>
    <path fill="${C.greyDk}" d="M158,190 L198,182 L182,248 Z"/>
    <path fill="${C.greyDk}" d="M242,190 L202,182 L218,248 Z"/>
  </g>`,
    ],
    [
      'hoodie-open-grey',
      `<g fill="${C.grey}" stroke="${C.greyDk}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M142,200 C122,211 111,235 107,266 L113,406 C114,420 135,420 136,406 L142,290 Z"/>
    <path d="M258,200 C278,211 289,235 293,266 L287,406 C286,420 265,420 264,406 L258,290 Z"/>
    <path d="M146,200 C158,191 172,186 198,186 L194,420 L138,420 L140,300 Z"/>
    <path d="M254,200 C242,191 228,186 202,186 L206,420 L262,420 L260,300 Z"/>
    <path d="M162,192 C176,166 224,166 238,192 C224,204 176,204 162,192 Z"/>
    <g stroke="${C.white}" stroke-width="5" stroke-linecap="round" fill="none">
      <path d="M188,204 L184,262"/><path d="M212,204 L216,262"/>
    </g>
  </g>`,
    ],
  ],

  footwear: [
    [
      'sneakers-white',
      `<g fill="${C.white}" stroke="${C.grey}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M148,722 L192,722 L196,760 C196,772 186,778 170,778 L146,778 C138,778 134,772 136,762 Z"/>
    <path d="M208,722 L252,722 L254,762 C256,772 252,778 244,778 L220,778 C204,778 194,772 194,760 Z"/>
    <path fill="${C.offwhite}" d="M134,762 L198,762 L198,778 L146,778 C138,778 134,772 134,762 Z"/>
    <path fill="${C.offwhite}" d="M202,762 L266,762 L266,772 C266,776 262,778 254,778 L202,778 Z"/>
    <g stroke="${C.grey}" stroke-width="2" fill="none"><path d="M152,734 L186,742 M152,746 L186,752"/><path d="M214,742 L248,734 M214,752 L248,746"/></g>
  </g>`,
    ],
    [
      'boots-black',
      `<g fill="${C.ink}" stroke="${C.black}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M148,668 L194,668 L196,758 L140,758 Z"/>
    <path d="M206,668 L252,668 L260,758 L204,758 Z"/>
    <rect x="134" y="756" width="66" height="20" rx="5" fill="${C.charcoal}"/>
    <rect x="200" y="756" width="66" height="20" rx="5" fill="${C.charcoal}"/>
    <g stroke="${C.sand}" stroke-width="2.5" fill="none"><path d="M156,686 L186,694 M156,704 L186,712 M156,722 L186,730"/><path d="M214,694 L244,686 M214,712 L244,704 M214,730 L244,722"/></g>
  </g>`,
    ],
    [
      'loafers-brown',
      `<g fill="${C.leather}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M150,734 L192,734 L194,762 C194,772 184,776 168,776 L146,776 C138,776 136,770 138,762 Z"/>
    <path d="M208,734 L250,734 L262,762 C264,770 262,776 254,776 L232,776 C216,776 206,772 206,762 Z"/>
    <path fill="${C.camel}" d="M158,740 L184,740 L186,752 L156,752 Z"/>
    <path fill="${C.camel}" d="M216,740 L242,740 L244,752 L214,752 Z"/>
  </g>`,
    ],
    [
      'heels-black',
      `<g fill="${C.black}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M152,736 L190,736 L192,760 L146,776 L142,762 Z"/>
    <path d="M210,736 L248,736 L258,762 L254,776 L208,760 Z"/>
    <rect x="180" y="758" width="9" height="22" rx="2"/>
    <rect x="211" y="758" width="9" height="22" rx="2"/>
  </g>`,
    ],
    [
      'runners-rust',
      `<g fill="${C.rust}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M148,724 L192,724 L196,758 C196,770 186,776 170,776 L146,776 C138,776 134,770 136,760 Z"/>
    <path d="M208,724 L252,724 L254,760 C256,770 252,776 244,776 L220,776 C204,776 194,770 194,758 Z"/>
    <path fill="${C.white}" d="M134,760 L198,760 L198,776 L146,776 C138,776 134,770 134,760 Z"/>
    <path fill="${C.white}" d="M202,760 L266,760 L266,770 C266,774 262,776 254,776 L202,776 Z"/>
    <path fill="${C.white}" stroke="none" d="M156,730 L184,738 L182,748 L154,740 Z"/>
    <path fill="${C.white}" stroke="none" d="M216,738 L244,730 L246,740 L218,748 Z"/>
  </g>`,
    ],
  ],

  headwear: [
    [
      'beanie-rust',
      `<g fill="${C.rust}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M148,86 C152,44 248,44 252,86 L254,100 L146,100 Z"/>
    <rect x="142" y="96" width="116" height="26" rx="8" fill="${C.camel}"/>
  </g>`,
    ],
    [
      'cap-navy',
      `<g fill="${C.navy}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M150,92 C154,46 246,46 250,92 L250,100 L150,100 Z"/>
    <path d="M150,96 L110,104 C104,106 104,116 112,118 L152,114 Z" fill="${C.charcoal}"/>
    <circle cx="200" cy="54" r="6" fill="${C.silver}"/>
  </g>`,
    ],
    [
      'bucket-hat-olive',
      `<g fill="${C.olive}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M156,92 C158,50 242,50 244,92 L246,100 L154,100 Z"/>
    <path d="M124,98 L276,98 C282,98 284,112 276,116 L124,116 C116,112 118,98 124,98 Z"/>
  </g>`,
    ],
    [
      'headband-cream',
      `<g fill="${C.cream}" stroke="${C.tan}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M148,80 C160,64 240,64 252,80 L252,98 C240,84 160,84 148,98 Z"/>
  </g>`,
    ],
  ],

  eyewear: [
    [
      'sunglasses-black',
      `<g fill="${C.ink}" stroke="${C.black}" stroke-width="2.5">
    <rect x="154" y="102" width="38" height="26" rx="8"/>
    <rect x="208" y="102" width="38" height="26" rx="8"/>
    <path stroke="${C.ink}" stroke-width="4" fill="none" d="M192,112 L208,112 M154,110 L146,108 M246,110 L254,108"/>
  </g>`,
    ],
    [
      'round-glasses-gold',
      `<g fill="none" stroke="${C.gold}" stroke-width="3.5">
    <circle cx="174" cy="114" r="19"/><circle cx="226" cy="114" r="19"/>
    <path d="M193,114 L207,114 M155,110 L146,106 M245,110 L254,106"/>
  </g>`,
    ],
    [
      'aviators-silver',
      `<g fill="${C.silver}" fill-opacity="0.55" stroke="${C.greyDk}" stroke-width="3">
    <path d="M152,104 L192,104 L186,130 C182,134 160,134 156,128 Z"/>
    <path d="M248,104 L208,104 L214,130 C218,134 240,134 244,128 Z"/>
    <path fill="none" d="M192,108 L208,108 M152,106 L144,104 M248,106 L256,104"/>
  </g>`,
    ],
    [
      'reading-glasses-tortoise',
      `<g fill="none" stroke="${C.leather}" stroke-width="4">
    <rect x="153" y="103" width="40" height="24" rx="6"/>
    <rect x="207" y="103" width="40" height="24" rx="6"/>
    <path d="M193,113 L207,113 M153,109 L145,106 M247,109 L255,106"/>
  </g>`,
    ],
  ],

  face_accessory: [
    [
      'face-mask-white',
      `<g fill="${C.white}" stroke="${C.grey}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M158,132 L242,132 L236,164 C226,176 174,176 164,164 Z"/>
    <path fill="none" stroke="${C.grey}" stroke-width="2.5" d="M158,136 L140,124 M242,136 L260,124 M160,146 L240,146 M162,156 L238,156"/>
  </g>`,
    ],
    [
      'scarf-teal',
      `<g fill="${C.teal}" stroke="${C.navy}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M156,150 C176,168 224,168 244,150 L250,182 C226,196 174,196 150,182 Z"/>
    <path d="M172,188 L200,192 L196,262 L170,258 Z"/>
  </g>`,
    ],
    [
      'bandana-rust',
      `<g fill="${C.rust}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M158,128 L242,128 L200,178 Z"/>
    <path fill="none" stroke="${C.cream}" stroke-width="2.5" d="M172,138 L228,138 M182,150 L218,150"/>
  </g>`,
    ],
  ],

  jewelry: [
    [
      'chain-gold',
      `<g fill="none" stroke="${C.gold}" stroke-width="5" stroke-linecap="round">
    <path d="M178,186 C186,222 214,222 222,186"/>
  </g>`,
    ],
    [
      'pendant-silver',
      `<g fill="none" stroke="${C.silver}" stroke-width="4" stroke-linecap="round">
    <path d="M178,186 C186,232 214,232 222,186"/>
    <circle cx="200" cy="238" r="9" fill="${C.silver}" stroke="${C.greyDk}" stroke-width="2"/>
  </g>`,
    ],
    [
      'necktie-navy',
      `<g fill="${C.navy}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M188,188 L212,188 L216,206 L184,206 Z"/>
    <path d="M186,208 L214,208 L222,300 L200,330 L178,300 Z"/>
  </g>`,
    ],
    [
      'choker-black',
      `<g fill="none" stroke="${C.black}" stroke-width="7" stroke-linecap="round">
    <path d="M180,182 C188,196 212,196 220,182"/>
  </g>`,
    ],
  ],

  waist_accessory: [
    [
      'belt-leather',
      `<g stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <rect x="140" y="390" width="120" height="20" rx="4" fill="${C.leather}"/>
    <rect x="188" y="386" width="26" height="28" rx="4" fill="${C.gold}"/>
  </g>`,
    ],
    [
      'belt-chain-silver',
      `<g stroke="${C.greyDk}" stroke-width="2" fill="${C.silver}">
    <rect x="140" y="394" width="120" height="10" rx="5"/>
    <g fill="none" stroke="${C.silver}" stroke-width="4" stroke-linecap="round"><path d="M232,404 C244,424 240,440 230,450"/></g>
  </g>`,
    ],
    [
      'utility-wrap-olive',
      `<g fill="${C.olive}" stroke="${C.navy}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M138,392 L262,392 L266,470 L134,470 Z"/>
    <path fill="none" stroke="${C.navy}" stroke-width="2" opacity="0.5" d="M164,396 L162,466 M200,396 L200,466 M236,396 L238,466"/>
  </g>`,
    ],
    [
      'wallet-chain',
      `<g fill="none" stroke="${C.silver}" stroke-width="4" stroke-linecap="round">
    <path d="M156,400 C136,428 138,462 158,478"/>
    <path d="M244,400 C264,428 262,462 242,478"/>
  </g>`,
    ],
  ],

  bag: [
    [
      'crossbody-tan',
      `<g fill="${C.tan}" stroke="${C.leather}" stroke-width="2.5" stroke-linejoin="round">
    <path fill="none" stroke="${C.leather}" stroke-width="9" d="M164,196 L246,392"/>
    <rect x="232" y="384" width="58" height="46" rx="7"/>
    <path d="M232,384 L290,384 L290,402 L232,402 Z" fill="${C.camel}"/>
  </g>`,
    ],
    [
      'backpack-navy',
      `<g fill="${C.navy}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">
    <path fill="none" stroke="${C.charcoal}" stroke-width="11" d="M168,194 L160,330 M232,194 L240,330"/>
    <rect x="272" y="230" width="46" height="118" rx="14" fill="${C.charcoal}"/>
    <rect x="280" y="262" width="30" height="34" rx="6" fill="${C.navy}"/>
  </g>`,
    ],
    [
      'tote-cream',
      `<g fill="${C.cream}" stroke="${C.tan}" stroke-width="2.5" stroke-linejoin="round">
    <path fill="none" stroke="${C.tan}" stroke-width="6" d="M282,320 C282,290 316,290 316,320"/>
    <rect x="270" y="316" width="58" height="76" rx="5"/>
    <path fill="none" stroke="${C.tan}" stroke-width="3" d="M270,338 L328,338"/>
  </g>`,
    ],
    [
      'sling-black',
      `<g fill="${C.ink}" stroke="${C.black}" stroke-width="2.5" stroke-linejoin="round">
    <path fill="none" stroke="${C.charcoal}" stroke-width="10" d="M236,196 L156,344"/>
    <path d="M120,320 L184,320 L190,364 C190,372 182,376 172,376 L128,376 C118,376 114,370 114,362 Z"/>
    <path fill="none" stroke="${C.grey}" stroke-width="3" d="M122,340 L184,340"/>
  </g>`,
    ],
  ],
}

/* ── emit ──────────────────────────────────────────────────────────────── */

rmSync(OUT, { recursive: true, force: true })
let count = 0
for (const [layer, pieces] of Object.entries(catalogue)) {
  const dir = path.join(OUT, layer)
  mkdirSync(dir, { recursive: true })
  for (const [slug, body] of pieces) {
    writeFileSync(path.join(dir, `${slug}.svg`), svg(body), 'utf8')
    count++
  }
}
console.log(`generated ${count} svg files across ${Object.keys(catalogue).length} layers -> public/apparel`)

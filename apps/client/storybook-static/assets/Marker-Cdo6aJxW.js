import{r as h,j as s}from"./iframe-CTdOwArN.js";import{a as g}from"./utils-nhH0VOCT.js";const i=(e,t=0,r=255)=>Math.max(t,Math.min(r,e)),m=e=>{const t=e.trim().replace(/^#/,""),r=t.length===3?t.split("").map(n=>n+n).join(""):t;if(!/^([0-9a-fA-F]{6})$/.test(r))return null;const a=parseInt(r,16);return{r:a>>16&255,g:a>>8&255,b:a&255}},p=(e,t,r)=>`#${i(e).toString(16).padStart(2,"0")}${i(t).toString(16).padStart(2,"0")}${i(r).toString(16).padStart(2,"0")}`,d=(e,t)=>{const r=m(e);if(!r)return e;const a=Math.max(0,1-t);return p(Math.round(r.r*a),Math.round(r.g*a),Math.round(r.b*a))},b=e=>{if(!e)return"#FFFFFF";if(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(e))return e;switch(e){case"white":return"#FFFFFF";case"light-gray":return"#E5E7EB";case"bright-red":return"#EF4444";case"bright-orange":return"#F97316";case"bright-yellow":return"#EAB308";case"bright-green":return"#22C55E";case"bright-cyan":return"#06B6D4";case"bright-blue":return"#3B82F6";case"bright-violet":return"#8B5CF6";case"sakura":return"#E2BACF";case"pink":return"#E259A2";case"hard-pink":return"#EE0874";case"skyblue":return"#55D7ED";default:return"#FFFFFF"}},F=h.memo(function({color:t="white",size:r=12,className:a,...n}){const l=b(t),o=d(l,.4),u=Math.round(r*10/12),c=r;return s.jsx("svg",{viewBox:"0 0 12 14",width:u,height:c,"aria-hidden":"true",className:g(a),...n,children:s.jsx("path",{d:"M6 0 L10.5 5.5 C10.8 5.8 11 6.2 11 6.6 V12.1 C11 12.6 10.6 13 10.1 13 H1.9 C1.4 13 1 12.6 1 12.1 V6.6 C1 6.2 1.2 5.8 1.5 5.5 L6 0 Z",fill:l,stroke:o,strokeWidth:1,strokeLinejoin:"round",strokeLinecap:"round"})})});F.__docgenInfo={description:`Pure presentational marker icon used in seekbars and timelines.
No external spacing; animations are controlled by parent via className.`,methods:[],displayName:"Marker",props:{color:{required:!1,tsType:{name:"union",raw:"MarkerColorKey | string",elements:[{name:"union",raw:`| 'white'
| 'light-gray'
| 'bright-red'
| 'bright-orange'
| 'bright-yellow'
| 'bright-green'
| 'bright-cyan'
| 'bright-blue'
| 'bright-violet'
// Legacy keys kept for compatibility
| 'sakura'
| 'pink'
| 'hard-pink'
| 'skyblue'`,elements:[{name:"literal",value:"'white'"},{name:"literal",value:"'light-gray'"},{name:"literal",value:"'bright-red'"},{name:"literal",value:"'bright-orange'"},{name:"literal",value:"'bright-yellow'"},{name:"literal",value:"'bright-green'"},{name:"literal",value:"'bright-cyan'"},{name:"literal",value:"'bright-blue'"},{name:"literal",value:"'bright-violet'"},{name:"literal",value:"'sakura'"},{name:"literal",value:"'pink'"},{name:"literal",value:"'hard-pink'"},{name:"literal",value:"'skyblue'"}]},{name:"string"}]},description:"Accepts palette key or #hex. Defaults to 'white'.",defaultValue:{value:"'white'",computed:!1}},size:{required:!1,tsType:{name:"number"},description:"Height in px. Width scales with the icon ratio. Default: 12",defaultValue:{value:"12",computed:!1}},className:{required:!1,tsType:{name:"string"},description:""}}};export{F as M};

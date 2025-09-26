import{r as W,j as $}from"./iframe-DRhwVLvc.js";import{S as F}from"./index-f6_0lWT1.js";import{c as H,a as J}from"./utils-DvmR7Bys.js";import"./preload-helper-Dp1pzeXC.js";const k=t=>typeof t=="boolean"?`${t}`:t===0?"0":t,S=H,M=(t,a)=>e=>{var i;if((a==null?void 0:a.variants)==null)return S(t,e==null?void 0:e.class,e==null?void 0:e.className);const{variants:d,defaultVariants:s}=a,p=Object.keys(d).map(r=>{const n=e==null?void 0:e[r],c=s==null?void 0:s[r];if(n===null)return null;const o=k(n)||k(c);return d[r][o]}),h=e&&Object.entries(e).reduce((r,n)=>{let[c,o]=n;return o===void 0||(r[c]=o),r},{}),I=a==null||(i=a.compoundVariants)===null||i===void 0?void 0:i.reduce((r,n)=>{let{class:c,className:o,...K}=n;return Object.entries(K).every(U=>{let[x,y]=U;return Array.isArray(y)?y.includes({...s,...h}[x]):{...s,...h}[x]===y})?[...r,c,o]:r},[]);return S(t,p,I,e==null?void 0:e.class,e==null?void 0:e.className)},Q=M("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",{variants:{variant:{default:"bg-primary text-primary-foreground hover:bg-primary/90",destructive:"bg-destructive text-destructive-foreground hover:bg-destructive/90",outline:"border border-input bg-background hover:bg-accent hover:text-accent-foreground",secondary:"bg-secondary text-secondary-foreground hover:bg-secondary/80",ghost:"hover:bg-accent hover:text-accent-foreground",link:"text-primary underline-offset-4 hover:underline"},size:{default:"h-10 px-4 py-2",sm:"h-9 rounded-md px-3",lg:"h-11 rounded-md px-8",icon:"h-10 w-10"}},defaultVariants:{variant:"default",size:"default"}}),b=W.forwardRef(({className:t,variant:a,size:e,asChild:i=!1,...d},s)=>{const p=i?F:"button";return $.jsx(p,{className:J(Q({variant:a,size:e,className:t})),ref:s,...d})});b.displayName="Button";b.__docgenInfo={description:"",methods:[],displayName:"Button",props:{asChild:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}}},composes:["VariantProps"]};const re={title:"Components/Button",component:b,tags:["autodocs"],args:{children:"Button"},argTypes:{variant:{control:"select",options:["default","destructive","outline","secondary","ghost","link"]},size:{control:"select",options:["default","sm","lg","icon"]}}},u={},l={args:{variant:"destructive"}},m={args:{variant:"outline"}},v={args:{variant:"secondary"}},g={args:{variant:"ghost"}},f={args:{variant:"link"}};var V,N,C;u.parameters={...u.parameters,docs:{...(V=u.parameters)==null?void 0:V.docs,source:{originalSource:"{}",...(C=(N=u.parameters)==null?void 0:N.docs)==null?void 0:C.source}}};var j,O,_;l.parameters={...l.parameters,docs:{...(j=l.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    variant: 'destructive'
  }
}`,...(_=(O=l.parameters)==null?void 0:O.docs)==null?void 0:_.source}}};var B,w,D;m.parameters={...m.parameters,docs:{...(B=m.parameters)==null?void 0:B.docs,source:{originalSource:`{
  args: {
    variant: 'outline'
  }
}`,...(D=(w=m.parameters)==null?void 0:w.docs)==null?void 0:D.source}}};var z,E,P;v.parameters={...v.parameters,docs:{...(z=v.parameters)==null?void 0:z.docs,source:{originalSource:`{
  args: {
    variant: 'secondary'
  }
}`,...(P=(E=v.parameters)==null?void 0:E.docs)==null?void 0:P.source}}};var T,A,G;g.parameters={...g.parameters,docs:{...(T=g.parameters)==null?void 0:T.docs,source:{originalSource:`{
  args: {
    variant: 'ghost'
  }
}`,...(G=(A=g.parameters)==null?void 0:A.docs)==null?void 0:G.source}}};var L,R,q;f.parameters={...f.parameters,docs:{...(L=f.parameters)==null?void 0:L.docs,source:{originalSource:`{
  args: {
    variant: 'link'
  }
}`,...(q=(R=f.parameters)==null?void 0:R.docs)==null?void 0:q.source}}};const te=["Default","Destructive","Outline","Secondary","Ghost","Link"];export{u as Default,l as Destructive,g as Ghost,f as Link,m as Outline,v as Secondary,te as __namedExportsOrder,re as default};

import{j as n}from"./iframe-CTdOwArN.js";import{S as x}from"./StackToolbar-C9oZ0IsD.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-nhH0VOCT.js";import"./star-BczdiRMu.js";import"./createLucideIcon-BaknXVm6.js";import"./bookmark-C90aDTgV.js";import"./heart-BmKD09L9.js";import"./layers-Dh6MDn5n.js";const o={id:1,datasetId:"1",name:"Merged Stack",mediaType:"image",assetCount:6,createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-02T00:00:00.000Z",favorited:!1,liked:3,assets:[]},E={title:"StackViewer/StackToolbar",component:x,parameters:{layout:"centered",backgrounds:{default:"dark"}},decorators:[b=>n.jsx("div",{className:"relative h-40 w-80 rounded-xl bg-slate-900 p-6",children:n.jsx(b,{})})],args:{stack:o,isListMode:!0,isGesturing:!1,isCurrentAssetFavorited:!1,onStackFavoriteToggle:()=>console.log("stack favorite"),onAssetFavoriteToggle:()=>console.log("page bookmark"),onLikeToggle:()=>console.log("like"),onListModeToggle:()=>console.log("list")}},e={},a={args:{isListMode:!1}},s={args:{isCurrentAssetFavorited:!0}},r={args:{stack:{...o,favorited:!0}}},t={args:{stack:{...o,assetCount:1,assetsCount:1}}};var c,i,d;e.parameters={...e.parameters,docs:{...(c=e.parameters)==null?void 0:c.docs,source:{originalSource:"{}",...(d=(i=e.parameters)==null?void 0:i.docs)==null?void 0:d.source}}};var l,m,g;a.parameters={...a.parameters,docs:{...(l=a.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    isListMode: false
  }
}`,...(g=(m=a.parameters)==null?void 0:m.docs)==null?void 0:g.source}}};var u,p,k;s.parameters={...s.parameters,docs:{...(u=s.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    isCurrentAssetFavorited: true
  }
}`,...(k=(p=s.parameters)==null?void 0:p.docs)==null?void 0:k.source}}};var S,f,v;r.parameters={...r.parameters,docs:{...(S=r.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    stack: {
      ...baseStack,
      favorited: true
    }
  }
}`,...(v=(f=r.parameters)==null?void 0:f.docs)==null?void 0:v.source}}};var C,F,T;t.parameters={...t.parameters,docs:{...(C=t.parameters)==null?void 0:C.docs,source:{originalSource:`{
  args: {
    stack: {
      ...baseStack,
      assetCount: 1,
      assetsCount: 1
    }
  }
}`,...(T=(F=t.parameters)==null?void 0:F.docs)==null?void 0:T.source}}};const Z=["Default","SingleMode","CurrentPageFavorited","StackFavorited","SinglePageStack"];export{s as CurrentPageFavorited,e as Default,a as SingleMode,t as SinglePageStack,r as StackFavorited,Z as __namedExportsOrder,E as default};

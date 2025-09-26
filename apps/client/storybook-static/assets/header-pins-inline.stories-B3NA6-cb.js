import{j as n}from"./iframe-DRhwVLvc.js";import{H as g}from"./header-icon-button-CASr5z4F.js";import{L as f,B as x}from"./lucide-react-CM-xkUDC.js";import{a as y}from"./app-header-BYS_3TOy.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-DvmR7Bys.js";import"./createLucideIcon-C6efQrdH.js";import"./layers-BfwddKMb.js";import"./check-BFu3tv4p.js";import"./x-DUuMXKGJ.js";import"./filter-LDkW56sM.js";import"./folder-open-B_ziX6_8.js";import"./folder-B6GMTYHv.js";import"./heart-BfoFZ8RC.js";import"./house-iFAJJLG5.js";import"./shuffle-CH_3N2s6.js";import"./star-sXhfiEUj.js";import"./tag-CNM2GzK7.js";import"./user-DcZ4BGm4.js";function l({navigationPins:r,stackPins:i,isActive:a,onNavClick:o,onStackClick:s}){const u=e=>{const m=f[e];return m?n.jsx(m,{size:18}):n.jsx(x,{size:18})};return n.jsxs("div",{className:"flex items-center gap-4",children:[r.length>0&&n.jsx("div",{className:"flex items-center gap-2",children:r.map(e=>n.jsx(g,{onClick:()=>o==null?void 0:o(e),title:e.name,isActive:a==null?void 0:a(e),children:u(e.icon)},e.id))}),r.length>0&&i.length>0&&n.jsx(y,{}),i.length>0&&n.jsx("div",{className:"flex items-center gap-1",children:i.map(e=>n.jsx("button",{onClick:()=>s==null?void 0:s(e),className:"px-3 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80",style:{backgroundColor:e.color,color:"white"},title:`Go to ${e.title}`,children:e.title},e.id))})]})}l.__docgenInfo={description:"",methods:[],displayName:"HeaderPinsInline",props:{navigationPins:{required:!0,tsType:{name:"Array",elements:[{name:"NavPin"}],raw:"NavPin[]"},description:""},stackPins:{required:!0,tsType:{name:"Array",elements:[{name:"StackPin"}],raw:"StackPin[]"},description:""},isActive:{required:!1,tsType:{name:"signature",type:"function",raw:"(pin: NavPin) => boolean",signature:{arguments:[{type:{name:"NavPin"},name:"pin"}],return:{name:"boolean"}}},description:""},onNavClick:{required:!1,tsType:{name:"signature",type:"function",raw:"(pin: NavPin) => void",signature:{arguments:[{type:{name:"NavPin"},name:"pin"}],return:{name:"void"}}},description:""},onStackClick:{required:!1,tsType:{name:"signature",type:"function",raw:"(pin: StackPin) => void",signature:{arguments:[{type:{name:"StackPin"},name:"pin"}],return:{name:"void"}}},description:""}}};const E={title:"Header/PinsInline",component:l},t={args:{navigationPins:[{id:1,name:"Overview",icon:"Home"},{id:2,name:"Likes",icon:"Heart"}],stackPins:[{id:"a",title:"Project Alpha",color:"#6366F1"},{id:"b",title:"Beta",color:"#10B981"}]}};var p,d,c;t.parameters={...t.parameters,docs:{...(p=t.parameters)==null?void 0:p.docs,source:{originalSource:`{
  args: {
    navigationPins: [{
      id: 1,
      name: 'Overview',
      icon: 'Home'
    }, {
      id: 2,
      name: 'Likes',
      icon: 'Heart'
    }],
    stackPins: [{
      id: 'a',
      title: 'Project Alpha',
      color: '#6366F1'
    }, {
      id: 'b',
      title: 'Beta',
      color: '#10B981'
    }]
  }
}`,...(c=(d=t.parameters)==null?void 0:d.docs)==null?void 0:c.source}}};const F=["Default"];export{t as Default,F as __namedExportsOrder,E as default};

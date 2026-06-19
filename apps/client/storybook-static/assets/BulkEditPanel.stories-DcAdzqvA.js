import{j as a}from"./iframe-CTdOwArN.js";import{a as o}from"./BulkEditPanel-df5q3Jg5.js";import"./preload-helper-Dp1pzeXC.js";import"./useStore-l13CFtR4.js";import"./index-jYrDaifw.js";import"./utils-nhH0VOCT.js";import"./select-BAl7OOHx.js";import"./index-DfQcHIfa.js";import"./index-hgXeBpwa.js";import"./index-D0QvVAqs.js";import"./index-D7-VQY5Z.js";import"./Combination-B9ZnaouW.js";import"./index-BRSyriRg.js";import"./index-Do4PWZlk.js";import"./index-BsgOZtz9.js";import"./chevron-down-DmS_sFV9.js";import"./createLucideIcon-BaknXVm6.js";import"./check-B8DV0IFK.js";import"./chevron-up-BD-7DzAT.js";import"./x-DDKB9rBG.js";import"./tag-1Y8rQ5UA.js";import"./search-JcwOrV17.js";import"./monitor-k_1NHGQH.js";const _={title:"Components/BulkEditPanel",component:o,parameters:{layout:"fullscreen",docs:{description:{component:"モバイル環境では右方向へスワイプするとパネルを閉じられます。"}}}},m=new Set([1,2,3]),e={render:()=>a.jsx("div",{className:"min-h-screen bg-slate-100",children:a.jsx(o,{isOpen:!0,onClose:()=>console.log("close panel"),selectedItems:m,onSave:s=>console.log("apply bulk updates",s),items:[{id:1,tags:["landscape","sunset"],author:"Alice"},{id:2,tags:["portrait"],author:"Bob"},{id:3,tags:["travel"],author:"Charlie"}]})})},t={render:()=>a.jsx("div",{className:"min-h-screen bg-slate-100",children:a.jsx(o,{isOpen:!0,onClose:()=>console.log("close panel"),selectedItems:m,onSave:s=>console.log("apply bulk updates",s),items:[{id:1,tags:[{id:"tag-1",name:"landscape"},{id:"tag-2",title:"sunset"}],author:{id:1,name:"Alice"}},{id:2,tags:[{id:"tag-3",displayName:"portrait"}],author:{id:2,name:"Bob"}},{id:3,tags:["travel"],author:"Charlie"}]})})};var r,i,l;e.parameters={...e.parameters,docs:{...(r=e.parameters)==null?void 0:r.docs,source:{originalSource:`{
  render: () => <div className="min-h-screen bg-slate-100">
      <BulkEditPanel isOpen onClose={() => console.log('close panel')} selectedItems={selectedItems} onSave={updates => console.log('apply bulk updates', updates)} items={[{
      id: 1,
      tags: ['landscape', 'sunset'],
      author: 'Alice'
    }, {
      id: 2,
      tags: ['portrait'],
      author: 'Bob'
    }, {
      id: 3,
      tags: ['travel'],
      author: 'Charlie'
    }]} />
    </div>
}`,...(l=(i=e.parameters)==null?void 0:i.docs)==null?void 0:l.source}}};var n,p,d;t.parameters={...t.parameters,docs:{...(n=t.parameters)==null?void 0:n.docs,source:{originalSource:`{
  render: () => <div className="min-h-screen bg-slate-100">
      <BulkEditPanel isOpen onClose={() => console.log('close panel')} selectedItems={selectedItems} onSave={updates => console.log('apply bulk updates', updates)} items={[{
      id: 1,
      tags: [{
        id: 'tag-1',
        name: 'landscape'
      }, {
        id: 'tag-2',
        title: 'sunset'
      }],
      author: {
        id: 1,
        name: 'Alice'
      }
    }, {
      id: 2,
      tags: [{
        id: 'tag-3',
        displayName: 'portrait'
      }],
      author: {
        id: 2,
        name: 'Bob'
      }
    }, {
      id: 3,
      tags: ['travel'],
      author: 'Charlie'
    }]} />
    </div>
}`,...(d=(p=t.parameters)==null?void 0:p.docs)==null?void 0:d.source}}};const w=["Default","WithObjectValues"];export{e as Default,t as WithObjectValues,w as __namedExportsOrder,_ as default};

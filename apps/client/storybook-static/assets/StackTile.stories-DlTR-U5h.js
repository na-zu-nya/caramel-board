import{j as c}from"./iframe-CTdOwArN.js";import{S as m}from"./StackTile-BQ919iZT.js";import"./preload-helper-Dp1pzeXC.js";import"./context-menu-Cu9eYN6Y.js";import"./Combination-B9ZnaouW.js";import"./index-D0QvVAqs.js";import"./index-DfQcHIfa.js";import"./index-hgXeBpwa.js";import"./index-BRSyriRg.js";import"./index-BsgOZtz9.js";import"./utils-nhH0VOCT.js";import"./circle-Dk719T8s.js";import"./createLucideIcon-BaknXVm6.js";import"./check-B8DV0IFK.js";import"./thumbnailPath-BSkYWzFt.js";import"./book-w-j5v5-8.js";import"./star-BczdiRMu.js";import"./heart-BmKD09L9.js";import"./notebook-text-8CX01XC2.js";import"./trash-2-DEf8fQe9.js";const T={title:"Stack/StackTile",component:m},t={args:{thumbnailUrl:"",title:"Sample Stack",pageCount:12,favorited:!1,likeCount:3,onDownload:()=>{console.log("download originals")},onRemoveLike:()=>{console.log("unlike stack")},onRemoveStack:()=>{console.log("remove stack")}}},e={args:{asChild:!0,thumbnailUrl:"https://picsum.photos/id/24/320/320",nativeImageDragUrl:"https://picsum.photos/id/24/1600/1600",title:"Linked Stack",pageCount:8,favorited:!0,likeCount:12,onDownload:()=>{console.log("download linked stack originals")},children:c.jsx("a",{href:"/library/1/stacks/1",children:"Linked Stack"}),dragHandlers:{draggable:!0,onDragStart:o=>{o.metaKey||o.ctrlKey||o.altKey||o.dataTransfer.setData("text/plain","stack-item:1")},onDragEnd:()=>{console.log("drag end")}}}};var a,r,n;t.parameters={...t.parameters,docs:{...(a=t.parameters)==null?void 0:a.docs,source:{originalSource:`{
  args: {
    thumbnailUrl: '',
    title: 'Sample Stack',
    pageCount: 12,
    favorited: false,
    likeCount: 3,
    onDownload: () => {
      // Storybook用のダミー動作
      console.log('download originals');
    },
    onRemoveLike: () => {
      // Storybook用のダミー動作
      console.log('unlike stack');
    },
    onRemoveStack: () => {
      // Storybook用のダミー動作
      console.log('remove stack');
    }
  }
}`,...(n=(r=t.parameters)==null?void 0:r.docs)==null?void 0:n.source}}};var i,s,l;e.parameters={...e.parameters,docs:{...(i=e.parameters)==null?void 0:i.docs,source:{originalSource:`{
  args: {
    asChild: true,
    thumbnailUrl: 'https://picsum.photos/id/24/320/320',
    nativeImageDragUrl: 'https://picsum.photos/id/24/1600/1600',
    title: 'Linked Stack',
    pageCount: 8,
    favorited: true,
    likeCount: 12,
    onDownload: () => {
      // Storybook用のダミー動作
      console.log('download linked stack originals');
    },
    children: <a href="/library/1/stacks/1">Linked Stack</a>,
    dragHandlers: {
      draggable: true,
      onDragStart: event => {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        event.dataTransfer.setData('text/plain', 'stack-item:1');
      },
      onDragEnd: () => {
        console.log('drag end');
      }
    }
  }
}`,...(l=(s=e.parameters)==null?void 0:s.docs)==null?void 0:l.source}}};const j=["Basic","AsLink"];export{e as AsLink,t as Basic,j as __namedExportsOrder,T as default};

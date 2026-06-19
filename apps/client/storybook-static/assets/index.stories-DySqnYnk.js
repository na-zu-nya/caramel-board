import{r as u,j as c}from"./iframe-CTdOwArN.js";import{G as k}from"./index-Dg3Q-tLO.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-nhH0VOCT.js";import"./loader-circle-CYq-mhdJ.js";import"./createLucideIcon-BaknXVm6.js";import"./grid-3x3-CAUJkeVN.js";const U={title:"UI/GridColumnSlider",component:k,args:{value:5,onChange:()=>{}},decorators:[e=>c.jsx("div",{className:"relative h-40 w-[420px] bg-gray-100 dark:bg-neutral-950",children:c.jsx(e,{})})]},a={},r={args:{value:12}},s={args:{value:8,badgeLabel:"custom"}},t={args:{value:2,disabled:!0}},o={args:{value:5,loading:!0}},n={render:e=>{const[y,I]=u.useState(e.value??5),A=u.useCallback(B=>{I(B)},[]);return c.jsx(k,{...e,value:y,onChange:A})}};var l,d,m;a.parameters={...a.parameters,docs:{...(l=a.parameters)==null?void 0:l.docs,source:{originalSource:"{}",...(m=(d=a.parameters)==null?void 0:d.docs)==null?void 0:m.source}}};var i,p,g;r.parameters={...r.parameters,docs:{...(i=r.parameters)==null?void 0:i.docs,source:{originalSource:`{
  args: {
    value: 12
  }
}`,...(g=(p=r.parameters)==null?void 0:p.docs)==null?void 0:g.source}}};var v,h,b;s.parameters={...s.parameters,docs:{...(v=s.parameters)==null?void 0:v.docs,source:{originalSource:`{
  args: {
    value: 8,
    badgeLabel: 'custom'
  }
}`,...(b=(h=s.parameters)==null?void 0:h.docs)==null?void 0:b.source}}};var x,C,S;t.parameters={...t.parameters,docs:{...(x=t.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    value: 2,
    disabled: true
  }
}`,...(S=(C=t.parameters)==null?void 0:C.docs)==null?void 0:S.source}}};var f,j,E;o.parameters={...o.parameters,docs:{...(f=o.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    value: 5,
    loading: true
  }
}`,...(E=(j=o.parameters)==null?void 0:j.docs)==null?void 0:E.source}}};var V,G,L;n.parameters={...n.parameters,docs:{...(V=n.parameters)==null?void 0:V.docs,source:{originalSource:`{
  render: args => {
    const [value, setValue] = useState(args.value ?? 5);
    const handleChange = useCallback((nextValue: number) => {
      setValue(nextValue);
    }, []);
    return <GridColumnSlider {...args} value={value} onChange={handleChange} />;
  }
}`,...(L=(G=n.parameters)==null?void 0:G.docs)==null?void 0:L.source}}};const q=["Default","Active","WithBadge","Empty","Loading","Interactive"];export{r as Active,a as Default,t as Empty,n as Interactive,o as Loading,s as WithBadge,q as __namedExportsOrder,U as default};

import{j as e}from"./iframe-DRhwVLvc.js";import{A as i,a as l}from"./app-header-BYS_3TOy.js";import{H as r}from"./header-icon-button-CASr5z4F.js";import{F as c}from"./filter-LDkW56sM.js";import{C as d}from"./check-BFu3tv4p.js";import{M as p,S as m}from"./shuffle-CH_3N2s6.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-DvmR7Bys.js";import"./createLucideIcon-C6efQrdH.js";const S={title:"App Shell/AppHeader",component:i,parameters:{layout:"fullscreen"},args:{withSidebar:!1}},a={render:o=>e.jsx("div",{style:{height:80},children:e.jsx(i,{...o,backgroundColor:"rgba(59,130,246,0.5)",left:e.jsxs(e.Fragment,{children:[e.jsx(r,{"aria-label":"Toggle sidebar",children:e.jsx(p,{size:18})}),e.jsx(r,{"aria-label":"Shuffle",children:e.jsx(m,{size:18})})]}),center:e.jsx("span",{className:"text-sm opacity-80",children:"Pins / Center content"}),right:e.jsxs(e.Fragment,{children:[e.jsx(r,{"aria-label":"Filter",children:e.jsx(c,{size:18})}),e.jsx(r,{isActive:!0,"aria-label":"Select mode",children:e.jsx(d,{size:18})}),e.jsx(l,{}),e.jsx("div",{className:"text-xs opacity-80",children:"Custom actions"})]})})})};var t,s,n;a.parameters={...a.parameters,docs:{...(t=a.parameters)==null?void 0:t.docs,source:{originalSource:`{
  render: args => <div style={{
    height: 80
  }}>
      <AppHeader {...args} backgroundColor="rgba(59,130,246,0.5)" left={<>
            <HeaderIconButton aria-label="Toggle sidebar">
              <Menu size={18} />
            </HeaderIconButton>
            <HeaderIconButton aria-label="Shuffle">
              <Shuffle size={18} />
            </HeaderIconButton>
          </>} center={<span className="text-sm opacity-80">Pins / Center content</span>} right={<>
            <HeaderIconButton aria-label="Filter">
              <Filter size={18} />
            </HeaderIconButton>
            <HeaderIconButton isActive aria-label="Select mode">
              <Check size={18} />
            </HeaderIconButton>
            <AppHeaderDivider />
            <div className="text-xs opacity-80">Custom actions</div>
          </>} />
    </div>
}`,...(n=(s=a.parameters)==null?void 0:s.docs)==null?void 0:n.source}}};const A=["Default"];export{a as Default,A as __namedExportsOrder,S as default};

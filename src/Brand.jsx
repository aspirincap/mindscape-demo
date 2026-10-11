import React from 'react';

export function Brand({ className = '', onClick }) {
  return <a className={`brand ${className}`.trim()} href="/" aria-label="Mindscape 意境首页" onClick={onClick}>
    <span className="brand-orbit" aria-hidden="true"/>
    <span>mindscape<span className="brand-divider" aria-hidden="true"/>意境</span>
  </a>;
}

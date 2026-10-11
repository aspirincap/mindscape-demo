import React from 'react';

export function Brand({ className = '', onClick }) {
  return <a className={`brand ${className}`.trim()} href="/" aria-label="在野 Go Wild 首页" onClick={onClick}>
    <span className="brand-orbit" aria-hidden="true"/>
    <span>在野<span className="brand-divider" aria-hidden="true"/>Go Wild</span>
  </a>;
}

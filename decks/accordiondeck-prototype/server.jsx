import React from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './app.jsx';

export const render = (variant, initial) =>
  renderToString(<App variant={variant} ctl={{ calls: [] }} initial={initial} />);
